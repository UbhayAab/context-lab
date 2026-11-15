// Local bridge: serves the UI and lets it drive the agent CLIs already signed in on this machine.
// Binds 127.0.0.1 only. Credentials never pass through here: each harness is the vendor's own
// unmodified client using its own sign-in. Cross-site calls are refused unless the Origin is allowed.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { approveRelease, combinedPayload, consensusPayload, contextPayload, feedbackPayload, impactsPayload, listRuns, loadRun, questionsPayload } from './data.mjs';
import { MIX_MATRIX, harnessStatus } from './harnesses.mjs';
import { parseCombo } from '../harness/run.mjs';
import { buildPrompt, createWorkspace, parseAnswer } from '../harness/workspace.mjs';
import { goldenAnswers, isCorrect } from '../eval/golden.mjs';
import { QUESTIONS } from '../eval/questions.mjs';
import * as claudeCode from '../harness/adapters/claude-code.mjs';
import * as codex from '../harness/adapters/codex.mjs';
import * as grok from '../harness/adapters/grok.mjs';

const PORT = Number(process.env.LAB_PORT ?? 4318);
const HOST = '127.0.0.1';
const UI_DIST = fileURLToPath(new URL('../ui/dist/', import.meta.url));
const ADAPTERS = { [claudeCode.HARNESS]: claudeCode, [codex.HARNESS]: codex, [grok.HARNESS]: grok };
const MAX_QUESTION = 500;
const MAX_BODY = 16_384;
const AGENT_TIMEOUT_MS = 240_000;
const EXTRA_ORIGINS = (process.env.LAB_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const isLocalOrigin = (o) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const originAllowed = (o) => !o || isLocalOrigin(o) || EXTRA_ORIGINS.includes(o);

function send(res, code, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

let bridgeEnsured = false;
function ensureBridge() {
  if (bridgeEnsured) return true;
  const r = spawnSync('node', [join(process.env.USERPROFILE ?? '', 'tools', 'codex-bridge', 'ensure.mjs')], { stdio: 'ignore', timeout: 30_000 });
  bridgeEnsured = r.status === 0;
  return bridgeEnsured;
}

async function streamAgentRun(req, res) {
  const body = await readBody(req);
  const question = String(body.question ?? '').trim();
  if (!question || question.length > MAX_QUESTION) return send(res, 400, { error: `question must be 1-${MAX_QUESTION} characters` });
  let combo;
  try { combo = parseCombo(String(body.combo ?? '')); } catch (e) { return send(res, 400, { error: e.message }); }
  const offered = harnessStatus().flatMap((h) => (h.installed && h.signedIn ? h.models.map((m) => m.combo) : []));
  if (!offered.includes(combo.id) || !ADAPTERS[combo.harness]) return send(res, 400, { error: `${combo.id} is not available on this machine` });
  const { rendered } = contextPayload();
  if (!rendered[body.contextVersion]) return send(res, 400, { error: 'unknown context version' });
  if (combo.via === 'bridge' && !ensureBridge()) return send(res, 503, { error: 'local GPT bridge did not start' });

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  emit('start', { combo: combo.id, contextVersion: body.contextVersion });

  const bench = QUESTIONS.find((q) => q.text.toLowerCase() === question.toLowerCase());
  const golden = bench ? goldenAnswers()[bench.id] : null;
  const ws = createWorkspace(body.contextVersion);
  let index = 0;
  try {
    const out = await ADAPTERS[combo.harness].runAgent({
      cwd: ws.dir, prompt: buildPrompt(question), model: combo.model, via: combo.via,
      effort: combo.effort ?? undefined, timeoutMs: AGENT_TIMEOUT_MS,
      onStep: (s) => emit('step', { ...s, index: index++ }),
    });
    const answer = parseAnswer(out.finalText);
    emit('done', {
      finalText: out.finalText, answer, golden, correct: bench ? isCorrect(answer, golden) : null,
      questionId: bench?.id ?? null, durationMs: out.durationMs, usage: out.usage, error: out.error,
      steps: out.steps,
    });
  } catch (e) {
    emit('done', { finalText: '', answer: null, golden, correct: null, durationMs: 0, usage: {}, error: String(e.message ?? e) });
  } finally {
    ws.dispose();
    res.end();
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !extname(rel)) rel = '/index.html';
  const file = normalize(join(UI_DIST, rel));
  if (!file.startsWith(normalize(UI_DIST)) || !existsSync(file) || !statSync(file).isFile()) {
    return send(res, 404, { error: 'UI not built. Run npm run build in ui/.' });
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

async function route(req, res) {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) return send(res, 403, { error: 'origin not allowed' });
  const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type,x-lab-client', 'access-control-allow-private-network': 'true', 'access-control-max-age': '600' });
    return res.end();
  }
  const { pathname } = new URL(req.url, 'http://x');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res);
  // Custom header forces a CORS preflight for cross-site callers, which the Origin check refuses.
  if (req.headers['x-lab-client'] !== '1') return send(res, 400, { error: 'missing X-Lab-Client header' });

  if (req.method === 'GET' && pathname === '/api/status') {
    return send(res, 200, { mode: 'local', app: 'context-lab', version: '0.3.0', harnesses: harnessStatus(), mixMatrix: MIX_MATRIX });
  }
  if (req.method === 'GET' && pathname === '/api/context') return send(res, 200, contextPayload());
  if (req.method === 'GET' && pathname === '/api/questions') return send(res, 200, questionsPayload());
  if (req.method === 'GET' && pathname === '/api/runs') return send(res, 200, listRuns());
  if (req.method === 'GET' && pathname === '/api/combined') return send(res, 200, combinedPayload());
  if (req.method === 'GET' && pathname === '/api/consensus') return send(res, 200, consensusPayload());
  if (req.method === 'GET' && pathname === '/api/impacts') return send(res, 200, impactsPayload());
  if (req.method === 'GET' && pathname === '/api/feedback') {
    const q = new URL(req.url, 'http://x').searchParams;
    const fb = feedbackPayload(q.get('runId'), q.get('version'));
    return fb ? send(res, 200, fb) : send(res, 404, { error: 'no complete run to analyze' });
  }
  if (req.method === 'GET' && pathname.startsWith('/api/runs/')) {
    const run = loadRun(pathname.slice('/api/runs/'.length));
    return run ? send(res, 200, run) : send(res, 404, { error: 'run not found' });
  }
  if (req.method === 'POST' && pathname === '/api/agent/run') return streamAgentRun(req, res);
  if (req.method === 'POST' && pathname === '/api/release') {
    const body = await readBody(req);
    const note = String(body.note ?? '').trim();
    if (note.length < 8) return send(res, 400, { error: 'A review note of at least 8 characters is required.' });
    const out = approveRelease(String(body.version ?? ''), note);
    return out.error ? send(res, 409, out) : send(res, 200, out);
  }
  return send(res, 404, { error: 'not found' });
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => { if (!res.headersSent) send(res, 500, { error: String(e.message ?? e) }); else res.end(); });
});
server.listen(PORT, HOST, () => console.log(`context-lab bridge on http://${HOST}:${PORT}`));
