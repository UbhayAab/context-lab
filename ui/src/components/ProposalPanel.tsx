// Self-improving loop: an AI-drafted version, what it was (and was not) shown, what a human must decide,
// how agents score on it, and exactly where it disagrees with the human fix.
import { useState } from 'react';
import { CircleCheck, EyeOff, Sparkles, Split } from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtDate, parseCombo } from '../lib/format';
import type { ArtifactVersion, Proposal } from '../lib/types';
import { Avatar, Card, cx } from './ui';
import { ImpactPreview, compareHeadline } from './ImpactPreview';

export function draftedBy(p: Proposal) {
  return `Drafted by ${parseCombo(p.proposedBy).modelName} from agent evidence`;
}

function seenLine(p: Proposal) {
  const saw = `Saw only the flawed definition (${p.basedOn}), ${p.evidence.quotes} agent quotes and ${p.evidence.disagreements} disagreements.`;
  if (!p.sawGoldenAnswers && !p.sawHumanFix) return `${saw} Never saw the golden answers or the human fix.`;
  if (!p.sawGoldenAnswers) return `${saw} Never saw the golden answers, but did see the human fix.`;
  if (!p.sawHumanFix) return `${saw} Never saw the human fix, but did see the golden answers.`;
  return `${saw} Also saw the golden answers and the human fix.`;
}

function Assumptions({ items }: { items: string[] }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const count = Object.values(done).filter(Boolean).length;
  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink">
        Needs a human decision <span className="text-[12px] font-normal text-muted tnum">{count} of {items.length} reviewed</span>
      </h3>
      <p className="mb-2 text-[12.5px] text-muted">The drafter could not settle these from evidence. Each is a business policy call.</p>
      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((a, i) => (
          <li key={i} className="border-b border-line last:border-0">
            <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-hover">
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
              <span className={cx('text-[13.5px] leading-relaxed', done[i] ? 'text-muted line-through' : 'text-ink-2')}>{a}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Scores({ version }: { version: string }) {
  const { analytics } = useStore();
  const cells = analytics.combined?.cells.filter((c) => c.contextVersion === version) ?? [];
  const agree = analytics.consensus?.[version];
  if (!cells.length) {
    return <Card className="p-4 text-[13px] text-muted">Not evaluated yet. Agent scores on {version} appear here once a run covers it.</Card>;
  }
  const correct = cells.reduce((s, c) => s + c.correct, 0);
  const n = cells.reduce((s, c) => s + c.n, 0);
  const allAgreeButWrong = agree && agree.agreed === agree.total && correct < n;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[14px] font-medium text-ink tnum">{cells.length} agents answered {correct} of {n} correctly on {version}{agree ? `, and agreed with each other on ${agree.agreed}/${agree.total}` : ''}.</p>
        {allAgreeButWrong && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-muted">
            <Split className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Agreement catches ambiguous context, not a wrong policy choice: agents can all agree on a number finance would reject.
          </p>
        )}
      </div>
      <ul className="grid gap-px bg-line sm:grid-cols-2">
        {cells.map((c) => {
          const p = parseCombo(c.combo);
          return (
            <li key={c.combo} className="flex items-center gap-2.5 bg-surface px-4 py-2.5">
              <Avatar harness={p.harness} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{p.modelName} <span className="text-muted">in {p.harnessName}{p.via === 'bridge' ? '*' : ''}</span></span>
              <span className={cx('text-[13px] font-semibold tnum', c.accuracy >= 90 ? 'text-pass' : c.accuracy >= 50 ? 'text-warn' : 'text-fail')}>{c.correct}/{c.n}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The human fix this draft is compared against: the pending candidate, else the newest non-draft version. */
function humanFix(versions: ArtifactVersion[], candidate: string | null, self: string) {
  if (candidate && candidate !== self) return candidate;
  return [...versions].reverse().find((v) => !v.proposal && v.version !== self)?.version ?? null;
}

export function ProposalPanel({ version, versions }: { version: ArtifactVersion; versions: ArtifactVersion[] }) {
  const { analytics, context } = useStore();
  const p = version.proposal!;
  const fix = humanFix(versions, context?.releases.candidate ?? null, version.version);
  const impact = fix ? analytics.impacts?.[`${fix}->${version.version}`] : undefined;
  const dateAssumption = p.assumptions.find((a) => /refund_date|period|date/i.test(a));
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-ink"><Sparkles className="h-3.5 w-3.5 shrink-0" /> Self-improving loop</p>
        <p className="mt-2 flex items-start gap-2 text-[13.5px] leading-relaxed text-ink">
          <EyeOff className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-ink" /><span>{seenLine(p)}</span>
        </p>
        <p className="mt-1.5 flex items-start gap-2 text-[12px] text-muted">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Evidence: agents agreed on {p.evidence.agreement} questions on {p.basedOn}, across {p.evidenceRunIds.length} runs. Drafted {fmtDate(p.createdAt)}.</span>
        </p>
      </div>
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">How agents score on the draft</h3>
        <Scores version={version.version} />
      </section>
      {fix && (
        <section>
          {impact ? (
            <ImpactPreview impact={impact} title={`AI draft vs human fix (${fix} to ${version.version})`}
              headline={compareHeadline(impact, `the human fix (${fix})`, `The AI draft (${version.version})`)}
              note={dateAssumption && impact.moved > 0 ? `The drafter flagged this itself as an assumption: "${dateAssumption}"` : undefined} />
          ) : (
            <Card className="p-4 text-[13px] text-muted">The comparison with the human fix ({fix}) appears once {version.version} has been evaluated.</Card>
          )}
        </section>
      )}
      <Assumptions items={p.assumptions} />
    </div>
  );
}
