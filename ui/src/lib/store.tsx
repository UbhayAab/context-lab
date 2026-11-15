// App-wide data: connection mode, status, context, questions, runs, cached run details, view.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from './api';
import type { Analytics, ContextPayload, Mode, Question, RunDetail, RunRecord, RunSummary, Status } from './types';

export type View = 'chat' | 'evaluate' | 'context' | 'agents';
const VIEWS: View[] = ['chat', 'evaluate', 'context', 'agents'];
const RUNNING_POLL_MS = 8000;

interface Store {
  loading: boolean;
  error: string | null;
  mode: Mode;
  status: Status | null;
  context: ContextPayload | null;
  questions: Question[];
  runs: RunSummary[];
  view: View;
  setView: (v: View) => void;
  loadRun: (runId: string) => Promise<RunDetail>;
  runDetail: (runId: string) => RunDetail | undefined;
  refreshContext: () => Promise<void>;
  refreshRuns: () => Promise<void>;
  analytics: Analytics;
  analyticsLoaded: boolean;
}

const NO_ANALYTICS: Analytics = { combined: null, consensus: null, impacts: null };

const Ctx = createContext<Store | null>(null);

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.includes(h) ? h : 'chat';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('snapshot');
  const [status, setStatus] = useState<Status | null>(null);
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [details, setDetails] = useState<Record<string, RunDetail>>({});
  const [view, setViewState] = useState<View>(viewFromHash);
  const [analytics, setAnalytics] = useState<Analytics>(NO_ANALYTICS);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const inflight = useRef(new Map<string, Promise<RunDetail>>());

  // Merged matrix, agreement and impact follow the runs: refetch whenever a run moves.
  const runsKey = runs.map((r) => `${r.runId}:${r.status}:${r.done}`).join('|');
  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    api.getAnalytics()
      .then((a) => { if (!cancelled) { setAnalytics(a); setAnalyticsLoaded(true); } })
      .catch(() => { if (!cancelled) setAnalyticsLoaded(true); });
    return () => { cancelled = true; };
  }, [loading, error, runsKey]);

  const setView = useCallback((v: View) => {
    window.location.hash = `/${v}`;
    setViewState(v);
  }, []);

  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const conn = await api.connect();
        const [ctx, qs, rs] = await Promise.all([api.getContext(), api.getQuestions(), api.getRuns()]);
        if (cancelled) return;
        setMode(conn.mode); setStatus(conn.status); setContext(ctx); setQuestions(qs); setRuns(rs);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshRuns = useCallback(async () => {
    const rs = await api.getRuns();
    setRuns(rs);
    // Drop cached details of runs still in progress so they reload with new rows.
    setDetails((d) => {
      const next = { ...d };
      for (const r of rs) if (r.status === 'running') delete next[r.runId];
      return next;
    });
    for (const r of rs) if (r.status === 'running') inflight.current.delete(r.runId);
  }, []);

  // Keep a running evaluation live without a reload.
  useEffect(() => {
    if (mode === 'snapshot' || !runs.some((r) => r.status === 'running')) return;
    const t = setInterval(() => { refreshRuns().catch(() => undefined); }, RUNNING_POLL_MS);
    return () => clearInterval(t);
  }, [mode, runs, refreshRuns]);

  const loadRun = useCallback((runId: string) => {
    const cached = inflight.current.get(runId);
    if (cached) return cached;
    const p = api.getRun(runId).then((d) => { setDetails((prev) => ({ ...prev, [runId]: d })); return d; });
    p.catch(() => inflight.current.delete(runId));
    inflight.current.set(runId, p);
    return p;
  }, []);

  const refreshContext = useCallback(async () => { setContext(await api.getContext()); }, []);

  const value = useMemo<Store>(() => ({
    loading, error, mode, status, context, questions, runs, view, setView,
    loadRun, runDetail: (id) => details[id], refreshContext, refreshRuns, analytics, analyticsLoaded,
  }), [loading, error, mode, status, context, questions, runs, view, setView, loadRun, details, refreshContext, refreshRuns, analytics, analyticsLoaded]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Loads (and caches) one run's per-question records. */
export function useRunDetail(runId: string | null | undefined) {
  const { loadRun, runDetail } = useStore();
  const [error, setError] = useState<string | null>(null);
  const detail = runId ? runDetail(runId) : undefined;
  useEffect(() => {
    if (!runId || detail) return;
    setError(null);
    loadRun(runId).catch((e: Error) => setError(e.message));
  }, [runId, detail, loadRun]);
  return { detail, error, loading: !!runId && !detail && !error };
}

/**
 * Per-question records behind the merged "All releases" matrix. Each agent and version
 * points at the run that produced it, so traces open from the real run.
 */
export function useCombinedRecords(source: Record<string, string> | null | undefined) {
  const { loadRun, runDetail } = useStore();
  const [error, setError] = useState<string | null>(null);
  const ids = source ? [...new Set(Object.values(source))] : [];
  const idsKey = ids.join('|');
  useEffect(() => {
    setError(null);
    for (const id of idsKey ? idsKey.split('|') : []) loadRun(id).catch((e: Error) => setError(e.message));
  }, [idsKey, loadRun]);
  const loaded = ids.length > 0 && ids.every((id) => runDetail(id));
  const records: RunRecord[] = [];
  if (source && loaded) {
    for (const [key, id] of Object.entries(source)) {
      const cut = key.lastIndexOf('|');
      const combo = key.slice(0, cut);
      const version = key.slice(cut + 1);
      records.push(...(runDetail(id)?.results ?? []).filter((r) => r.combo === combo && r.contextVersion === version));
    }
  }
  return { records, loading: ids.length > 0 && !loaded && !error, error };
}
