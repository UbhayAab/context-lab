// Agents: which harnesses are signed in here, and the rulebook for mixing harness and intelligence.
import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, ExternalLink, FlaskConical, KeyRound, Lock, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { connectUrl } from '../lib/api';
import { agentLabel, parseCombo } from '../lib/format';
import type { Allowed, MixCell } from '../lib/types';
import { Avatar, Badge, Card, Centered, PageHeader, Spinner, cx } from '../components/ui';

const ALLOWED: Record<Allowed, { label: string; cls: string; icon: typeof KeyRound }> = {
  subscription: { label: 'Your plan', cls: 'bg-pass-soft text-pass border-pass/25', icon: UserRound },
  partner: { label: 'Partner sign-in', cls: 'bg-accent-soft text-accent-ink border-accent/25', icon: CheckCircle2 },
  'api-key': { label: 'API key', cls: 'bg-hover text-ink-2 border-line', icon: KeyRound },
  unverified: { label: 'Not verified', cls: 'bg-surface text-faint border-dashed border-line-strong', icon: CircleDashed },
  'not-allowed': { label: 'Not allowed', cls: 'bg-fail-soft text-fail border-fail/25', icon: Lock },
};

const SOURCES = [
  { label: 'Anthropic: Claude Code legal and compliance', href: 'https://code.claude.com/docs/en/legal-and-compliance' },
  { label: 'OpenAI: Sign in with ChatGPT client IDs', href: 'https://developers.openai.com/siwc/request-client-id' },
];

const HARNESS_ID: Record<string, string> = { 'Claude Code': 'claude-code', Codex: 'codex', 'Grok Build': 'grok', OpenCode: 'opencode', 'Your own harness': 'lab' };

export function AgentsView() {
  const { status, runs, loading, mode } = useStore();
  const [focus, setFocus] = useState<MixCell | null>(null);
  const measured = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) for (const c of r.combos) { const p = parseCombo(c); set.add(`${p.harnessName}|${p.intelligence}`); }
    return set;
  }, [runs]);
  if (loading) return <Centered><Spinner /></Centered>;
  if (!status) return <Centered>Agent status unavailable.</Centered>;
  const mix = status.mixMatrix;
  const cellOf = (h: string, i: string) => mix.cells.find((c) => c.harness === h && c.intelligence === i);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8">
      <PageHeader title="Agents" subtitle={mode === 'snapshot'
        ? 'Harnesses on the machine that recorded these runs. Run the bridge on your own machine to use your own signed-in plans.'
        : 'Harnesses found on this machine. Each one is the vendor\'s own client, signed in through the vendor\'s own flow. This app never sees a password or token.'} />

      {mode === 'snapshot' && (
        <Card className="mb-4 p-4 text-[13.5px] text-ink-2">
          <p className="font-medium text-ink">Run it on your own plans</p>
          <p className="mt-1">
            Clone the repo, run <code className="font-mono text-[12.5px]">npm run seed</code> and <code className="font-mono text-[12.5px]">npm run serve</code>, then open <code className="font-mono text-[12.5px]">http://127.0.0.1:4318</code>.
            Already running it with this site allowed? <a className="font-medium text-accent-ink underline underline-offset-2" href={connectUrl()}>Connect this page to your machine</a>.
          </p>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {status.harnesses.map((h) => {
          const state = h.recordedOnly ? { t: 'Recorded', tone: 'neutral' as const } : !h.installed ? { t: 'Not installed', tone: 'neutral' as const } : h.signedIn ? { t: 'Signed in', tone: 'pass' as const } : { t: 'Needs sign-in', tone: 'warn' as const };
          return (
            <Card key={h.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar harness={h.id} size={34} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[15px] font-semibold text-ink">{h.name}</p>
                  <p className="truncate text-[12px] text-muted">{h.vendor}{h.version?.match(/\d+\.\d+\.\d+[\w.-]*/) ? ` · v${h.version.match(/\d+\.\d+\.\d+[\w.-]*/)![0]}` : ''}</p>
                </div>
                <Badge tone={state.tone}>{state.t}</Badge>
              </div>
              {!h.recordedOnly && h.installed && !h.signedIn && <p className="mt-3 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">{h.signInHint}</p>}
              <ul className="mt-3 space-y-1.5">
                {h.models.map((m) => (
                  <li key={m.combo} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-ink-2">{agentLabel(m.combo).replace(` in ${h.name}`, '')}</span>
                    <span className="shrink-0 text-[11.5px] text-muted">{m.route === 'subscription' ? 'your plan' : m.route === 'local-bridge' ? 'local bridge' : 'API key'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <h2 className="mt-10 text-[18px] font-semibold tracking-tight text-ink">Mix and match</h2>
      <p className="mt-1 max-w-2xl text-[14px] text-muted">Most harnesses can drive most models. What changes is how you are allowed to pay for it. Tap a cell for how to set it up.</p>

      <Card className="mt-4 overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-code text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-medium">Harness</th>
                {mix.intelligence.map((i) => <th key={i} className="px-2 py-2.5 font-medium">{i}</th>)}
              </tr>
            </thead>
            <tbody>
              {mix.harnesses.map((h) => (
                <tr key={h} className="border-t border-line">
                  <td className="px-4 py-2.5"><span className="flex items-center gap-2 font-medium text-ink"><Avatar harness={HARNESS_ID[h] ?? h} size={22} />{h}</span></td>
                  {mix.intelligence.map((i) => {
                    const c = cellOf(h, i);
                    if (!c) return <td key={i} className="px-2 py-2.5 text-faint">-</td>;
                    const a = ALLOWED[c.allowed] ?? ALLOWED.unverified;
                    const isMeasured = measured.has(`${h}|${i}`);
                    const on = focus?.harness === h && focus.intelligence === i;
                    return (
                      <td key={i} className="px-2 py-2">
                        <button type="button" onClick={() => setFocus(on ? null : c)} title={c.how}
                          className={cx('flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] font-medium transition-shadow', a.cls, on && 'ring-2 ring-accent')}>
                          <a.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{a.label}</span>
                          {isMeasured && <FlaskConical className="ml-auto h-3.5 w-3.5 shrink-0" aria-label="Measured here" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-3 text-[13px]">
          {focus ? (
            <p className="text-ink-2"><span className="font-medium text-ink">{focus.harness} with {focus.intelligence}:</span> {focus.how}{measured.has(`${focus.harness}|${focus.intelligence}`) ? ' Measured in this lab.' : ''}</p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              <span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> measured in this lab</span>
              <span>Tap a cell for setup details</span>
            </p>
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {mix.rules.map((r, i) => (
          <Card key={i} className="p-4 text-[13.5px] leading-relaxed text-ink-2">{r}</Card>
        ))}
      </div>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
        Sources:
        {SOURCES.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
            {s.label}<ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </p>
    </div>
  );
}
