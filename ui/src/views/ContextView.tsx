// Context: the registered artifacts, what changed between releases, and the gated release step.
import { useMemo, useState } from 'react';
import { ChevronDown, FileText, GitCompareArrows, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useRunDetail, useStore } from '../lib/store';
import { approveRelease } from '../lib/api';
import { computeGate, pickGateRun } from '../lib/gate';
import { fmtDate, versionStatusLabel } from '../lib/format';
import type { Artifact } from '../lib/types';
import { Badge, Button, Card, Centered, ErrorNote, PageHeader, Segmented, Spinner, cx } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { FeedbackPanel } from '../components/FeedbackPanel';

type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** Joins hard-wrapped source lines into logical lines: a line starting lowercase, "(" or indented continues the previous one. */
function unwrap(body: string): string {
  const out: string[] = [];
  for (const raw of body.split('\n')) {
    const continues = out.length > 0 && (/^\s+\S/.test(raw) || /^[a-z(]/.test(raw));
    if (continues) out[out.length - 1] += ` ${raw.trim()}`;
    else out.push(raw.trimEnd());
  }
  return out.join('\n');
}

function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split('\n');
  const y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) {
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: 'same', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'del', text: x[i++] });
    else out.push({ kind: 'add', text: y[j++] });
  }
  while (i < x.length) out.push({ kind: 'del', text: x[i++] });
  while (j < y.length) out.push({ kind: 'add', text: y[j++] });
  return out;
}

const STATUS_TONE = { active: 'pass', pending_review: 'warn', superseded: 'neutral' } as const;
const KIND_LABEL: Record<string, string> = { metric: 'Metric', ontology: 'Ontology', skill: 'Skill' };

