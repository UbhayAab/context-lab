// Release gate and run comparisons, computed client-side with the server's rule (API.md).
import type { Cell, RunDetail, RunRecord, RunSummary } from './types';

export interface GateResult {
  ok: boolean;
  reasons: string[];
  evidenceRunId: string | null;
  agents: number;
}

export const isDefaultVariant = (r: RunSummary) => (r.variant ?? 'default') === 'default';

/** Only unprompted ("default") runs count for the gate; review runs change the prompt. */
export function pickGateRun(runs: RunSummary[], active: string, candidate: string) {
  return runs.find((r) => r.status === 'complete' && isDefaultVariant(r) && r.versions.includes(active) && r.versions.includes(candidate)) ?? null;
}

export function computeGate(run: RunSummary | null, detail: RunDetail | null, active: string, candidate: string): GateResult {
  if (!run || !detail) {
    return { ok: false, reasons: [`No complete evaluation run covers both ${active} and ${candidate}.`], evidenceRunId: null, agents: 0 };
  }
  const key = (r: RunRecord) => `${r.combo}|${r.questionId}`;
  const onActive = new Map(detail.results.filter((r) => r.contextVersion === active).map((r) => [key(r), r]));
  const reasons: string[] = [];
  for (const r of detail.results.filter((x) => x.contextVersion === candidate)) {
    if (onActive.get(key(r))?.correct && !r.correct) reasons.push(`${r.combo} regressed on ${r.questionId}`);
  }
  for (const combo of run.combos) {
    const cell = (v: string) => run.cells.find((c) => c.combo === combo && c.contextVersion === v);
    if ((cell(candidate)?.correct ?? 0) < (cell(active)?.correct ?? 0)) reasons.push(`${combo} scores lower on ${candidate}`);
  }
  return { ok: reasons.length === 0, reasons, evidenceRunId: run.runId, agents: run.combos.length };
}

export interface Movement {
  fixed: number;
  regressed: number;
}

/** Per combo: questions fixed and regressed going from version a to version b. */
export function movement(results: RunRecord[], combo: string, a: string, b: string): Movement {
  const before = new Map(results.filter((r) => r.combo === combo && r.contextVersion === a).map((r) => [r.questionId, r.correct]));
  let fixed = 0;
  let regressed = 0;
  for (const r of results.filter((x) => x.combo === combo && x.contextVersion === b)) {
    const was = before.get(r.questionId);
    if (was === undefined) continue;
    if (!was && r.correct) fixed++;
    if (was && !r.correct) regressed++;
  }
  return { fixed, regressed };
}

/** Plain-words headline from measured cells. Every number comes from the data. */
export function headline(cells: Cell[], versions: string[]): string {
  if (!cells.length || versions.length === 0) return 'No results yet.';
  const totals = versions.map((v) => {
    const cs = cells.filter((c) => c.contextVersion === v);
    const n = cs.reduce((s, c) => s + c.n, 0);
    const correct = cs.reduce((s, c) => s + c.correct, 0);
    const accs = cs.map((c) => c.accuracy);
    return { v, n, correct, agents: cs.length, spread: accs.length ? Math.max(...accs) - Math.min(...accs) : 0, pct: n ? (correct / n) * 100 : 0 };
  });
  if (totals.length === 1) {
    const t = totals[0];
    return `${t.agents} agents answered ${t.correct} of ${t.n} questions correctly on context ${t.v}.`;
  }
  const [first, last] = [totals[0], totals[totals.length - 1]];
  const parts = [`Same questions, ${last.agents} agents: ${first.correct} of ${first.n} correct on context ${first.v}, ${last.correct} of ${last.n} on ${last.v}.`];
  const contextSwing = Math.abs(last.pct - first.pct);
  const agentSwing = Math.max(...totals.map((t) => t.spread));
  if (contextSwing > agentSwing) parts.push('The context release moved accuracy more than the choice of agent did.');
  else if (agentSwing > contextSwing) parts.push('The choice of agent moved accuracy more than the context release did.');
  return parts.join(' ');
}
