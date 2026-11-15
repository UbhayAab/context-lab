import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seed } from '../data/seed.mjs';
import { goldenAnswers, isCorrect } from '../eval/golden.mjs';
import { buildPrompt, parseAnswer } from '../harness/workspace.mjs';
import { parseCombo } from '../harness/run.mjs';

test('parseAnswer takes the last ANSWER line and strips money formatting', () => {
  assert.equal(parseAnswer('draft ANSWER: 1.00\nfinal\nANSWER: $1,538.16'), 1538.16);
  assert.equal(parseAnswer('**ANSWER:** 42'), 42);
  assert.equal(parseAnswer('ANSWER: -62092.59'), -62092.59);
  assert.equal(parseAnswer('no final line here'), null);
  assert.equal(parseAnswer(''), null);
});

test('isCorrect tolerates cent rounding but not logic errors', () => {
  assert.equal(isCorrect(1538.16, 1538.16), true);
  assert.equal(isCorrect(1538.2, 1538.16), true);
  assert.equal(isCorrect(1540, 1538.16), false);
  assert.equal(isCorrect(469800, 469762.8), false);
  assert.equal(isCorrect(null, 1), false);
  assert.equal(isCorrect(Number.NaN, 1), false);
});

test('dataset is deterministic: two seeds produce identical golden answers', () => {
  const a = join(tmpdir(), `cl-seed-a-${process.pid}.db`);
  const b = join(tmpdir(), `cl-seed-b-${process.pid}.db`);
  try {
    seed(a); seed(b);
    assert.deepEqual(goldenAnswers(a), goldenAnswers(b));
    const h = (p) => createHash('sha256').update(JSON.stringify(goldenAnswers(p))).digest('hex');
    assert.equal(h(a), h(b));
  } finally {
    rmSync(a, { force: true }); rmSync(b, { force: true });
  }
});

test('golden answers match the recorded reference values', () => {
  const g = goldenAnswers();
  assert.equal(g.q01, 469762.8);
  assert.equal(g.q11, 1538.16);
  assert.equal(g.q10, 62092.59);
});

test('review prompt adds the doubt instruction, default does not', () => {
  assert.match(buildPrompt('Q?', 'review'), /looks wrong or ambiguous/);
  assert.doesNotMatch(buildPrompt('Q?'), /looks wrong or ambiguous/);
  assert.match(buildPrompt('Q?'), /ANSWER: <number>/);
});

test('parseCombo reads harness, model, route and effort', () => {
  assert.deepEqual(parseCombo('claude-code:gpt-6.1-sol@bridge'), { harness: 'claude-code', model: 'gpt-6.1-sol', via: 'bridge', effort: null, id: 'claude-code:gpt-6.1-sol@bridge' });
  assert.equal(parseCombo('codex:gpt-6.1-sol#high').effort, 'high');
  assert.equal(parseCombo('grok:grok-4.7').model, 'grok-4.7');
  assert.throws(() => parseCombo('nope:model'), /Unknown harness/);
  assert.throws(() => parseCombo('garbage'), /Bad combo/);
});

test('seeded database file exists and is non-empty', () => {
  const buf = readFileSync(new URL('../data/commerce.db', import.meta.url));
  assert.ok(buf.length > 10_000);
});
