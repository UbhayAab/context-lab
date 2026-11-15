// Read model for the UI: context registry, questions, recorded runs, release state and gate.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTEXT_VERSIONS, METRIC_VERSIONS, ONTOLOGY, SKILL, renderContext } from '../context/versions.mjs';
import { QUESTIONS } from '../eval/questions.mjs';
import { goldenAnswers } from '../eval/golden.mjs';
import { summarize } from '../harness/run.mjs';
import { analyzeFeedback } from '../eval/feedback.mjs';
import { consensus, impact } from '../eval/consensus.mjs';

const RUNS_ROOT = fileURLToPath(new URL('../runs/', import.meta.url));
const STATE_DIR = fileURLToPath(new URL('../state/', import.meta.url));
const RELEASES_FILE = join(STATE_DIR, 'releases.json');

const readJson = (p, fallback = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

function splitRef(ref) {
  const [path, version] = ref.split('@');
  const [, kind, name] = path.split('/');
  return { path, version, kind, name };
}

export function releaseState() {
  const saved = readJson(RELEASES_FILE);
  if (saved) return saved;
  return {
    active: '1.0.0',
    candidate: '1.1.0',
    history: [{ version: '1.0.0', status: 'active', at: '2026-10-28T00:00:00.000Z', note: 'Initial definition from the analytics wiki.' }],
  };
}

export function contextPayload() {
  const rel = releaseState();
  const statusOf = (v) => (v === rel.active ? 'active' : v === rel.candidate ? 'pending_review' : METRIC_VERSIONS[v].status === 'proposed' ? 'proposed' : 'superseded');
  const single = (a) => {
    const { path, version, kind } = splitRef(a.ref);
    return { ref: path, kind, title: a.title, versions: [{ version, status: 'active', body: a.body, changelog: null }] };
  };
  const metricRef = splitRef(METRIC_VERSIONS['1.0.0'].ref);
  return {
    artifacts: [
      { ref: metricRef.path, kind: 'metric', title: 'Net revenue',
        versions: CONTEXT_VERSIONS.map((v) => {
          const m = METRIC_VERSIONS[v];
          const p = m.proposal;
          return {
            version: v, status: statusOf(v), body: m.body, changelog: m.changelog ?? null,
            ...(p ? { proposal: { proposedBy: p.proposedBy, basedOn: p.basedOn, createdAt: p.createdAt, assumptions: p.assumptions, evidence: p.evidence, evidenceRunIds: p.evidenceRunIds, sawGoldenAnswers: p.sawGoldenAnswers, sawHumanFix: p.sawHumanFix } } : {}),
          };
        }) },
      single(ONTOLOGY),
      single(SKILL),
    ],
    releases: rel,
    rendered: Object.fromEntries(CONTEXT_VERSIONS.map((v) => [v, renderContext(v)])),
  };
}

export function questionsPayload() {
  const golden = goldenAnswers();
  return QUESTIONS.map((q) => ({ id: q.id, text: q.text, golden: golden[q.id] }));
}

function readResults(dir) {
  const p = join(dir, 'results.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function listRuns() {
  if (!existsSync(RUNS_ROOT)) return [];
  return readdirSync(RUNS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(RUNS_ROOT, d.name);
      const manifest = readJson(join(dir, 'manifest.json'));
      if (!manifest) return null;
      const summary = readJson(join(dir, 'summary.json'));
      const results = readResults(dir);
      const total = manifest.combos.length * manifest.versions.length * manifest.questions.length;
      return {
        runId: manifest.runId, status: summary ? 'complete' : 'running', variant: manifest.variant ?? 'default',
        startedAt: manifest.startedAt, finishedAt: summary?.finishedAt ?? null,
        combos: manifest.combos.map((c) => c.id), versions: manifest.versions,
        done: results.length, total, cells: summary?.cells ?? summarize(results),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function loadRun(runId) {
  if (!/^[\w.-]+$/.test(runId)) return null;
  const dir = join(RUNS_ROOT, runId);
  const manifest = readJson(join(dir, 'manifest.json'));
  if (!manifest) return null;
  const results = readResults(dir);
  return { manifest, cells: readJson(join(dir, 'summary.json'))?.cells ?? summarize(results), results };
}

/** What agents said about a release, lined up against the reviewed fix (the candidate's changelog). */
export function feedbackPayload(runId, version, variant = 'default') {
  const v = version ?? releaseState().history[0]?.version ?? CONTEXT_VERSIONS[0];
  // The newest run that actually answered on this version: a later run may cover other versions only.
  const run = runId
    ? listRuns().find((r) => r.runId === runId)
    : listRuns().find((r) => r.status === 'complete' && r.variant === variant && r.versions.includes(v));
  if (!run) return null;
  const fixVersion = CONTEXT_VERSIONS.find((x) => METRIC_VERSIONS[x].changelog) ?? null;
  return { runId: run.runId, variant: run.variant, fixVersion, ...analyzeFeedback(loadRun(run.runId).results, v, fixVersion ? METRIC_VERSIONS[fixVersion].changelog : []) };
}

/**
 * Every unprompted run merged: newest record wins per (agent, context version, question).
 * Lets versions recorded in different runs be compared, e.g. an AI proposal evaluated later.
 */
export function mergedResults() {
  const latest = new Map();
  const runs = listRuns().filter((r) => r.status === 'complete' && r.variant === 'default').reverse(); // oldest first
  for (const run of runs) {
    for (const r of loadRun(run.runId).results) latest.set(`${r.combo}|${r.contextVersion}|${r.questionId}`, r);
  }
  return [...latest.values()];
}

/** Matrix cells over the merged results, plus which run each cell came from. */
export function combinedPayload() {
  const results = mergedResults();
  const source = {};
  for (const r of results) source[`${r.combo}|${r.contextVersion}`] = r.runId;
  return { cells: summarize(results), source, versions: [...new Set(results.map((r) => r.contextVersion))].sort(), combos: [...new Set(results.map((r) => r.combo))] };
}

export function consensusPayload() {
  const results = mergedResults();
  return Object.fromEntries([...new Set(results.map((r) => r.contextVersion))].sort().map((v) => [v, consensus(results, v)]));
}

/** Impact of every version change worth showing: active -> each other version, candidate -> proposals. */
export function impactsPayload() {
  const results = mergedResults();
  const have = new Set(results.map((r) => r.contextVersion));
  const rel = releaseState();
  const pairs = [];
  for (const v of CONTEXT_VERSIONS) if (v !== rel.active) pairs.push([rel.active, v]);
  if (rel.candidate) for (const v of CONTEXT_VERSIONS) if (METRIC_VERSIONS[v].status === 'proposed') pairs.push([rel.candidate, v]);
  return Object.fromEntries(pairs.filter(([a, b]) => have.has(a) && have.has(b)).map(([a, b]) => [`${a}->${b}`, impact(results, a, b)]));
}

/** Release gate: candidate must not lose to the active release on any agent or question. */
export function evaluateGate(candidate) {
  const { active } = releaseState();
  const results = mergedResults();
  const key = (r) => `${r.combo}|${r.questionId}`;
  const onActive = new Map(results.filter((r) => r.contextVersion === active).map((r) => [key(r), r]));
  const onCandidate = results.filter((r) => r.contextVersion === candidate);
  const combos = [...new Set(onActive.size ? [...onActive.values()].map((r) => r.combo) : [])];
  if (!onActive.size || !onCandidate.length) return { ok: false, reasons: [`No evaluation covers both ${active} and ${candidate}.`], evidenceRunId: null };
  const reasons = [];
  for (const r of onCandidate) {
    const before = onActive.get(key(r));
    if (before?.correct && !r.correct) reasons.push(`${r.combo} regressed on ${r.questionId}`);
  }
  for (const combo of combos) {
    const score = (rs) => rs.filter((r) => r.combo === combo && r.correct).length;
    const evaluated = onCandidate.some((r) => r.combo === combo);
    if (!evaluated) reasons.push(`${combo} has not been evaluated on ${candidate}`);
    else if (score(onCandidate) < score([...onActive.values()])) reasons.push(`${combo} scores lower on ${candidate}`);
  }
  const runIds = [...new Set(onCandidate.map((r) => r.runId))];
  return { ok: reasons.length === 0, reasons, evidenceRunId: runIds.join(',') };
}

export function approveRelease(version, note) {
  const rel = releaseState();
  if (version !== rel.candidate) return { error: 'not-candidate', reasons: [`${version} is not the pending candidate.`] };
  const gate = evaluateGate(version);
  if (!gate.ok) return { error: 'gate', ...gate };
  const at = new Date().toISOString();
  const next = {
    active: version, candidate: null,
    history: [
      ...rel.history.map((h) => (h.version === rel.active ? { ...h, status: 'superseded' } : h)),
      { version, status: 'active', at, note, evidenceRunId: gate.evidenceRunId },
    ],
  };
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(RELEASES_FILE, JSON.stringify(next, null, 2));
  return { releases: next };
}
