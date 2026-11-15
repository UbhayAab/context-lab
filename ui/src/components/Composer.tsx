// Message composer: pickers row, auto-growing textarea, send/stop.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, Columns2, Square } from 'lucide-react';
import type { ContextPayload } from '../lib/types';
import { AgentPicker, ContextPicker, type AgentOption } from './Pickers';
import { cx } from './ui';

const MAX_LEN = 500;

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
  options: AgentOption[];
  selected: string[];
  onSelect: (combos: string[]) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  context: ContextPayload;
  contextVersion: string;
  onContextVersion: (v: string) => void;
}

export function Composer(p: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [p.value]);

  const canSend = !p.busy && !p.disabled && p.value.trim().length > 0 && p.selected.length > 0;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) p.onSend();
    }
  };

  return (
    <div className="rounded-[22px] border border-line bg-surface shadow-card focus-within:border-line-strong">
      <textarea
        ref={ref}
        rows={1}
        value={p.value}
        maxLength={MAX_LEN}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={p.disabled ? p.disabledReason : p.compare ? 'Ask every selected agent the same question' : 'Ask a question about revenue'}
        aria-label="Message"
        className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        <AgentPicker options={p.options} selected={p.selected} multi={p.compare} onChange={p.onSelect} />
        <ContextPicker context={p.context} value={p.contextVersion} onChange={p.onContextVersion} />
        <button type="button" onClick={() => p.onCompare(!p.compare)} aria-pressed={p.compare}
          className={cx('inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors',
            p.compare ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-hover')}>
          <Columns2 className="h-3.5 w-3.5" /> Compare
        </button>
        <span className="ml-auto" />
        {p.busy ? (
          <button type="button" onClick={p.onStop} aria-label="Stop"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg hover:opacity-85">
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        ) : (
          <button type="button" onClick={p.onSend} disabled={!canSend} aria-label="Send"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-line-strong disabled:text-surface">
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
