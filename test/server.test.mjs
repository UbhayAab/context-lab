// Integration: boots the bridge on a spare port and checks the guard rails and read endpoints.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const H = { 'X-Lab-Client': '1' };
let proc;

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings', fileURLToPath(new URL('../server/server.mjs', import.meta.url))], {
    env: { ...process.env, LAB_PORT: String(PORT) }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/questions`, { headers: H }); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});
after(() => proc?.kill());

test('refuses API calls without the client header', async () => {
  const r = await fetch(`${BASE}/api/questions`);
  assert.equal(r.status, 400);
});

test('refuses foreign origins, accepts localhost origins', async () => {
  const evil = await fetch(`${BASE}/api/questions`, { headers: { ...H, Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const local = await fetch(`${BASE}/api/questions`, { headers: { ...H, Origin: 'http://localhost:5173' } });
  assert.equal(local.status, 200);
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('questions carry golden answers', async () => {
  const qs = await (await fetch(`${BASE}/api/questions`, { headers: H })).json();
  assert.equal(qs.length, 12);
  assert.equal(qs.find((q) => q.id === 'q11').golden, 1538.16);
});

test('agent run rejects unknown combos and oversized questions before spawning anything', async () => {
  const post = (body) => fetch(`${BASE}/api/agent/run`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ combo: 'claude-code:haiku', contextVersion: '1.1.0', question: 'x'.repeat(501) })).status, 400);
  assert.equal((await post({ combo: 'nope:x', contextVersion: '1.1.0', question: 'hi' })).status, 400);
  assert.equal((await post({ combo: 'claude-code:haiku', contextVersion: '9.9.9', question: 'hi' })).status, 400);
});

test('release requires a review note', async () => {
  const r = await fetch(`${BASE}/api/release`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ version: '1.1.0', note: 'ok' }) });
  assert.equal(r.status, 400);
});

test('static paths cannot escape the UI folder', async () => {
  const r = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  assert.notEqual(r.status, 200);
});
