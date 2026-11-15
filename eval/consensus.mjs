// Signals that need no golden answers, so they work on real traffic:
// - consensus: do agents on the same context agree? Disagreement marks ambiguous context.
// - impact: how a release moves each business number, from the agents' majority answers.

const key = (n) => (n == null ? 'none' : n.toFixed(2));

/** Per question: the answer groups, the majority, and who dissented. */
export function consensus(results, contextVersion) {
  const byQ = new Map();
  for (const r of results.filter((x) => x.contextVersion === contextVersion)) {
    if (!byQ.has(r.questionId)) byQ.set(r.questionId, { questionId: r.questionId, question: r.question, golden: r.golden, answers: [] });
    byQ.get(r.questionId).answers.push({ combo: r.combo, answer: r.answer });
  }
  const questions = [...byQ.values()].sort((a, b) => a.questionId.localeCompare(b.questionId)).map((q) => {
    const groups = new Map();
    for (const a of q.answers) {
      const k = key(a.answer);
      if (!groups.has(k)) groups.set(k, { answer: a.answer, combos: [] });
      groups.get(k).combos.push(a.combo);
    }
    const ranked = [...groups.values()].sort((a, b) => b.combos.length - a.combos.length);
    const majority = ranked[0];
    const tie = ranked.length > 1 && ranked[1].combos.length === majority.combos.length;
    return {
      questionId: q.questionId, question: q.question, golden: q.golden,
      agree: ranked.length === 1, groups: ranked,
      majority: tie ? null : majority.answer, majorityShare: majority.combos.length / q.answers.length,
      dissenters: tie ? [] : ranked.slice(1).flatMap((g) => g.combos),
    };
  });
  const agreed = questions.filter((q) => q.agree).length;
  return { contextVersion, questions, agreed, total: questions.length, agents: [...new Set(results.filter((x) => x.contextVersion === contextVersion).map((x) => x.combo))] };
}

/** Release notes in numbers: majority answer before vs after, per question. */
export function impact(results, fromVersion, toVersion) {
  const before = consensus(results, fromVersion);
  const after = consensus(results, toVersion);
  const afterBy = new Map(after.questions.map((q) => [q.questionId, q]));
  const rows = before.questions.filter((q) => afterBy.has(q.questionId)).map((q) => {
    const a = afterBy.get(q.questionId);
    const delta = q.majority != null && a.majority != null ? Math.round((a.majority - q.majority) * 100) / 100 : null;
    const pct = delta != null && q.majority !== 0 ? Math.round((delta / Math.abs(q.majority)) * 1000) / 10 : null;
    return { questionId: q.questionId, question: q.question, before: q.majority, after: a.majority, delta, pct, beforeAgreed: q.agree, afterAgreed: a.agree };
  });
  const moved = rows.filter((r) => r.delta != null && Math.abs(r.delta) > 0.05);
  // Largest absolute move: a percent change on a difference question (East minus West) is meaningless.
  const biggest = [...moved].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0] ?? null;
  // No majority on one side (agents split evenly): the move is real but has no single number.
  const unresolved = rows.filter((r) => r.delta == null).length;
  return { fromVersion, toVersion, rows, moved: moved.length, unresolved, total: rows.length, biggest };
}
