// Shell: sidebar (drawer on phones), top bar on phones, and the active view.
import { useEffect, useState } from 'react';
import { Menu, SquarePen } from 'lucide-react';
import { useStore } from './lib/store';
import { useChat } from './lib/useChat';
import { Sidebar, Logo } from './components/Sidebar';
import { Centered, ErrorNote, Spinner } from './components/ui';
import { ChatView } from './views/ChatView';
import { EvaluateView } from './views/EvaluateView';
import { ContextView } from './views/ContextView';
import { AgentsView } from './views/AgentsView';

export function App() {
  const store = useStore();
  const chat = useChat(store.questions, { runs: store.runs, loadRun: store.loadRun });
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setDrawer(false); }, [store.view, chat.activeId]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const newChat = () => { chat.newChat(); store.setView('chat'); setDrawer(false); };
  const sidebar = (onClose?: () => void) => (
    <Sidebar view={store.view} onView={store.setView} chats={chat.chats} activeChatId={chat.activeId}
      onOpenChat={(id) => { chat.setActiveId(id); store.setView('chat'); }} onNewChat={newChat} mode={store.mode} onClose={onClose} />
  );

  let body;
  if (store.loading) body = <Centered><span className="flex items-center gap-2"><Spinner className="text-accent" /> Connecting</span></Centered>;
  else if (store.error) body = <Centered><div className="max-w-md"><ErrorNote>{store.error}</ErrorNote></div></Centered>;
  else if (store.view === 'evaluate') body = <EvaluateView />;
  else if (store.view === 'context') body = <ContextView />;
  else if (store.view === 'agents') body = <AgentsView />;
  else body = <ChatView chat={chat} />;

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      <aside className="hidden shrink-0 border-r border-line md:block">{sidebar()}</aside>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0" style={{ background: 'var(--scrim)' }} onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 shadow-pop">{sidebar(() => setDrawer(false))}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-2 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="rounded-xl p-2 text-ink-2 hover:bg-hover"><Menu className="h-5 w-5" /></button>
          <Logo />
          <button type="button" aria-label="New chat" onClick={newChat} className="rounded-xl p-2 text-ink-2 hover:bg-hover"><SquarePen className="h-5 w-5" /></button>
        </header>
        <main className={store.view === 'chat' ? 'min-h-0 flex-1' : 'scroll-thin min-h-0 flex-1 overflow-y-auto'}>{body}</main>
      </div>
    </div>
  );
}
