// One agent's answer: header, collapsible work log, prose answer, and the verification chip.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, CircleAlert, History, X } from 'lucide-react';
import type { AgentRun } from '../lib/types';
import { agentLabel, fmtDate, fmtMoney, fmtSeconds, fmtSignedMoney, fmtTokens, parseCombo } from '../lib/format';
import { answerProse, countQueries } from '../lib/sql';
import { Avatar, Spinner, cx } from './ui';
import { Steps } from './Steps';
import { Markdown } from './Markdown';

export function VerifyChip({ run, large }: { run: Pick<AgentRun, 'answer' | 'golden' | 'correct'>; large?: boolean }) {
  if (run.golden == null || run.correct == null) return null;
  const size = large ? 'px-3 py-1.5 text-[13.5px]' : 'px-2.5 py-1 text-[12.5px]';
  if (run.correct) {
    return (
      <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-pass-soft font-medium text-pass tnum', size)}>
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Matches finance: {fmtMoney(run.golden)}
      </span>
    );
  }
  const off = run.answer == null ? null : run.answer - run.golden;
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1.5 rounded-full bg-fail-soft font-medium text-fail tnum', size)}>
      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      Finance says {fmtMoney(run.golden)}
      {off != null ? <span className="font-normal opacity-90">(off by {fmtSignedMoney(off)})</span> : <span className="font-normal opacity-90">(no answer given)</span>}
    </span>
  );
}

function useElapsed(run: AgentRun) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.status !== 'streaming') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run.status]);
  return run.status === 'streaming' ? now - run.startedAt : run.durationMs;
}

export function RunHeader({ run, compact }: { run: AgentRun; compact?: boolean }) {
  const p = parseCombo(run.combo);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar harness={p.harness} size={compact ? 26 : 28} />
      <div className="min-w-0 text-[13px] leading-tight">
        <p className="truncate font-medium text-ink">{compact ? agentLabel(run.combo) : `${p.harnessName} · ${p.modelName}${p.via === 'bridge' ? ' (local bridge)' : ''}`}</p>
        <p className="truncate text-[12px] text-muted">context {run.contextVersion}{run.recorded ? ` · Recorded run, ${fmtDate(run.recorded.at)}` : ''}</p>
      </div>
    </div>
  );
}

export function WorkLog({ run, defaultOpen }: { run: AgentRun; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const elapsed = useElapsed(run);
  const queries = countQueries(run.steps);
  const streaming = run.status === 'streaming';
  const summary = streaming
    ? `Working${run.steps.length ? ` · ${queries} ${queries === 1 ? 'query' : 'queries'}` : ''} · ${fmtSeconds(elapsed)}`
    : `Worked for ${fmtSeconds(elapsed)} · ${queries} ${queries === 1 ? 'query' : 'queries'}${run.usage?.inputTokens ? ` · ${fmtTokens(run.usage.inputTokens)} tokens in` : ''}`;
  const showSteps = open || (streaming && run.steps.length > 0);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={showSteps}
        className="group inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] text-muted hover:text-ink">
        {streaming ? <Spinner className="text-accent" /> : <ChevronDown className={cx('h-4 w-4 transition-transform', !showSteps && '-rotate-90')} />}
        <span className={streaming ? 'shimmer-text' : undefined}>{summary}</span>
      </button>
      {showSteps && (
        <div className="mt-2 mb-1 rounded-2xl border border-line bg-surface p-4">
          <Steps steps={run.steps} hideFinalText={run.finalText} />
        </div>
      )}
    </div>
  );
}

/** Full-width assistant message for a single agent. */
export function AgentRunMessage({ run }: { run: AgentRun }) {
  const prose = answerProse(run.finalText);
  return (
    <div className="animate-rise space-y-2.5">
      <div className="flex items-center gap-2">
        <RunHeader run={run} />
        {run.recorded && <History className="h-3.5 w-3.5 shrink-0 text-faint" aria-label="Recorded run" />}
      </div>
      <WorkLog run={run} />
      {run.status === 'error' && <p className="flex items-start gap-2 text-[14px] text-fail"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{run.error}</p>}
      {prose && <Markdown text={prose} className="text-[15px] leading-relaxed text-ink" />}
      {run.status === 'done' && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {run.answer != null && run.correct == null && <span className="rounded-full bg-hover px-2.5 py-1 text-[12.5px] font-medium text-ink tnum">Answer: {fmtMoney(run.answer)}</span>}
          <VerifyChip run={run} />
          {run.error && run.finalText && <span className="text-[12px] text-warn">{run.error}</span>}
        </div>
      )}
    </div>
  );
}

/** Compact card used side by side when comparing agents. */
export function AgentRunCompareCard({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(false);
  const streaming = run.status === 'streaming';
  const elapsed = useElapsed(run);
  const tone = run.correct === true ? 'border-pass/40' : run.correct === false ? 'border-fail/40' : 'border-line';
  return (
    <div className={cx('animate-rise flex flex-col rounded-2xl border bg-surface p-4 transition-colors', tone)}>
      <RunHeader run={run} compact />
      <div className="mt-4 flex-1">
        {streaming ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner className="text-accent" />
            <span className="shimmer-text">{run.steps.length ? `${countQueries(run.steps)} ${countQueries(run.steps) === 1 ? 'query' : 'queries'} so far` : 'Reading the context'} · {fmtSeconds(elapsed)}</span>
          </div>
        ) : run.status === 'error' ? (
          <p className="text-[13px] text-fail">{run.error}</p>
        ) : (
          <>
            <p className="text-[26px] font-semibold tracking-tight text-ink tnum">{run.answer != null ? fmtMoney(run.answer) : 'No answer'}</p>
            <div className="mt-2"><VerifyChip run={run} /></div>
          </>
        )}
      </div>
      {!streaming && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
          <span className="tnum">{fmtSeconds(elapsed)} · {countQueries(run.steps)} {countQueries(run.steps) === 1 ? 'query' : 'queries'}</span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium text-accent-ink hover:underline">{open ? 'Hide trace' : 'View trace'}</button>
        </div>
      )}
      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <Steps steps={run.steps} hideFinalText={run.finalText} />
          {answerProse(run.finalText) && <Markdown text={answerProse(run.finalText)} className="text-[13.5px] text-ink-2" />}
        </div>
      )}
    </div>
  );
}
