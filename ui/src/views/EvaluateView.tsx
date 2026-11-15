// Evaluate: every agent x every context release, merged across runs by default, any single run on demand.
import { useRef, useState } from 'react';
import { useCombinedRecords, useRunDetail, useStore } from '../lib/store';
import { runName } from '../lib/format';
import { headline, isDefaultVariant } from '../lib/gate';
import type { RunSummary } from '../lib/types';
import { Centered, PageHeader, Spinner } from '../components/ui';
import { Matrix } from '../components/Matrix';
import { AmbiguityPanel } from '../components/AmbiguityPanel';

const ALL = '__all';

function RunMatrix({ run }: { run: RunSummary }) {
  const { detail, error, loading } = useRunDetail(run.runId);
  return (
    <>
      <p className="mb-5 text-[17px] font-medium leading-snug tracking-tight text-ink sm:text-[19px]">{headline(run.cells, run.versions)}</p>
      <Matrix combos={run.combos} versions={run.versions} cells={run.cells} records={detail?.results ?? []} recordsLoading={loading} recordsError={error} />
    </>
  );
}

function AllReleases() {
  const { analytics } = useStore();
  const combined = analytics.combined!;
  const { records, loading, error } = useCombinedRecords(combined.source);
  const ambiguity = useRef<HTMLElement>(null);
  return (
    <>
      <p className="mb-5 text-[17px] font-medium leading-snug tracking-tight text-ink sm:text-[19px]">{headline(combined.cells, combined.versions)}</p>
      <Matrix combos={combined.combos} versions={combined.versions} cells={combined.cells} records={records}
        recordsLoading={loading} recordsError={error} consensus={analytics.consensus}
        onShowSplits={() => ambiguity.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      {analytics.consensus && <AmbiguityPanel ref={ambiguity} consensus={analytics.consensus} versions={combined.versions} cells={combined.cells} />}
    </>
  );
}

export function EvaluateView() {
  const { runs, loading, analytics, analyticsLoaded } = useStore();
  const [pick, setPick] = useState<string | null>(null);
  const hasAll = !!analytics.combined?.cells.length;
  if (loading || (!analyticsLoaded && !runs.length)) return <Centered><Spinner /></Centered>;

  const fallback = runs.find((r) => isDefaultVariant(r) && r.status === 'complete' && r.versions.length > 1 && r.combos.length > 2) ?? runs[0];
  const selected = pick ?? (hasAll ? ALL : fallback?.runId ?? null);
  const run = selected === ALL ? null : runs.find((r) => r.runId === selected) ?? fallback;
  if (!hasAll && !run) return <Centered>No evaluation runs yet. Run <code className="mx-1 font-mono">npm run run -- --combos ...</code> on the bridge machine.</Centered>;
  const running = runs.find((r) => r.status === 'running');

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8">
      <PageHeader title="Evaluate" subtitle="Every agent answers the same questions on each context release. Each answer is checked against finance's books.">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <span className="sr-only sm:not-sr-only">View</span>
          <select value={selected ?? ''} onChange={(e) => setPick(e.target.value)}
            className="h-9 max-w-[280px] rounded-xl border border-line bg-surface px-3 text-[13px] text-ink">
            {hasAll && <option value={ALL}>All releases (latest answer per agent)</option>}
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                Run {runName(r.runId, r.startedAt)}{isDefaultVariant(r) ? '' : ' · asked to review'}{r.status === 'running' ? ` (running ${r.done}/${r.total})` : ''}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      {running && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
          <Spinner className="text-accent" />
          <span className="tnum">Run {running.runId.replace(/^.*Z-/, '')} in progress: {running.done} of {running.total} answers</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover"><div className="h-full bg-accent transition-all" style={{ width: `${(running.done / running.total) * 100}%` }} /></div>
        </div>
      )}
      {selected === ALL && hasAll ? <AllReleases /> : run ? <RunMatrix run={run} /> : null}
      <p className="mt-6 text-[12px] text-muted">
        Correct means within 5 cents of finance's number. Time and input tokens are medians per answer, as each harness reports them; harnesses count tokens differently. Tap any cell for every answer and its full trace.
        {selected === ALL ? ' "All releases" merges every unprompted run and keeps the newest answer per agent, release and question.' : ''}
      </p>
    </div>
  );
}
