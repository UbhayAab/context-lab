// Matrix runner: (harness x model) x context release x question -> scored, traced runs.
// Usage:
//   node --no-warnings harness/run.mjs --combos claude-code:haiku,codex:gpt-6.1-sol \
//        --versions 1.0.0,1.1.0 --questions all --concurrency 4 --label smoke
// Combo syntax: <harness>:<model>[@bridge][#effort]
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DB_PATH } from '../data/seed.mjs';
import { QUESTIONS } from '../eval/questions.mjs';
import { goldenAnswers, isCorrect } from '../eval/golden.mjs';
import { CONTEXT_VERSIONS, renderContext } from '../context/versions.mjs';
import { PROMPT_VARIANTS, buildPrompt, createWorkspace, parseAnswer } from './workspace.mjs';
import * as claudeCode from './adapters/claude-code.mjs';
import * as codex from './adapters/codex.mjs';
import * as grok from './adapters/grok.mjs';

const ADAPTERS = { [claudeCode.HARNESS]: claudeCode, [codex.HARNESS]: codex, [grok.HARNESS]: grok };
const RUNS_ROOT = fileURLToPath(new URL('../runs/', import.meta.url));
const DEFAULT_TIMEOUT_MS = 300_000;

export function parseCombo(spec) {
  const m = spec.trim().match(/^([\w-]+):([^@#]+)(?:@(\w+))?(?:#(\w+))?$/);
  if (!m) throw new Error(`Bad combo "${spec}". Expected harness:model[@bridge][#effort]`);
  const [, harness, model, via, effort] = m;
  if (!ADAPTERS[harness]) throw new Error(`Unknown harness "${harness}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
  return { harness, model, via: via ?? null, effort: effort ?? null, id: spec.trim() };
}

function parseArgs(argv) {
  const out = { concurrency: 3, versions: CONTEXT_VERSIONS, questions: 'all', label: 'run', timeoutMs: DEFAULT_TIMEOUT_MS, variant: 'default' };
  for (let i = 0; i < argv.length; i += 2) {
    const [k, v] = [argv[i].replace(/^--/, ''), argv[i + 1]];
    if (k === 'combos') out.combos = v.split(',').map(parseCombo);
    else if (k === 'versions') out.versions = v.split(',');
    else if (k === 'questions') out.questions = v;
    else if (k === 'concurrency') out.concurrency = Number(v);
    else if (k === 'label') out.label = v;
    else if (k === 'timeout') out.timeoutMs = Number(v) * 1000;
    else if (k === 'variant') { if (!PROMPT_VARIANTS.includes(v)) throw new Error(`--variant must be one of ${PROMPT_VARIANTS}`); out.variant = v; }
    else throw new Error(`Unknown flag --${k}`);
  }
  if (!out.combos?.length) throw new Error('--combos is required');
  return out;
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function cliVersion(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  return (r.stdout || r.stderr || '').trim().split('\n')[0] || null;
}

async function pool(tasks, n, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) { const t = tasks[next++]; await fn(t); }
  });
  await Promise.all(workers);
}

export async function runMatrix(opts, { onResult } = {}) {
  const golden = goldenAnswers();
  const questions = opts.questions === 'all' ? QUESTIONS : QUESTIONS.filter((q) => opts.questions.split(',').includes(q.id));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${opts.label}`;
  const dir = join(RUNS_ROOT, runId);
  mkdirSync(dir, { recursive: true });

  if (opts.combos.some((c) => c.via === 'bridge')) {
    const ensure = spawnSync('node', [join(process.env.USERPROFILE ?? '', 'tools', 'codex-bridge', 'ensure.mjs')], { stdio: 'inherit' });
    if (ensure.status !== 0) throw new Error('codex-bridge did not start; @bridge combos cannot run');
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    runId, startedAt: new Date().toISOString(), variant: opts.variant ?? 'default',
    combos: opts.combos, versions: opts.versions, questions: questions.map((q) => q.id),
    dataset: { sha16: sha(readFileSync(DB_PATH)) },
    context: Object.fromEntries(opts.versions.map((v) => [v, { sha16: sha(renderContext(v)) }])),
    clients: { claude: cliVersion('claude', ['--version']) },
    scoring: 'correct if |answer - golden| <= 0.05 USD',
  }, null, 2));

  const tasks = [];
  for (const combo of opts.combos) for (const version of opts.versions) for (const q of questions) tasks.push({ combo, version, q });

  const results = [];
  await pool(tasks, opts.concurrency, async ({ combo, version, q }) => {
    const ws = createWorkspace(version);
    const startedAt = new Date().toISOString();
    let out;
    try {
      out = await ADAPTERS[combo.harness].runAgent({
        cwd: ws.dir, prompt: buildPrompt(q.text, opts.variant), model: combo.model, via: combo.via,
        effort: combo.effort ?? undefined, timeoutMs: opts.timeoutMs,
      });
    } catch (e) {
      out = { finalText: '', steps: [], usage: {}, error: String(e?.stack ?? e), durationMs: 0 };
    } finally {
      ws.dispose();
    }
    const answer = parseAnswer(out.finalText);
    const rec = {
      runId, combo: combo.id, harness: combo.harness, model: combo.model, via: combo.via,
      variant: opts.variant ?? 'default', contextVersion: version, questionId: q.id, question: q.text,
      golden: golden[q.id], answer, correct: isCorrect(answer, golden[q.id]),
      startedAt, ...out,
    };
    results.push(rec);
    appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(rec) + '\n');
    onResult?.(rec);
  });

  const summary = summarize(results);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ runId, finishedAt: new Date().toISOString(), cells: summary }, null, 2));
  return { runId, dir, summary };
}

export function summarize(results) {
  const cells = new Map();
  for (const r of results) {
    const key = `${r.combo}|${r.contextVersion}`;
    if (!cells.has(key)) cells.set(key, { combo: r.combo, contextVersion: r.contextVersion, n: 0, correct: 0, errors: 0, noAnswer: 0, ms: [], inTok: [], outTok: [] });
    const c = cells.get(key);
    c.n++; if (r.correct) c.correct++; if (r.error) c.errors++; if (r.answer == null) c.noAnswer++;
    c.ms.push(r.durationMs); if (r.usage?.inputTokens != null) c.inTok.push(r.usage.inputTokens); c.outTok.push(r.usage?.outputTokens ?? 0);
  }
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return [...cells.values()].map((c) => ({
    combo: c.combo, contextVersion: c.contextVersion, n: c.n, correct: c.correct,
    accuracy: Math.round((c.correct / c.n) * 1000) / 10, errors: c.errors, noAnswer: c.noAnswer,
    medianSeconds: Math.round(med(c.ms) / 100) / 10, medianInputTokens: med(c.inTok), medianOutputTokens: med(c.outTok),
  }));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const opts = parseArgs(process.argv.slice(2));
  const total = opts.combos.length * opts.versions.length * (opts.questions === 'all' ? QUESTIONS.length : opts.questions.split(',').length);
  let done = 0;
  const { dir, summary } = await runMatrix(opts, {
    onResult(r) {
      done++;
      const mark = r.correct ? 'OK ' : r.error ? 'ERR' : 'NO ';
      console.log(`[${done}/${total}] ${mark} ${r.combo} ctx ${r.contextVersion} ${r.questionId} answer=${r.answer} golden=${r.golden} ${(r.durationMs / 1000).toFixed(1)}s${r.error ? ' ' + r.error.slice(0, 120).replace(/\s+/g, ' ') : ''}`);
    },
  });
  console.table(summary);
  console.log('results:', dir);
}
