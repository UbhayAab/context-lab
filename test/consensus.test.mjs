import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consensus, impact } from '../eval/consensus.mjs';

const r = (combo, contextVersion, questionId, answer) => ({ combo, contextVersion, questionId, question: questionId, answer, golden: 0 });

test('agreement and dissenters per question', () => {
  const rs = [r('a', '1', 'q1', 10), r('b', '1', 'q1', 10), r('c', '1', 'q1', 12), r('a', '1', 'q2', 5), r('b', '1', 'q2', 5), r('c', '1', 'q2', 5)];
  const c = consensus(rs, '1');
  assert.equal(c.agreed, 1);
  assert.equal(c.total, 2);
  const q1 = c.questions.find((q) => q.questionId === 'q1');
  assert.equal(q1.agree, false);
  assert.equal(q1.majority, 10);
  assert.deepEqual(q1.dissenters, ['c']);
});

test('a tie has no majority and no dissenters', () => {
  const c = consensus([r('a', '1', 'q1', 1), r('b', '1', 'q1', 2)], '1');
  assert.equal(c.questions[0].majority, null);
  assert.deepEqual(c.questions[0].dissenters, []);
});

test('missing answers group together instead of crashing', () => {
  const c = consensus([r('a', '1', 'q1', null), r('b', '1', 'q1', null)], '1');
  assert.equal(c.questions[0].agree, true);
});

test('impact reports delta, percent and the biggest mover', () => {
  const rs = [r('a', '1', 'q1', 200), r('a', '2', 'q1', 100), r('a', '1', 'q2', 50), r('a', '2', 'q2', 50)];
  const i = impact(rs, '1', '2');
  const q1 = i.rows.find((x) => x.questionId === 'q1');
  assert.equal(q1.delta, -100);
  assert.equal(q1.pct, -50);
  assert.equal(i.moved, 1);
  assert.equal(i.biggest.questionId, 'q1');
});
