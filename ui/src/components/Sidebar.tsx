// Left rail: product, new chat, views, recent chats, connection mode and theme.
import { useEffect, useState } from 'react';
import { Bot, FlaskConical, Layers3, Monitor, Moon, PanelLeftClose, SquarePen, Sun, MessageSquare } from 'lucide-react';
import type { View } from '../lib/store';
import type { Chat, Mode } from '../lib/types';
import { cx } from './ui';

const NAV: { view: View; label: string; icon: typeof Bot }[] = [
  { view: 'chat', label: 'Chat', icon: MessageSquare },
  { view: 'evaluate', label: 'Evaluate', icon: FlaskConical },
  { view: 'context', label: 'Context', icon: Layers3 },
  { view: 'agents', label: 'Agents', icon: Bot },
];

const MODE_TEXT: Record<Mode, { label: string; detail: string; dot: string }> = {
  local: { label: 'Live on this machine', detail: 'Your own signed-in plans', dot: 'bg-pass' },
  connected: { label: 'Connected to your machine', detail: 'Bridge at 127.0.0.1:4318', dot: 'bg-pass' },
  snapshot: { label: 'Recorded results', detail: 'Read-only replay', dot: 'bg-warn' },
};

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem('cl-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try { if (theme === 'system') localStorage.removeItem('cl-theme'); else localStorage.setItem('cl-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme];
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 10h12M10 4v12" /><circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">Context Lab</span>
    </span>
  );
}

export function Sidebar({ view, onView, chats, activeChatId, onOpenChat, onNewChat, mode, onClose }: {
  view: View; onView: (v: View) => void; chats: Chat[]; activeChatId: string | null;
  onOpenChat: (id: string) => void; onNewChat: () => void; mode: Mode; onClose?: () => void;
}) {
  const [theme, setTheme] = useTheme();
  const m = MODE_TEXT[mode];
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const nextTheme: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <nav className="flex h-full w-[264px] flex-col bg-sidebar px-3 pb-3 pt-3" aria-label="Main">
      <div className="flex items-center justify-between px-1.5 pb-3">
        <Logo />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink">
            <PanelLeftClose className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <button type="button" onClick={onNewChat}
        className="mb-3 flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[14px] font-medium text-ink shadow-card hover:bg-hover">
        <SquarePen className="h-4 w-4" /> New chat
      </button>
      <ul className="space-y-0.5">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <li key={v}>
            <button type="button" onClick={() => onView(v)} aria-current={view === v ? 'page' : undefined}
              className={cx('flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-[14px] transition-colors',
                view === v ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}>
              <Icon className="h-4 w-4 opacity-80" /> {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="scroll-thin mt-5 flex-1 overflow-y-auto">
        {chats.length > 0 && <p className="px-3 pb-1.5 text-[12px] font-medium text-faint">Recent</p>}
        <ul className="space-y-0.5">
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpenChat(c.id)} title={c.title}
                className={cx('block h-8 w-full truncate rounded-lg px-3 text-left text-[13.5px] transition-colors',
                  c.id === activeChatId && view === 'chat' ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover')}>
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className={cx('h-2 w-2 shrink-0 rounded-full', m.dot)} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-medium text-ink">{m.label}</p>
          <p className="truncate text-[11.5px] text-muted">{m.detail}</p>
        </div>
        <button type="button" onClick={() => setTheme(nextTheme)} aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}
          className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink">
          <ThemeIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
