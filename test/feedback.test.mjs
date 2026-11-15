import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFeedback } from '../eval/feedback.mjs';

const rec = (combo, questionId, finalText, contextVersion = '1.0.0') => ({ combo, questionId, contextVersion, finalText, steps: [] });
const CHANGELOG = ['pending fix', 'test account fix', 'refund sign fix', 'date rule'];

test('counts each topic once per answer and attributes quotes to the agent', () => {
  const results = [
    rec('a', 'q1', 'I kept the internal QA accounts because the definition does not say to drop them. The metric says "plus refunds," so I added them. ANSWER: 1'),
    rec('a', 'q2', 'Test accounts (is_test = 1) are included. ANSWER: 2'),
    rec('b', 'q1', 'ANSWER: 3'),
    rec('b', 'q2', 'ANSWER: 4'),
    rec('a', 'q3', 'Refunds are subtracted here.', '1.1.0'),
  ];
  const fb = analyzeFeedback(results, '1.0.0', CHANGELOG);
  const t = Object.fromEntries(fb.topics.map((x) => [x.id, x]));
  assert.equal(fb.answersAnalyzed, 4);
  assert.equal(t.test_accounts.mentions, 2);
  assert.deepEqual(t.test_accounts.byCombo, { a: 2, b: 0 });
  assert.equal(t.refund_sign.mentions, 1);
  assert.deepEqual(fb.silentAgents, ['b']);
  assert.ok(t.test_accounts.quotes.every((q) => q.combo === 'a'));
  assert.match(t.test_accounts.quotes[0].text, /QA accounts/);
});

test('a single passing mention does not count as an anticipated fix', () => {
  const fb = analyzeFeedback([rec('a', 'q1', 'Completed and pending orders total 10. ANSWER: 10')], '1.0.0', CHANGELOG);
  assert.equal(fb.topics.find((x) => x.id === 'pending').mentions, 1);
  assert.equal(fb.fixesAnticipated, 0);
});

test('quotes keep dates and column names intact', () => {
  const fb = analyzeFeedback([
    rec('a', 'q1', 'Refunds were filtered by refund_date between 2026-07-01 and 2026-09-30.'),
    rec('a', 'q2', 'Refunds were filtered by refund_date again.'),
  ], '1.0.0', CHANGELOG);
  const q = fb.topics.find((x) => x.id === 'date_attribution').quotes[0].text;
  assert.match(q, /refund_date/);
  assert.match(q, /2026-07-01/);
});
