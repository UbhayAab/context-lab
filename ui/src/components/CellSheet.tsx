// Every answer one agent gave on one context release, and the full trace behind each.
import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { agentLabel, fmtMoney, fmtSeconds, fmtSignedMoney, fmtTokens } from '../lib/format';
import { answerProse } from '../lib/sql';
import type { RunRecord } from '../lib/types';
import { ErrorNote, Spinner, cx } from './ui';
import { Sheet } from './Sheet';
import { Steps } from './Steps';
import { Markdown } from './Markdown';
import { VerifyChip } from './AgentRunCard';

export function Trace({ rec }: { rec: RunRecord }) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] font-medium text-ink">{rec.question}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-hover px-2.5 py-1 text-[12.5px] font-medium text-ink tnum">Agent: {rec.answer != null ? fmtMoney(rec.answer) : 'no answer'}</span>
        <VerifyChip run={rec} />
      </div>
      <p className="text-[12px] text-muted tnum">{fmtSeconds(rec.durationMs)} · {fmtTokens(rec.usage?.inputTokens)} tokens in · {rec.usage?.turns ?? '-'} turns · run {rec.runId.replace(/^.*Z-/, '')}</p>
      {rec.error && <ErrorNote>{rec.error}</ErrorNote>}
      <div className="rounded-2xl border border-line bg-surface p-4"><Steps steps={rec.steps} hideFinalText={rec.finalText} /></div>
      {answerProse(rec.finalText) && <Markdown text={answerProse(rec.finalText)} className="text-[14px] text-ink" />}
    </div>
  );
}

export function CellSheet({ open, combo, version, results, loading, onClose }: {
  open: boolean; combo: string; version: string; results: RunRecord[]; loading?: boolean; onClose: () => void;
}) {
  const [picked, setPicked] = useState<RunRecord | null>(null);
  useEffect(() => { setPicked(null); }, [combo, version]);
  const rows = results.filter((r) => r.combo === combo && r.contextVersion === version).sort((a, b) => a.questionId.localeCompare(b.questionId));
  let body;
  if (picked) body = <Trace rec={picked} />;
  else if (loading) body = <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading answers</p>;
  else if (!rows.length) body = <p className="text-sm text-muted">No answers recorded yet.</p>;
  else {
    body = (
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.questionId}>
            <button type="button" onClick={() => setPicked(r)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover">
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', r.correct ? 'bg-pass-soft text-pass' : 'bg-fail-soft text-fail')}>
                {r.correct ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink">{r.question}</span>
                <span className="mt-0.5 block text-[12px] text-muted tnum">
                  Agent {r.answer != null ? fmtMoney(r.answer) : 'no answer'} · finance {fmtMoney(r.golden)}
                  {!r.correct && r.answer != null && <span className="text-fail"> · off by {fmtSignedMoney(r.answer - r.golden)}</span>}
                </span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Sheet open={open} onClose={onClose} onBack={picked ? () => setPicked(null) : undefined}
      title={picked ? `${picked.questionId.toUpperCase()} trace` : agentLabel(combo)}
      subtitle={picked ? `${agentLabel(combo)} · context ${version}` : `Context ${version} · ${rows.filter((r) => r.correct).length} of ${rows.length} correct`}>
      {body}
    </Sheet>
  );
}
