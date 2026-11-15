// "What the agents told us": defects agents named in their own answers, before anyone fixed the definition.
import { useEffect, useState } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { useStore } from '../lib/store';
import { getFeedback, hasReviewFeedback } from '../lib/api';
import { agentLabel, parseCombo } from '../lib/format';
import type { Feedback, FeedbackTopic, Variant } from '../lib/types';
import { Avatar, Badge, Card, ErrorNote, Segmented, Spinner, cx } from './ui';

const QUOTES_SHOWN = 2;

/** Threshold stated in the analyzer's own method text ("at 2+ mentions"), default 2. */
function threshold(method: string) {
  const m = method.match(/(\d+)\+\s*mentions/i);
  return m ? Number(m[1]) : 2;
}

function listAgents(combos: string[]) {
  const names = combos.map(agentLabel);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function headlineOf(fb: Feedback) {
  const lead = fb.fixesAnticipated > 0
    ? `Agents raised ${fb.fixesAnticipated} of the ${fb.fixesTotal} defects before anyone fixed the definition.`
    : `No agent flagged any of the ${fb.fixesTotal} defects in context ${fb.contextVersion}.`;
  if (!fb.silentAgents.length) return `${lead} Every agent raised at least one.`;
  if (fb.silentAgents.length === fb.agents.length) return lead;
  return `${lead} ${listAgents(fb.silentAgents)} stayed silent.`;
}

function AgentBars({ topic, agents, perAgent }: { topic: FeedbackTopic; agents: string[]; perAgent: number }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {agents.map((c) => {
        const n = topic.byCombo[c] ?? 0;
        const p = parseCombo(c);
        return (
          <li key={c} className="flex items-center gap-2 text-[12px]" title={`${agentLabel(c)}: ${n} of ${perAgent} answers`}>
            <Avatar harness={p.harness} size={18} />
            <span className="w-[92px] shrink-0 truncate text-ink-2">{p.modelName}{p.via === 'bridge' ? '*' : ''}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
              <span className={cx('block h-full rounded-full', n ? 'bg-accent' : '')} style={{ width: `${Math.min(100, (n / perAgent) * 100)}%` }} />
            </span>
            <span className={cx('w-5 shrink-0 text-right tnum', n ? 'font-medium text-ink' : 'text-faint')}>{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TopicRow({ topic, fb, min }: { topic: FeedbackTopic; fb: Feedback; min: number }) {
  const anticipated = topic.mentions >= min;
  const perAgent = Math.max(1, Math.round(fb.answersAnalyzed / Math.max(1, fb.agents.length)));
  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">{topic.label}</p>
          <p className="text-[12px] text-muted tnum">{topic.mentions} {topic.mentions === 1 ? 'mention' : 'mentions'} across {topic.agentsRaising.length} {topic.agentsRaising.length === 1 ? 'agent' : 'agents'}</p>
        </div>
        <Badge tone={anticipated ? 'pass' : 'neutral'}>{anticipated ? 'Anticipated the fix' : `Below ${min} mentions`}</Badge>
      </div>
      <AgentBars topic={topic} agents={fb.agents} perAgent={perAgent} />
      {topic.quotes.slice(0, QUOTES_SHOWN).map((q, i) => (
        <figure key={i} className="rounded-xl border-l-2 border-accent/50 bg-code px-3 py-2">
          <blockquote className="text-[13px] leading-relaxed text-ink-2">"{q.text}"</blockquote>
          <figcaption className="mt-1 text-[11.5px] text-muted">{agentLabel(q.combo)} · {q.questionId}</figcaption>
        </figure>
      ))}
      {fb.fixVersion && <p className="text-[12px] text-muted"><span className="font-medium text-ink-2">Fixed in {fb.fixVersion}:</span> {topic.fix}</p>}
    </li>
  );
}

export function FeedbackPanel() {
  const { runs, mode } = useStore();
  const [variant, setVariant] = useState<Variant>('default');
  const [data, setData] = useState<Partial<Record<Variant, Feedback | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const reviewAvailable = hasReviewFeedback(runs);
  const runsKey = runs.map((r) => `${r.runId}:${r.status}`).join('|');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getFeedback(variant, runs)
      .then((fb) => { if (!cancelled) setData((d) => ({ ...d, [variant]: fb })); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // runsKey captures run completion; `runs` itself changes identity on every poll.
  }, [variant, runsKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const fb = data[variant];
  const min = fb ? threshold(fb.method) : 2;
  const topics = fb ? [...fb.topics].sort((a, b) => b.mentions - a.mentions) : [];

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink"><MessageSquareQuote className="h-4 w-4 text-muted" /> What the agents told us</h3>
        {reviewAvailable && (
          <Segmented label="Prompt" value={variant} onChange={setVariant}
            options={[{ value: 'default', label: 'Unprompted' }, { value: 'review', label: 'Asked to review' }]} />
        )}
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : fb === undefined ? (
        <Card className="flex items-center gap-2 p-4 text-[13px] text-muted"><Spinner /> Reading the agents' answers</Card>
      ) : fb === null ? (
        <Card className="p-4 text-[13px] text-muted">No complete {variant === 'review' ? 'review' : 'evaluation'} run to analyze yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3.5">
            <p className="text-[15px] font-medium leading-snug text-ink">{headlineOf(fb)}</p>
            <p className="mt-1 text-[12px] text-muted tnum">
              From {fb.answersAnalyzed} answers on context {fb.contextVersion}{variant === 'review' ? ', with agents asked to flag anything wrong' : ', with no prompt to critique'}.
            </p>
          </div>
          <ul className="divide-y divide-line">{topics.map((t) => <TopicRow key={t.id} topic={t} fb={fb} min={min} />)}</ul>
          <p className="border-t border-line bg-code px-4 py-2.5 text-[11.5px] leading-relaxed text-muted">{fb.method}{fb.agents.some((c) => c.includes('@bridge')) ? ' * local bridge.' : ''}</p>
        </Card>
      )}
    </section>
  );
}
