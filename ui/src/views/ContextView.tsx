// Context: the registered artifacts, what changed between versions, the AI-drafted fix, and the gated release.
import { useState } from 'react';
import { ChevronDown, FileText, GitCompareArrows, Sparkles } from 'lucide-react';
import { useStore } from '../lib/store';
import { versionStatusLabel } from '../lib/format';
import type { Artifact, ArtifactVersion, VersionStatus } from '../lib/types';
import { Badge, Card, Centered, PageHeader, Segmented, Spinner, cx } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { Diff, unwrap } from '../components/Diff';
import { ReleasePanel } from '../components/ReleasePanel';
import { ImpactPreview, releaseHeadline } from '../components/ImpactPreview';
import { ProposalPanel, draftedBy } from '../components/ProposalPanel';

const STATUS_TONE: Record<VersionStatus, 'pass' | 'warn' | 'neutral' | 'accent'> = {
  active: 'pass', pending_review: 'warn', superseded: 'neutral', proposed: 'accent',
};
const STATUS_DOT: Record<VersionStatus, string> = {
  active: 'bg-pass', pending_review: 'bg-warn', superseded: 'bg-faint', proposed: 'bg-accent',
};
const KIND_LABEL: Record<string, string> = { metric: 'Metric', ontology: 'Ontology', skill: 'Skill' };

function StatusBadge({ v }: { v: ArtifactVersion }) {
  return (
    <Badge tone={STATUS_TONE[v.status] ?? 'neutral'}>
      {v.status === 'proposed' && <Sparkles className="h-3 w-3" />}{versionStatusLabel[v.status] ?? v.status}
    </Badge>
  );
}

function Body({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-surface p-4 text-[14px] leading-relaxed text-ink">
      {unwrap(text).split('\n').map((line, i) => (
        <p key={i} className={cx(/^\d+\./.test(line) && 'pl-4 -indent-4', /:$/.test(line) && 'pt-1 font-medium')}>{line}</p>
      ))}
    </div>
  );
}

function DiffSection({ current, versions }: { current: ArtifactVersion; versions: ArtifactVersion[] }) {
  const others = versions.filter((v) => v.version !== current.version && v.version < current.version);
  const preferred = current.proposal?.basedOn ?? others[others.length - 1]?.version;
  const [against, setAgainst] = useState<string | null>(null);
  const base = others.find((v) => v.version === (against ?? preferred)) ?? others[others.length - 1];
  if (!base) return null;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink"><GitCompareArrows className="h-4 w-4 text-muted" /> Changes from {base.version}</h3>
        {others.length > 1 && (
          <Segmented label="Compare with" value={base.version} onChange={setAgainst}
            options={others.map((v) => ({ value: v.version, label: `vs ${v.version}${v.proposal ? '' : v.status === 'pending_review' ? ' (human fix)' : ''}` }))} />
        )}
      </div>
      <Diff from={base.body} to={current.body} />
    </section>
  );
}

function ArtifactDetail({ artifact }: { artifact: Artifact }) {
  const { context } = useStore();
  const versions = artifact.versions;
  const [version, setVersion] = useState(versions[versions.length - 1].version);
  const [showAgent, setShowAgent] = useState(false);
  const current = versions.find((v) => v.version === version) ?? versions[0];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">{artifact.title}</h2>
          <p className="font-mono text-[12px] text-muted">{artifact.ref}@{current.version}</p>
        </div>
        {versions.length > 1 && (
          <Segmented label="Version" value={version} onChange={setVersion}
            options={versions.map((v) => ({
              value: v.version,
              label: <span className="flex items-center gap-1.5">{v.proposal && <Sparkles className="h-3 w-3 text-accent" />}{v.version}<span className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[v.status] ?? 'bg-faint')} /></span>,
            }))} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge v={current} />
        {current.proposal && <Badge tone="accent">{draftedBy(current.proposal)}</Badge>}
      </div>
      {current.proposal && <ProposalPanel version={current} versions={versions} />}
      {current.proposal && <h3 className="pt-2 text-[13px] font-semibold text-ink">The drafted definition</h3>}
      <Body text={current.body} />
      <DiffSection key={current.version} current={current} versions={versions} />
      {current.changelog?.length ? (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">{current.proposal ? 'What the draft changes' : 'Why it changed'}</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-ink-2 marker:text-faint">{current.changelog.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      ) : null}
      {artifact.kind === 'metric' && !current.proposal && <FeedbackPanel />}
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

function ReleaseImpact() {
  const { context, analytics } = useStore();
  const rel = context!.releases;
  if (!rel.candidate) return null;
  const impact = analytics.impacts?.[`${rel.active}->${rel.candidate}`];
  if (!impact) return null;
  return <ImpactPreview impact={impact} title="Business impact preview" headline={releaseHeadline(impact)} />;
}

export function ContextView() {
  const { context, loading } = useStore();
  const [ref, setRef] = useState<string | null>(null);
  if (loading) return <Centered><Spinner /></Centered>;
  if (!context) return <Centered>Context could not be loaded.</Centered>;
  const artifact = context.artifacts.find((a) => a.ref === ref) ?? context.artifacts[0];
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8">
      <PageHeader title="Context" subtitle="The definitions agents read. Every change ships as a new immutable version, and reaches agents only after it passes the evaluation gate and a reviewer signs off." />
      <ul className="scroll-thin -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Artifacts">
        {context.artifacts.map((a) => {
          const flag = a.versions.some((v) => v.status === 'pending_review' || v.status === 'proposed');
          return (
            <li key={a.ref} className="shrink-0">
              <button type="button" onClick={() => setRef(a.ref)} aria-current={a.ref === artifact.ref ? 'true' : undefined}
                className={cx('rounded-xl border px-3.5 py-2 text-left transition-colors', a.ref === artifact.ref ? 'border-line-strong bg-surface shadow-card' : 'border-transparent hover:bg-hover')}>
                <span className="block text-[11px] font-medium uppercase tracking-wide text-faint">{KIND_LABEL[a.kind] ?? a.kind}</span>
                <span className="flex items-center gap-2 text-[14px] font-medium text-ink">{a.title}{flag && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Has versions awaiting review" />}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ArtifactDetail key={artifact.ref} artifact={artifact} />
        <div className="space-y-4"><ReleasePanel /><ReleaseImpact /></div>
      </div>
    </div>
  );
}
