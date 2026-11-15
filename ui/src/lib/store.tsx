// App-wide data: connection mode, status, context, questions, runs, cached run details, view.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from './api';
import type { ContextPayload, Mode, Question, RunDetail, RunSummary, Status } from './types';

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
}

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
  const inflight = useRef(new Map<string, Promise<RunDetail>>());

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
    loadRun, runDetail: (id) => details[id], refreshContext, refreshRuns,
  }), [loading, error, mode, status, context, questions, runs, view, setView, loadRun, details, refreshContext, refreshRuns]);

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
