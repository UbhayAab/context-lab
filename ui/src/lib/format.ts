// Labels and number formatting shared by every view.

const HARNESS_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  grok: 'Grok Build',
  opencode: 'OpenCode',
  lab: 'Your own harness',
};

const MODEL_NAMES: Record<string, string> = {
  haiku: 'Claude Haiku',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra',
  'grok-build': 'Grok Build',
  'grok-4.7': 'Grok 4.7',
};

const INTELLIGENCE: Record<string, string> = {
  haiku: 'Claude', sonnet: 'Claude', opus: 'Claude', 'grok-build': 'Grok',
};

export interface ParsedCombo {
  harness: string;
  model: string;
  via: string | null;
  harnessName: string;
  modelName: string;
  intelligence: string;
}

function titleCase(s: string) {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

export function parseCombo(combo: string): ParsedCombo {
  const m = combo.match(/^([\w-]+):([^@#]+)(?:@(\w+))?/);
  const harness = m?.[1] ?? combo;
  const model = m?.[2] ?? '';
  const via = m?.[3] ?? null;
  const intelligence = INTELLIGENCE[model] ?? (model.startsWith('gpt') ? 'GPT' : model.startsWith('claude') ? 'Claude' : model.startsWith('grok') ? 'Grok' : titleCase(model));
  return {
    harness, model, via,
    harnessName: HARNESS_NAMES[harness] ?? titleCase(harness),
    modelName: MODEL_NAMES[model] ?? titleCase(model),
    intelligence,
  };
}

/** "Claude Sonnet in Claude Code", "GPT-6.1 Sol in Claude Code (local bridge)". */
export function agentLabel(combo: string): string {
  const p = parseCombo(combo);
  return `${p.modelName} in ${p.harnessName}${p.via === 'bridge' ? ' (local bridge)' : ''}`;
}

const money2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');

export const fmtMoney = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '-' : money2.format(n));
export const fmtInt = (n: number | null | undefined) => (n == null ? '-' : int.format(Math.round(n)));

export function fmtTokens(n: number | null | undefined) {
  if (n == null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function fmtSeconds(ms: number | null | undefined) {
  if (ms == null) return '-';
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
}

export function fmtSignedMoney(n: number) {
  return `${n >= 0 ? '+' : '-'}${money2.format(Math.abs(n))}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Readable run name from ids like 2026-11-15T19-33-59-424Z-matrix1. */
export function runName(runId: string, startedAt?: string) {
  const label = runId.replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-?/, '') || 'run';
  return `${label} · ${fmtDate(startedAt)}`;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Hue per harness for the monogram avatar. Not a brand color. */
export function harnessHue(harness: string) {
  const hues: Record<string, number> = { 'claude-code': 28, codex: 160, grok: 262, opencode: 205, lab: 330 };
  return hues[harness] ?? 220;
}

export function monogram(harness: string) {
  const map: Record<string, string> = { 'claude-code': 'CC', codex: 'Cx', grok: 'Gk', opencode: 'OC', lab: 'Lb' };
  return map[harness] ?? harness.slice(0, 2).toUpperCase();
}

export const versionStatusLabel: Record<string, string> = {
  active: 'Active',
  pending_review: 'Pending review',
  superseded: 'Superseded',
  proposed: 'Proposed',
};

/** Signed percent for impact tables: "-40.9%". */
export function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '-';
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(1)}%`;
}
