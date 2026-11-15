// Chat sessions: live streaming runs (local/connected) or recorded replays (snapshot).
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { uid } from './format';
import type { AgentRun, Chat, ChatMessage, Question, RunDetail, RunSummary } from './types';

const STORAGE_KEY = 'cl-chats';
const REPLAY_STEP_MS = 420;
const MAX_CHATS = 20;

function loadChats(): Chat[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const chats = raw ? (JSON.parse(raw) as Chat[]) : [];
    // A reload interrupts any stream; mark those as stopped instead of spinning forever.
    return chats.map((c) => ({
      ...c,
      messages: c.messages.map((m) => (m.role === 'assistant'
        ? { ...m, runs: m.runs.map((r) => (r.status === 'streaming' ? { ...r, status: 'error' as const, error: 'Interrupted by a page reload.' } : r)) }
        : m)),
    }));
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS))); } catch { /* storage unavailable */ }
}

export interface ReplaySource {
  runs: RunSummary[];
  loadRun: (id: string) => Promise<RunDetail>;
}

function blankRun(combo: string, contextVersion: string): AgentRun {
  return {
    id: uid(), combo, contextVersion, status: 'streaming', steps: [], finalText: '', answer: null,
    golden: null, correct: null, durationMs: 0, usage: {}, error: null, startedAt: Date.now(),
  };
}

export function useChat(questions: Question[], replay: ReplaySource) {
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeId, setActiveId] = useState<string | null>(() => loadChats()[0]?.id ?? null);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => { saveChats(chats); }, [chats]);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const patchRun = useCallback((chatId: string, runId: string, fn: (r: AgentRun) => AgentRun) => {
    setChats((cs) => cs.map((c) => (c.id !== chatId ? c : {
      ...c,
      messages: c.messages.map((m) => (m.role !== 'assistant' ? m : { ...m, runs: m.runs.map((r) => (r.id === runId ? fn(r) : r)) })),
    })));
  }, []);

  const newChat = useCallback(() => setActiveId(null), []);

  const runLive = useCallback((chatId: string, run: AgentRun, question: string) => {
    const ctrl = new AbortController();
    controllers.current.set(run.id, ctrl);
    api.runAgent({ combo: run.combo, contextVersion: run.contextVersion, question }, {
      onStep: (s) => patchRun(chatId, run.id, (r) => ({ ...r, steps: [...r.steps, s] })),
      onDone: (d) => {
        controllers.current.delete(run.id);
        patchRun(chatId, run.id, (r) => ({
          ...r, status: d.error && !d.finalText ? 'error' : 'done', steps: d.steps ?? r.steps, finalText: d.finalText,
          answer: d.answer, golden: d.golden, correct: d.correct, durationMs: d.durationMs || Date.now() - r.startedAt,
          usage: d.usage ?? {}, error: d.error,
        }));
      },
    }, ctrl.signal);
  }, [patchRun]);

  const runReplay = useCallback(async (chatId: string, run: AgentRun, q: Question | undefined) => {
    const fail = (error: string) => patchRun(chatId, run.id, (r) => ({ ...r, status: 'error', error }));
    if (!q) return fail('Recorded mode can only replay the benchmark questions. Connect the local bridge to ask anything.');
    // Prefer the unprompted runs: a review-prompt run answers a different instruction.
    const candidates = replay.runs
      .filter((r) => r.combos.includes(run.combo) && r.versions.includes(run.contextVersion))
      .sort((a, b) => Number((a.variant ?? 'default') !== 'default') - Number((b.variant ?? 'default') !== 'default'));
    for (const summary of candidates) {
      const detail = await replay.loadRun(summary.runId).catch(() => null);
      const rec = detail?.results.find((x) => x.combo === run.combo && x.contextVersion === run.contextVersion && x.questionId === q.id);
      if (!rec) continue;
      patchRun(chatId, run.id, (r) => ({ ...r, recorded: { runId: summary.runId, at: rec.startedAt } }));
      for (const step of rec.steps) {
        await new Promise((res) => setTimeout(res, REPLAY_STEP_MS));
        patchRun(chatId, run.id, (r) => ({ ...r, steps: [...r.steps, step] }));
      }
      await new Promise((res) => setTimeout(res, REPLAY_STEP_MS));
      patchRun(chatId, run.id, (r) => ({
        ...r, status: 'done', finalText: rec.finalText, answer: rec.answer, golden: rec.golden, correct: rec.correct,
        durationMs: rec.durationMs, usage: rec.usage ?? {}, error: rec.error,
      }));
      return;
    }
    fail('No recorded run for this agent on this question and context.');
  }, [patchRun, replay]);

  const send = useCallback((text: string, combos: string[], contextVersion: string) => {
    const question = text.trim();
    if (!question || !combos.length) return;
    const bench = questions.find((q) => q.text.toLowerCase() === question.toLowerCase());
    const runs = combos.map((c) => blankRun(c, contextVersion));
    const user: ChatMessage = { id: uid(), role: 'user', text: question };
    const assistant: ChatMessage = { id: uid(), role: 'assistant', runs, compare: combos.length > 1 };
    let chatId = activeId;
    if (!chatId || !chats.some((c) => c.id === chatId)) {
      chatId = uid();
      const chat: Chat = { id: chatId, title: question.slice(0, 60), createdAt: Date.now(), messages: [user, assistant] };
      setChats((cs) => [chat, ...cs]);
      setActiveId(chatId);
    } else {
      const id = chatId;
      setChats((cs) => cs.map((c) => (c.id === id ? { ...c, messages: [...c.messages, user, assistant] } : c)));
    }
    for (const run of runs) {
      if (api.isLive()) runLive(chatId, run, question);
      else void runReplay(chatId, run, bench);
    }
  }, [activeId, chats, questions, runLive, runReplay]);

  const stop = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
  }, []);

  const busy = !!active?.messages.some((m) => m.role === 'assistant' && m.runs.some((r) => r.status === 'streaming'));

  return { chats, active, activeId, setActiveId, newChat, send, stop, busy };
}
