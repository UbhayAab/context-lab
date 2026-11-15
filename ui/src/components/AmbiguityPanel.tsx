// Ambiguity detector: agents reading the same context should agree. Where they split, the context is ambiguous.
import { forwardRef } from 'react';
import { Split } from 'lucide-react';
import { agentLabel, fmtMoney, parseCombo } from '../lib/format';
import type { Cell, Consensus } from '../lib/types';
import { Avatar, Badge, Card, cx } from './ui';

export const PITCH = "Agents that read the same context should give the same answer. When they don't, the context is ambiguous, and you can see it without knowing the right answer.";

/** Score of all agents on a version, when the matrix has it. Used to say "agreed, yet wrong". */
function scoreOf(cells: Cell[] | undefined, v: string) {
  const cs = (cells ?? []).filter((c) => c.contextVersion === v);
  if (!cs.length) return null;
  return { correct: cs.reduce((s, c) => s + c.correct, 0), n: cs.reduce((s, c) => s + c.n, 0) };
}

export const AmbiguityPanel = forwardRef<HTMLElement, { consensus: Consensus; versions: string[]; cells?: Cell[] }>(function AmbiguityPanel({ consensus, versions, cells }, ref) {
  const present = versions.filter((v) => consensus[v]);
  if (!present.length) return null;
  return (
    <section ref={ref} className="mt-10 scroll-mt-6">
      <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-ink"><Split className="h-[18px] w-[18px] text-muted" /> Ambiguity detector</h2>
      <p className="mt-1 max-w-2xl text-[14px] text-muted">{PITCH}</p>
      <div className="mt-4 space-y-4">
        {present.map((v) => {
          const c = consensus[v];
          const splits = c.questions.filter((q) => !q.agree);
          return (
            <Card key={v} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <p className="text-[14px] font-medium text-ink">Context {v}</p>
                <Badge tone={splits.length ? 'warn' : 'pass'}>{splits.length ? `${splits.length} of ${c.total} questions split` : `All ${c.agents.length} agents agreed on all ${c.total}`}</Badge>
              </div>
              {splits.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-muted">
                  <p>No ambiguity detected: every agent produced the same number for every question.</p>
                  {(() => {
                    const s = scoreOf(cells, v);
                    if (!s || s.correct === s.n) return null;
                    return (
                      <p className="mt-1.5 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12.5px] text-warn tnum">
                        Yet only {s.correct} of {s.n} answers match finance. Agreement catches ambiguous context, not a wrong policy choice.
                      </p>
                    );
                  })()}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {splits.map((q) => (
                    <li key={q.questionId} className="px-4 py-3.5">
                      <p className="text-[13.5px] font-medium text-ink">{q.question}</p>
                      <ul className="mt-2.5 space-y-2">
                        {q.groups.map((g, i) => {
                          const isMajority = q.majority != null && g.answer === q.majority;
                          return (
                            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <span className={cx('min-w-[112px] text-[15px] font-semibold tnum', g.answer == null ? 'text-faint' : 'text-ink')}>{g.answer != null ? fmtMoney(g.answer) : 'No answer'}</span>
                              <span className="flex flex-wrap items-center gap-1.5">
                                {g.combos.map((c) => (
                                  <span key={c} title={agentLabel(c)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2 text-[12px] text-ink-2">
                                    <Avatar harness={parseCombo(c).harness} size={18} />{parseCombo(c).modelName}{parseCombo(c).via === 'bridge' ? '*' : ''}
                                  </span>
                                ))}
                              </span>
                              {isMajority && <Badge tone="neutral">majority</Badge>}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2 text-[11.5px] text-muted tnum">
                        {q.majority == null ? 'Tie: no majority answer.' : `${Math.round(q.majorityShare * 100)}% of agents gave the majority answer.`}
                        {' '}Finance's number, for reference only: {fmtMoney(q.golden)}.
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">* local bridge. Agreement uses each agent's final number per question.</p>
    </section>
  );
});
