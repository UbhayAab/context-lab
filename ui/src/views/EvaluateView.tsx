// Evaluate: the harness x model x context matrix, with every answer and trace one tap away.
import { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { useRunDetail, useStore } from '../lib/store';
import { agentLabel, fmtMoney, fmtSeconds, fmtSignedMoney, fmtTokens, parseCombo, runName } from '../lib/format';
import { headline, isDefaultVariant, movement } from '../lib/gate';
import { answerProse } from '../lib/sql';
import type { Cell, RunRecord, RunSummary } from '../lib/types';
import { Avatar, Card, Centered, ErrorNote, PageHeader, Spinner, cx } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { Steps } from '../components/Steps';
import { Markdown } from '../components/Markdown';
import { VerifyChip } from '../components/AgentRunCard';

function AccuracyCell({ cell, onOpen }: { cell: Cell | undefined; onOpen: () => void }) {
  if (!cell) return <div className="text-[13px] text-faint">Not run</div>;
  const pct = cell.accuracy;
  const tone = pct >= 90 ? 'bg-pass' : pct >= 50 ? 'bg-warn' : 'bg-fail';
  return (
    <button type="button" onClick={onOpen} className="group w-full rounded-xl p-2.5 text-left transition-colors hover:bg-hover">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold tracking-tight text-ink tnum">{Math.round(pct)}%</span>
        <span className="text-[12.5px] text-muted tnum">{cell.correct}/{cell.n}</span>
        <ChevronRight className="ml-auto h-4 w-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hover">
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted tnum">
        {cell.medianSeconds != null ? `${cell.medianSeconds} s` : '-'} · {fmtTokens(cell.medianInputTokens)} tokens{cell.errors ? ` · ${cell.errors} errors` : ''}
      </p>
    </button>
  );
}

function ChangeCell({ a, b, mv }: { a?: Cell; b?: Cell; mv: { fixed: number; regressed: number } | null }) {
  if (!a || !b) return <span className="text-[13px] text-faint">-</span>;
  const d = b.accuracy - a.accuracy;
  return (
    <div className="p-2.5">
      <p className={cx('text-[15px] font-semibold tnum', d > 0 ? 'text-pass' : d < 0 ? 'text-fail' : 'text-muted')}>{d > 0 ? '+' : ''}{Math.round(d)} pts</p>
      {mv && <p className="mt-0.5 text-[11.5px] text-muted tnum">{mv.fixed} fixed · <span className={mv.regressed ? 'font-medium text-fail' : undefined}>{mv.regressed} regressed</span></p>}
    </div>
  );
}

function AgentName({ combo }: { combo: string }) {
  const p = parseCombo(combo);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar harness={p.harness} size={30} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[14px] font-medium text-ink">{p.modelName}</p>
        <p className="truncate text-[12px] text-muted">in {p.harnessName}{p.via === 'bridge' ? ' (local bridge)' : ''}</p>
      </div>
    </div>
  );
}

function Trace({ rec }: { rec: RunRecord }) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] font-medium text-ink">{rec.question}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-hover px-2.5 py-1 text-[12.5px] font-medium text-ink tnum">Agent: {rec.answer != null ? fmtMoney(rec.answer) : 'no answer'}</span>
        <VerifyChip run={rec} />
      </div>
      <p className="text-[12px] text-muted tnum">{fmtSeconds(rec.durationMs)} · {fmtTokens(rec.usage?.inputTokens)} tokens in · {rec.usage?.turns ?? '-'} turns</p>
      {rec.error && <ErrorNote>{rec.error}</ErrorNote>}
      <div className="rounded-2xl border border-line bg-surface p-4"><Steps steps={rec.steps} hideFinalText={rec.finalText} /></div>
      {answerProse(rec.finalText) && <Markdown text={answerProse(rec.finalText)} className="text-[14px] text-ink" />}
    </div>
  );
}

function CellSheet({ open, combo, version, results, onClose }: {
  open: boolean; combo: string; version: string; results: RunRecord[]; onClose: () => void;
}) {
  const [picked, setPicked] = useState<RunRecord | null>(null);
  useEffect(() => { setPicked(null); }, [combo, version]);
  const rows = results.filter((r) => r.combo === combo && r.contextVersion === version).sort((a, b) => a.questionId.localeCompare(b.questionId));
  return (
    <Sheet open={open} onClose={onClose} onBack={picked ? () => setPicked(null) : undefined}
      title={picked ? `${picked.questionId.toUpperCase()} trace` : agentLabel(combo)}
      subtitle={picked ? `${agentLabel(combo)} · context ${version}` : `Context ${version} · ${rows.filter((r) => r.correct).length} of ${rows.length} correct`}>
      {picked ? <Trace rec={picked} /> : rows.length === 0 ? <p className="text-sm text-muted">No answers recorded yet.</p> : (
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
      )}
    </Sheet>
  );
}

