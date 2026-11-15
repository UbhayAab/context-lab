// Side panel on desktop, bottom sheet on phones.
import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { IconButton } from './ui';

export function Sheet({ open, onClose, onBack, title, subtitle, children }: {
  open: boolean; onClose: () => void; onBack?: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close panel" className="absolute inset-0 cursor-default" style={{ background: 'var(--scrim)' }} onClick={onClose} />
      <aside role="dialog" aria-modal="true"
        className="animate-rise absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl border border-line bg-bg shadow-pop sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(640px,92vw)] sm:rounded-none sm:rounded-l-3xl">
        <header className="flex items-start gap-2 border-b border-line px-4 py-3 sm:px-5">
          {onBack && <IconButton label="Back" onClick={onBack}><ArrowLeft className="h-4 w-4" /></IconButton>}
          <div className="min-w-0 flex-1 py-1">
            <div className="truncate text-[15px] font-semibold text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </aside>
    </div>
  );
}