function Diff({ from, to }: { from: string; to: string }) {
  const lines = useMemo(() => lineDiff(unwrap(from), unwrap(to)), [from, to]);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-code py-1.5 text-[13px] leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={cx('flex gap-2 px-3 py-1', l.kind === 'add' && 'bg-pass-soft text-pass', l.kind === 'del' && 'bg-fail-soft text-fail', l.kind === 'same' && 'text-ink-2')}>
          <span className="w-3 shrink-0 select-none font-mono opacity-70">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>
          <span className={cx('min-w-0 whitespace-pre-wrap break-words', l.kind === 'del' && 'line-through decoration-fail/40')}>{l.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function ReleasePanel() {
  const { context, runs, mode, refreshContext } = useStore();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const rel = context!.releases;
  const gateRun = rel.candidate ? pickGateRun(runs, rel.active, rel.candidate) : null;
  const { detail, loading } = useRunDetail(gateRun?.runId);
  const gate = rel.candidate ? computeGate(gateRun, detail ?? null, rel.active, rel.candidate) : null;
  const live = mode !== 'snapshot';

  const approve = async () => {
    if (!rel.candidate) return;
    setBusy(true); setErr(null);
    try {
      const res = await approveRelease(rel.candidate, note.trim());
      if (res.releases) { setNote(''); await refreshContext(); } else setErr(res.reasons?.length ? res.reasons : [res.error ?? 'Release failed']);
    } catch (e) {
      setErr([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <p className="text-[13px] font-semibold text-ink">Release</p>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <p className="flex justify-between gap-2"><span className="text-muted">Active</span><span className="font-medium text-ink">Net revenue {rel.active}</span></p>
        <p className="flex justify-between gap-2"><span className="text-muted">Candidate</span><span className="font-medium text-ink">{rel.candidate ? `Net revenue ${rel.candidate}` : 'None pending'}</span></p>
      </div>
      {rel.candidate && gate && (
        <div className={cx('mt-4 rounded-xl px-3.5 py-3 text-[13px]', loading ? 'bg-hover text-muted' : gate.ok ? 'bg-pass-soft text-pass' : 'bg-warn-soft text-warn')}>
          {loading ? <span className="flex items-center gap-2"><Spinner /> Checking the gate</span> : (
            <>
              <p className="flex items-center gap-2 font-medium">
                {gate.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                {gate.ok ? `No regressions across ${gate.agents} agents` : 'Gate not passed'}
              </p>
              {!gate.ok && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px]">{gate.reasons.slice(0, 6).map((r) => <li key={r}>{r}</li>)}</ul>}
              {gate.evidenceRunId && <p className="mt-1 text-[12px] opacity-80">Evidence: run {gate.evidenceRunId.replace(/^.*Z-/, '')}</p>}
            </>
          )}
        </div>
      )}
      {rel.candidate && (
        <div className="mt-4 space-y-2.5">
          <label className="block text-[12.5px] font-medium text-ink-2" htmlFor="review-note">Review note</label>
          <textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={!live}
            placeholder={live ? 'What you checked, and who signed off' : 'Approval needs the local bridge'}
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong disabled:opacity-60" />
          <Button variant="primary" className="w-full" disabled={!live || busy || note.trim().length < 8 || !gate?.ok} onClick={approve}>
            {busy ? <Spinner /> : `Approve and release ${rel.candidate}`}
          </Button>
          {!live && <p className="text-[12px] text-muted">Recorded mode is read-only.</p>}
          {live && note.trim().length > 0 && note.trim().length < 8 && <p className="text-[12px] text-muted">A note of at least 8 characters is required.</p>}
          {err && <ErrorNote>{err.join('. ')}</ErrorNote>}
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-[12px] font-medium text-faint">History</p>
        <ul className="space-y-2.5">
          {[...rel.history].reverse().map((h) => (
            <li key={h.version + h.at} className="text-[12.5px]">
              <p className="flex items-center gap-2"><span className="font-medium text-ink">{h.version}</span><Badge tone={h.status === 'active' ? 'pass' : 'neutral'}>{h.status}</Badge><span className="ml-auto text-muted">{fmtDate(h.at)}</span></p>
              <p className="mt-0.5 text-muted">{h.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ArtifactDetail({ artifact }: { artifact: Artifact }) {
  const { context } = useStore();
  const versions = artifact.versions;
  const [version, setVersion] = useState(versions[versions.length - 1].version);
  const [showAgent, setShowAgent] = useState(false);
  const current = versions.find((v) => v.version === version) ?? versions[0];
  const prev = versions[versions.findIndex((v) => v.version === current.version) - 1];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-faint">{KIND_LABEL[artifact.kind] ?? artifact.kind}</p>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">{artifact.title}</h2>
          <p className="font-mono text-[12px] text-muted">{artifact.ref}@{current.version}</p>
        </div>
        {versions.length > 1 && (
          <Segmented label="Version" value={version} onChange={setVersion}
            options={versions.map((v) => ({ value: v.version, label: <span className="flex items-center gap-1.5">{v.version}<span className={cx('h-1.5 w-1.5 rounded-full', v.status === 'active' ? 'bg-pass' : v.status === 'pending_review' ? 'bg-warn' : 'bg-faint')} /></span> }))} />
        )}
      </div>
      <div className="flex items-center gap-2"><Badge tone={STATUS_TONE[current.status]}>{versionStatusLabel[current.status]}</Badge></div>
      <div className="space-y-1.5 rounded-xl border border-line bg-surface p-4 text-[14px] leading-relaxed text-ink">
        {unwrap(current.body).split('\n').map((line, i) => (
          <p key={i} className={cx(/^\d+\./.test(line) && 'pl-4 -indent-4', /:$/.test(line) && 'pt-1 font-medium')}>{line}</p>
        ))}
      </div>
      {prev && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink"><GitCompareArrows className="h-4 w-4 text-muted" /> Changes from {prev.version}</h3>
          <Diff from={prev.body} to={current.body} />
        </section>
      )}
      {current.changelog?.length ? (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Why it changed</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-ink-2 marker:text-faint">{current.changelog.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      ) : null}
      {artifact.kind === 'metric' && <FeedbackPanel />}
      {artifact.kind === 'metric' && context?.rendered[current.version] && (
        <section>
          <button type="button" onClick={() => setShowAgent((s) => !s)} className="flex items-center gap-2 text-[13px] font-semibold text-ink hover:text-accent-ink">
            <FileText className="h-4 w-4 text-muted" /> What the agent sees
            <ChevronDown className={cx('h-4 w-4 transition-transform', !showAgent && '-rotate-90')} />
          </button>
          {showAgent && <Card className="mt-2 p-4"><Markdown text={context.rendered[current.version]} className="text-[13.5px] text-ink-2" /></Card>}
        </section>
      )}
    </div>
  );
}

export function ContextView() {
  const { context, loading } = useStore();
  const [ref, setRef] = useState<string | null>(null);
  if (loading) return <Centered><Spinner /></Centered>;
  if (!context) return <Centered>Context could not be loaded.</Centered>;
  const artifact = context.artifacts.find((a) => a.ref === ref) ?? context.artifacts[0];
  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8">
      <PageHeader title="Context" subtitle="The definitions agents read. Every change ships as a new immutable version, and reaches agents only after it passes the evaluation gate and a reviewer signs off." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <ul className="scroll-thin flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {context.artifacts.map((a) => {
            const pending = a.versions.some((v) => v.status === 'pending_review');
            return (
              <li key={a.ref} className="shrink-0">
                <button type="button" onClick={() => setRef(a.ref)}
                  className={cx('w-full rounded-xl px-3 py-2 text-left transition-colors', a.ref === artifact.ref ? 'bg-hover' : 'hover:bg-hover')}>
                  <span className="block text-[11.5px] font-medium uppercase tracking-wide text-faint">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  <span className="flex items-center gap-2 text-[14px] font-medium text-ink">{a.title}{pending && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Change pending review" />}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <ArtifactDetail key={artifact.ref} artifact={artifact} />
        <div className="lg:sticky lg:top-6 lg:self-start"><ReleasePanel /></div>
      </div>
    </div>
  );
}