function Matrix({ run }: { run: RunSummary }) {
  const { detail, error } = useRunDetail(run.runId);
  const [open, setOpen] = useState<{ combo: string; version: string } | null>(null);
  const [a, b] = [run.versions[0], run.versions[run.versions.length - 1]];
  const cell = (combo: string, v: string) => run.cells.find((c) => c.combo === combo && c.contextVersion === v);
  const twoWay = run.versions.length > 1;
  return (
    <>
      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
      <Card className="overflow-hidden">
        <div className={cx('hidden border-b border-line bg-code px-4 py-2.5 text-[12px] font-medium text-muted md:grid', twoWay ? 'md:grid-cols-[minmax(200px,1.3fr)_1fr_1fr_0.8fr]' : 'md:grid-cols-[minmax(200px,1.3fr)_1fr]')}>
          <span>Agent</span>
          {run.versions.map((v) => <span key={v} className="px-2.5">Context {v}</span>)}
          {twoWay && <span className="px-2.5">Change</span>}
        </div>
        <ul className="divide-y divide-line">
          {run.combos.map((combo) => (
            <li key={combo} className={cx('grid items-center gap-x-2 gap-y-1 px-3 py-3 md:px-4', twoWay ? 'grid-cols-2 md:grid-cols-[minmax(200px,1.3fr)_1fr_1fr_0.8fr]' : 'grid-cols-1 md:grid-cols-[minmax(200px,1.3fr)_1fr]')}>
              <div className="col-span-2 px-1 pb-1 md:col-span-1 md:pb-0"><AgentName combo={combo} /></div>
              {run.versions.map((v) => (
                <div key={v}>
                  <p className="px-2.5 text-[11.5px] font-medium text-faint md:hidden">Context {v}</p>
                  <AccuracyCell cell={cell(combo, v)} onOpen={() => setOpen({ combo, version: v })} />
                </div>
              ))}
              {twoWay && (
                <div className="col-span-2 border-t border-line pt-1 md:col-span-1 md:border-0 md:pt-0">
                  <ChangeCell a={cell(combo, a)} b={cell(combo, b)} mv={detail ? movement(detail.results, combo, a, b) : null} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <CellSheet open={!!open} combo={open?.combo ?? ''} version={open?.version ?? ''} results={detail?.results ?? []} onClose={() => setOpen(null)} />
    </>
  );
}

export function EvaluateView() {
  const { runs, loading } = useStore();
  const [runId, setRunId] = useState<string | null>(null);
  // Default: the newest unprompted full matrix (both releases, several agents), else the newest run.
  const run = runs.find((r) => r.runId === runId)
    ?? runs.find((r) => isDefaultVariant(r) && r.status === 'complete' && r.versions.length > 1 && r.combos.length > 2)
    ?? runs[0];
  if (loading) return <Centered><Spinner /></Centered>;
  if (!run) return <Centered>No evaluation runs yet. Run <code className="mx-1 font-mono">npm run run -- --combos ...</code> on the bridge machine.</Centered>;
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8">
      <PageHeader title="Evaluate" subtitle="Every agent answers the same questions on each context release. Each answer is checked against finance's books.">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <span className="sr-only sm:not-sr-only">Run</span>
          <select value={run.runId} onChange={(e) => setRunId(e.target.value)}
            className="h-9 max-w-[260px] rounded-xl border border-line bg-surface px-3 text-[13px] text-ink">
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {runName(r.runId, r.startedAt)}{isDefaultVariant(r) ? '' : ' · asked to review'}{r.status === 'running' ? ` (running ${r.done}/${r.total})` : ''}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      {run.status === 'running' && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
          <Spinner className="text-accent" />
          <span className="tnum">Running: {run.done} of {run.total} answers in</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover"><div className="h-full bg-accent transition-all" style={{ width: `${(run.done / run.total) * 100}%` }} /></div>
        </div>
      )}
      <p className="mb-5 text-[17px] font-medium leading-snug tracking-tight text-ink sm:text-[19px]">{headline(run.cells, run.versions)}</p>
      <Matrix run={run} />
      <p className="mt-4 text-[12px] text-muted">
        Correct means within 5 cents of finance's number. Time and input tokens are medians per answer, as each harness reports them; harnesses count tokens differently. Tap any cell for every answer and its full trace.
      </p>
    </div>
  );
}
