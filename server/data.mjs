// Read model for the UI: context registry, questions, recorded runs, release state and gate.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTEXT_VERSIONS, METRIC_VERSIONS, ONTOLOGY, SKILL, renderContext } from '../context/versions.mjs';
import { QUESTIONS } from '../eval/questions.mjs';
import { goldenAnswers } from '../eval/golden.mjs';
import { summarize } from '../harness/run.mjs';
import { analyzeFeedback } from '../eval/feedback.mjs';

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
  const statusOf = (v) => (v === rel.active ? 'active' : v === rel.candidate ? 'pending_review' : 'superseded');
  const single = (a) => {
    const { path, version, kind } = splitRef(a.ref);
    return { ref: path, kind, title: a.title, versions: [{ version, status: 'active', body: a.body, changelog: null }] };
  };
  const metricRef = splitRef(METRIC_VERSIONS['1.0.0'].ref);
  return {
    artifacts: [
      { ref: metricRef.path, kind: 'metric', title: 'Net revenue',
        versions: CONTEXT_VERSIONS.map((v) => ({ version: v, status: statusOf(v), body: METRIC_VERSIONS[v].body, changelog: METRIC_VERSIONS[v].changelog ?? null })) },
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
  const run = runId
    ? listRuns().find((r) => r.runId === runId)
    : listRuns().find((r) => r.status === 'complete' && r.variant === variant);
  if (!run) return null;
  const v = version ?? releaseState().history[0]?.version ?? CONTEXT_VERSIONS[0];
  const fixVersion = CONTEXT_VERSIONS.find((x) => METRIC_VERSIONS[x].changelog) ?? null;
  return { runId: run.runId, variant: run.variant, fixVersion, ...analyzeFeedback(loadRun(run.runId).results, v, fixVersion ? METRIC_VERSIONS[fixVersion].changelog : []) };
}

/** Release gate: candidate must not lose to the active release on any combo or question. */
export function evaluateGate(candidate) {
  const { active } = releaseState();
  const run = listRuns().find((r) => r.status === 'complete' && r.variant === 'default' && r.versions.includes(active) && r.versions.includes(candidate));
  if (!run) return { ok: false, reasons: [`No complete evaluation run covers both ${active} and ${candidate}.`], evidenceRunId: null };
  const { results } = loadRun(run.runId);
  const key = (r) => `${r.combo}|${r.questionId}`;
  const onActive = new Map(results.filter((r) => r.contextVersion === active).map((r) => [key(r), r]));
  const reasons = [];
  for (const r of results.filter((x) => x.contextVersion === candidate)) {
    const before = onActive.get(key(r));
    if (before?.correct && !r.correct) reasons.push(`${r.combo} regressed on ${r.questionId}`);
  }
  for (const combo of run.combos) {
    const cell = (v) => run.cells.find((c) => c.combo === combo && c.contextVersion === v);
    if ((cell(candidate)?.correct ?? 0) < (cell(active)?.correct ?? 0)) reasons.push(`${combo} scores lower on ${candidate}`);
  }
  return { ok: reasons.length === 0, reasons, evidenceRunId: run.runId };
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
