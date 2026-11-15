// Composer pickers: which agent(s) answer, and which context release they read.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Layers, Lock } from 'lucide-react';
import type { ContextPayload, Harness, HarnessModel, Mode, RunSummary } from '../lib/types';
import { agentLabel, parseCombo, versionStatusLabel } from '../lib/format';
import { Avatar, Badge, cx } from './ui';

const ROUTE_LABEL: Record<string, string> = { subscription: 'your plan', 'local-bridge': 'local bridge', 'api-key': 'API key' };

export interface AgentOption extends HarnessModel {
  harnessId: string;
  harnessName: string;
  available: boolean;
  reason: string | null;
}

export function agentOptions(harnesses: Harness[], mode: Mode, runs: RunSummary[]): AgentOption[] {
  const recorded = new Set(runs.flatMap((r) => r.combos));
  return harnesses.flatMap((h) => h.models.map((m) => {
    let reason: string | null = null;
    if (mode === 'snapshot') reason = recorded.has(m.combo) ? null : 'No recorded runs yet';
    else if (!h.installed) reason = `${h.name} is not installed`;
    else if (!h.signedIn) reason = `Sign in first: ${h.signInHint}`;
    return { ...m, harnessId: h.id, harnessName: h.name, available: reason === null, reason };
  }));
}

function Popover({ open, onClose, children, width = 340 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown));
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 sm:hidden" style={{ background: 'var(--scrim)' }} />
      <div ref={ref} role="dialog" style={{ ['--pw' as string]: `${width}px` }}
        className="animate-rise scroll-thin fixed inset-x-3 bottom-3 z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-raised p-1.5 shadow-pop sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:max-h-[60vh] sm:w-[var(--pw)]">
        {children}
      </div>
    </>
  );
}

function PillButton({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors',
        active ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-hover')}>
      {children}
    </button>
  );
}

export function AgentPicker({ options, selected, multi, onChange }: {
  options: AgentOption[]; selected: string[]; multi: boolean; onChange: (combos: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(options.map((o) => o.harnessName))];
  const first = selected[0];
  const toggle = (combo: string) => {
    if (!multi) { onChange([combo]); setOpen(false); return; }
    const next = selected.includes(combo) ? selected.filter((c) => c !== combo) : [...selected, combo];
    onChange(next.length ? next : [combo]);
  };
  return (
    <div className="relative">
      <PillButton onClick={() => setOpen((o) => !o)} active={open}>
        {multi ? <Layers className="h-3.5 w-3.5" /> : first ? <Avatar harness={parseCombo(first).harness} size={18} /> : null}
        <span className="truncate">{multi ? `${selected.length} agents` : first ? agentLabel(first) : 'Choose an agent'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </PillButton>
      <Popover open={open} onClose={() => setOpen(false)} width={360}>
        <p className="px-3 pt-2 pb-1 text-[12px] text-muted">{multi ? 'Pick the agents to compare' : 'Harness and intelligence'}</p>
        {groups.map((g) => (
          <div key={g} className="py-1">
            <p className="px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-faint">{g}</p>
            {options.filter((o) => o.harnessName === g).map((o) => {
              const on = selected.includes(o.combo);
              return (
                <button key={o.combo} type="button" disabled={!o.available} onClick={() => toggle(o.combo)}
                  className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                    o.available ? 'hover:bg-hover' : 'cursor-not-allowed opacity-55', on && 'bg-hover')}>
                  <Avatar harness={o.harnessId} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-medium text-ink">{o.label}</span>
                      <Badge tone={o.route === 'subscription' ? 'accent' : o.route === 'local-bridge' ? 'warn' : 'neutral'}>{ROUTE_LABEL[o.route] ?? o.route}</Badge>
                    </span>
                    <span className="block text-[12px] text-muted">
                      {o.reason ? <><Lock className="mr-1 inline h-3 w-3" />{o.reason}</> : `${o.intelligence} intelligence in the ${o.harnessName} harness`}
                    </span>
                  </span>
                  <span className={cx('mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded', multi && 'border border-line-strong', on && 'border-accent bg-accent text-white')}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </Popover>
    </div>
  );
}

export function ContextPicker({ context, value, onChange }: { context: ContextPayload; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const metric = context.artifacts.find((a) => a.kind === 'metric');
  const versions = metric?.versions ?? Object.keys(context.rendered).map((v) => ({ version: v, status: 'superseded' as const, body: '', changelog: null }));
  const current = versions.find((v) => v.version === value);
  return (
    <div className="relative">
      <PillButton onClick={() => setOpen((o) => !o)} active={open}>
        <span className={cx('h-2 w-2 rounded-full', current?.status === 'active' ? 'bg-pass' : current?.status === 'pending_review' ? 'bg-warn' : current?.status === 'proposed' ? 'bg-accent' : 'bg-faint')} />
        <span className="whitespace-nowrap">Context {value}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </PillButton>
      <Popover open={open} onClose={() => setOpen(false)} width={300}>
        <p className="px-3 pt-2 pb-1 text-[12px] text-muted">Which context release the agent reads</p>
        {versions.map((v) => (
          <button key={v.version} type="button" onClick={() => { onChange(v.version); setOpen(false); }}
            className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover', v.version === value && 'bg-hover')}>
            <span className="flex-1">
              <span className="block text-[14px] font-medium text-ink">Net revenue {v.version}</span>
              <span className="block text-[12px] text-muted">{versionStatusLabel[v.status] ?? v.status}{'proposal' in v && v.proposal ? ' · AI-drafted' : ''}</span>
            </span>
            {v.version === value && <Check className="h-4 w-4 text-accent" />}
          </button>
        ))}
      </Popover>
    </div>
  );
}
