// Data layer. Resolves where data comes from, then exposes one API for every view.
//   local     -> UI served by the bridge, same-origin /api
//   connected -> UI hosted elsewhere, bridge on this machine at 127.0.0.1:4318
//   snapshot  -> no bridge, read-only ./data/snapshot.json
import type {
  Analytics, Combined, Consensus, ContextPayload, DonePayload, Feedback, Impacts, Mode, Question, Releases, RunDetail,
  RunSummary, Snapshot, Status, Step, Variant,
} from './types';

const BRIDGE = 'http://127.0.0.1:4318';
// /api/status detects installed CLIs and can take seconds on a cold cache. A missing bridge
// fails fast (connection refused / 404), so generous timeouts only cost time when one is alive.
const SAME_ORIGIN_TIMEOUT_MS = 12_000;
const BRIDGE_TIMEOUT_MS = 6_000;
const HEADERS = { 'X-Lab-Client': '1' };

let base = '';
let mode: Mode = 'snapshot';
let snapshot: Snapshot | null = null;

async function probe(url: string, timeoutMs: number): Promise<Status | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/status`, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as Status;
    return json && Array.isArray(json.harnesses) ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** ?mode=snapshot forces the read-only path, useful for checking what a visitor sees. */
function forcedMode(): Mode | null {
  const m = new URLSearchParams(window.location.search).get('mode');
  return m === 'snapshot' ? 'snapshot' : null;
}

const isLocalPage = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

/**
 * A hosted copy must not reach into the visitor's machine on its own: browsers show a
 * "wants to access devices on your local network" prompt for that. Only probe the bridge
 * when the page itself is local, or the visitor asked with ?connect=1.
 */
function mayProbeBridge(): boolean {
  return isLocalPage() || new URLSearchParams(window.location.search).get('connect') === '1';
}

/** URL of this page with the opt-in flag, for a "Connect my machine" link. */
export function connectUrl(): string {
  const u = new URL(window.location.href);
  u.searchParams.set('connect', '1');
  u.searchParams.delete('mode');
  return u.toString();
}

export async function connect(): Promise<{ mode: Mode; status: Status }> {
  if (forcedMode() !== 'snapshot') {
    if (isLocalPage()) {
      const same = await probe('', SAME_ORIGIN_TIMEOUT_MS);
      if (same) { base = ''; mode = 'local'; return { mode, status: same }; }
    }
    if (mayProbeBridge()) {
      const bridge = await probe(BRIDGE, BRIDGE_TIMEOUT_MS);
      if (bridge) { base = BRIDGE; mode = 'connected'; return { mode, status: { ...bridge, mode: 'connected' } }; }
    }
  }
  const res = await fetch('./data/snapshot.json');
  if (!res.ok) throw new Error('No local bridge found and no recorded snapshot is bundled.');
  snapshot = (await res.json()) as Snapshot;
  mode = 'snapshot';
  return { mode, status: { ...snapshot.status, mode: 'snapshot' } };
}

export const currentMode = () => mode;
export const isLive = () => mode !== 'snapshot';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export async function getContext(): Promise<ContextPayload> {
  return snapshot ? snapshot.context : get<ContextPayload>('/api/context');
}

export async function getQuestions(): Promise<Question[]> {
  return snapshot ? snapshot.questions : get<Question[]>('/api/questions');
}

export async function getRuns(): Promise<RunSummary[]> {
  return snapshot ? snapshot.runs : get<RunSummary[]>('/api/runs');
}

export async function getRun(runId: string): Promise<RunDetail> {
  if (snapshot) {
    const d = snapshot.runDetails[runId];
    if (!d) throw new Error('Run not in snapshot');
    return d;
  }
  return get<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`);
}

async function getOptional<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${base}${path}`, { headers: HEADERS });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Cross-run analytics: merged matrix, agent agreement, business impact. Any part may be absent. */
export async function getAnalytics(): Promise<Analytics> {
  if (snapshot) {
    return { combined: snapshot.combined ?? null, consensus: snapshot.consensus ?? null, impacts: snapshot.impacts ?? null };
  }
  const [combined, consensus, impacts] = await Promise.all([
    getOptional<Combined>('/api/combined'), getOptional<Consensus>('/api/consensus'), getOptional<Impacts>('/api/impacts'),
  ]);
  return { combined, consensus, impacts };
}

/** What agents said about the context. `review` uses the newest complete review-variant run. */
export async function getFeedback(variant: Variant, runs: RunSummary[]): Promise<Feedback | null> {
  if (snapshot) return (variant === 'review' ? snapshot.feedbackReview : snapshot.feedback) ?? null;
  let path = '/api/feedback';
  if (variant === 'review') {
    const run = runs.find((r) => r.status === 'complete' && r.variant === 'review');
    if (!run) return null;
    path += `?runId=${encodeURIComponent(run.runId)}`;
  }
  const res = await fetch(`${base}${path}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Feedback failed (${res.status})`);
  return (await res.json()) as Feedback;
}

export function hasReviewFeedback(runs: RunSummary[]): boolean {
  if (snapshot) return !!snapshot.feedbackReview;
  return runs.some((r) => r.status === 'complete' && r.variant === 'review');
}

export interface ReleaseResult {
  releases?: Releases;
  error?: string;
  reasons?: string[];
}

export async function approveRelease(version: string, note: string): Promise<ReleaseResult> {
  if (!isLive()) return { error: 'snapshot', reasons: ['Release approval needs the local bridge.'] };
  const res = await fetch(`${base}/api/release`, {
    method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify({ version, note }),
  });
  return (await res.json()) as ReleaseResult;
}

export interface StreamHandlers {
  onStep: (s: Step) => void;
  onDone: (d: DonePayload) => void;
}

function parseEvent(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  try { return { event, data: JSON.parse(data.join('\n')) }; } catch { return null; }
}

/** Streams one live agent run. Resolves when the run ends; never throws. */
export async function runAgent(
  body: { combo: string; contextVersion: string; question: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const fail = (error: string) => handlers.onDone({ finalText: '', answer: null, golden: null, correct: null, durationMs: 0, usage: {}, error });
  let res: Response;
  try {
    res = await fetch(`${base}/api/agent/run`, {
      method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
    });
  } catch (e) {
    return fail(signal?.aborted ? 'Stopped.' : `Could not reach the local bridge: ${(e as Error).message}`);
  }
  if (!res.ok || !res.body) {
    let msg = `Agent run failed (${res.status})`;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* keep default */ }
    return fail(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let cut: number;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const ev = parseEvent(buf.slice(0, cut));
        buf = buf.slice(cut + 2);
        if (ev?.event === 'step') handlers.onStep(ev.data as Step);
        if (ev?.event === 'done') { finished = true; handlers.onDone(ev.data as DonePayload); }
      }
    }
  } catch (e) {
    if (!finished) return fail(signal?.aborted ? 'Stopped.' : `Stream interrupted: ${(e as Error).message}`);
  }
  if (!finished) fail('The agent stream ended without a result.');
}
