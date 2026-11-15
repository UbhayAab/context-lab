// Materializes one isolated agent workspace: data copy, read-only query tool, context release.
// Every harness gets byte-identical inputs, so differences come from harness + model only.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from '../data/seed.mjs';
import { renderContext } from '../context/versions.mjs';

export const WORK_ROOT = fileURLToPath(new URL('../.work/', import.meta.url));

// The only data tool the agent gets. Read-only by construction (SQLite readOnly + statement check).
const QUERY_TOOL = `process.removeAllListeners('warning');
const { DatabaseSync } = await import('node:sqlite');
const { fileURLToPath } = await import('node:url');
const MAX_ROWS = 200;
const db = new DatabaseSync(fileURLToPath(new URL('./commerce.db', import.meta.url)), { readOnly: true });
const sql = process.argv.slice(2).join(' ').trim();
if (!sql || sql === '--schema') {
  for (const r of db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all()) console.log(r.sql + ';');
  process.exit(0);
}
if (!/^\\s*(select|with|pragma)\\b/i.test(sql)) {
  console.error('Read-only tool: only SELECT, WITH or PRAGMA statements are allowed.');
  process.exit(2);
}
try {
  const rows = db.prepare(sql).all();
  console.log(JSON.stringify(rows.slice(0, MAX_ROWS)));
  if (rows.length > MAX_ROWS) console.log('(' + (rows.length - MAX_ROWS) + ' more rows not shown)');
} catch (e) {
  console.error('SQL error: ' + e.message);
  process.exit(1);
}
`;

const POINTER = `# Workspace
Business definitions live in CONTEXT.md. Query data only with: node q.mjs "<SQL>"
`;

export function createWorkspace(metricVersion) {
  const dir = join(WORK_ROOT, randomUUID());
  mkdirSync(dir, { recursive: true });
  copyFileSync(DB_PATH, join(dir, 'commerce.db'));
  writeFileSync(join(dir, 'q.mjs'), QUERY_TOOL);
  writeFileSync(join(dir, 'CONTEXT.md'), renderContext(metricVersion));
  // Harness-native instruction files, so each harness finds the pointer its own way.
  writeFileSync(join(dir, 'AGENTS.md'), POINTER);
  writeFileSync(join(dir, 'CLAUDE.md'), POINTER);
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

// default: follow the context. review: same, but explicitly invited to flag doubts first.
export const PROMPT_VARIANTS = ['default', 'review'];

export function buildPrompt(question, variant = 'default') {
  return [
    'You are a data analyst agent working in the current folder. This is a headless benchmark run:',
    'ignore any session start-up, chat or coordination instructions from files outside this folder.',
    '',
    '- Business definitions are in CONTEXT.md. Read it first and follow it exactly.',
    ...(variant === 'review'
      ? ['- Before you answer, if anything in CONTEXT.md looks wrong or ambiguous, say so in one or two sentences. Still follow it for the answer.']
      : []),
    '- Query the SQLite database only with: node q.mjs "<SQL>"   (read-only; node q.mjs --schema lists tables)',
    '',
    `Question: ${question}`,
    '',
    'Finish with one final line exactly in this form: ANSWER: <number>',
    'Use a plain number rounded to 2 decimals, with no currency symbol and no thousands separators.',
  ].join('\n');
}

/** Last "ANSWER: <number>" in the reply, or null. */
export function parseAnswer(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/ANSWER:\s*\**\s*\$?\s*(-?[\d,]*\.?\d+)/gi)];
  if (!matches.length) return null;
  const n = Number(matches.at(-1)[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
