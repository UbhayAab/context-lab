// Chat: ask a question, watch an agent (or several) work, see if the answer matches finance.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { useStore } from '../lib/store';
import type { useChat } from '../lib/useChat';
import { fmtMoney } from '../lib/format';
import { Composer } from '../components/Composer';
import { agentOptions } from '../components/Pickers';
import { AgentRunCompareCard, AgentRunMessage } from '../components/AgentRunCard';
import { cx } from '../components/ui';

type ChatApi = ReturnType<typeof useChat>;
const SUGGESTION_IDS = ['q11', 'q03', 'q02', 'q07'];
const COMPARE_DEFAULT = 4;
const SKIP_IN_COMPARE = new Set(['claude-code:opus']);

export function ChatView({ chat }: { chat: ChatApi }) {
  const { status, mode, runs, context, questions, setView } = useStore();
  const options = useMemo(() => agentOptions(status?.harnesses ?? [], mode, runs), [status, mode, runs]);
  const available = options.filter((o) => o.available);
  const [text, setText] = useState('');
  const [compare, setCompare] = useState(false);
  const [single, setSingle] = useState<string[]>([]);
  const [multi, setMulti] = useState<string[]>([]);
  const [contextVersion, setContextVersion] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!single.length && available.length) setSingle([available[0].combo]);
    if (!multi.length && available.length) {
      setMulti(available.filter((o) => !SKIP_IN_COMPARE.has(o.combo)).slice(0, COMPARE_DEFAULT).map((o) => o.combo));
    }
  }, [available, single.length, multi.length]);

  useEffect(() => {
    if (!contextVersion && context) setContextVersion(context.releases.active);
  }, [context, contextVersion]);

  const messages = chat.active?.messages ?? [];
  const lastRunsKey = JSON.stringify(messages.at(-1)?.role === 'assistant' ? (messages.at(-1) as { runs: { steps: unknown[]; status: string }[] }).runs.map((r) => [r.steps.length, r.status]) : messages.length);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom || messages.at(-1)?.role === 'user') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lastRunsKey, messages]);

  if (!context) return null;
  const selected = compare ? multi : single;
  const live = mode !== 'snapshot';
  const suggestions = SUGGESTION_IDS.map((id) => questions.find((q) => q.id === id)).filter(Boolean) as typeof questions;

  const sendText = (t: string) => {
    if (!t.trim() || chat.busy || !selected.length) return;
    chat.send(t, selected, contextVersion || context.releases.active);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 py-8 sm:px-6 sm:py-10">
            <div className="my-auto">
            <h1 className="text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">Ask your data.</h1>
            <p className="mt-2 max-w-xl text-[14.5px] text-muted sm:text-[15px]">
              An agent reads the context release you pick, queries the database, and answers. Every benchmark answer is checked against finance's books, so you see when bad context leads a good model astray.
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map((q) => (
                <button key={q.id} type="button" onClick={() => sendText(q.text)} disabled={!selected.length}
                  className="group rounded-2xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-hover disabled:opacity-50 sm:py-4">
                  <span className="block text-[14px] font-medium text-ink">{q.text}</span>
                  <span className="mt-1.5 flex items-center justify-between text-[12px] text-muted">
                    <span className="tnum">Finance: {fmtMoney(q.golden)}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
              ))}
            </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[760px] space-y-8 px-4 pb-8 pt-8 sm:px-6">
            {messages.map((m) => (m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="animate-rise max-w-[85%] whitespace-pre-wrap rounded-3xl bg-hover px-4 py-2.5 text-[15px] text-ink">{m.text}</p>
              </div>
            ) : m.compare ? (
              <div key={m.id} className={cx('grid gap-3', m.runs.length > 1 && 'sm:grid-cols-2')}>
                {m.runs.map((r) => <AgentRunCompareCard key={r.id} run={r} />)}
              </div>
            ) : (
              <div key={m.id}>{m.runs.map((r) => <AgentRunMessage key={r.id} run={r} />)}</div>
            )))}
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-[760px] px-3 pb-3 sm:px-6 sm:pb-5">
        {!live && (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="sm:hidden">Recorded runs only.</span>
              <span className="hidden sm:inline">Recorded runs only. Run live agents on your own plans: clone the repo and run <code className="font-mono">npm run serve</code></span>
            </span>
            <button type="button" onClick={() => setView('agents')} className="font-medium underline underline-offset-2">How it works</button>
          </div>
        )}
        <Composer
          value={text} onChange={setText} onSend={() => sendText(text)} onStop={chat.stop} busy={chat.busy}
          disabled={!live} disabledReason="Pick a suggested question to replay a recorded run"
          options={options} selected={selected} onSelect={compare ? setMulti : setSingle}
          compare={compare} onCompare={setCompare}
          context={context} contextVersion={contextVersion || context.releases.active} onContextVersion={setContextVersion}
        />
        {!live && messages.length > 0 && (
          <div className="scroll-thin mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {questions.map((q) => (
              <button key={q.id} type="button" onClick={() => sendText(q.text)} disabled={chat.busy}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-ink-2 hover:bg-hover disabled:opacity-50">
                {q.text.length > 48 ? `${q.text.slice(0, 46)}...` : q.text}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-[11.5px] text-faint">Synthetic data. Agents run with read-only SQL access in an isolated folder.</p>
      </div>
    </div>
  );
}
