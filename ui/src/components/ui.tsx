// Small shared primitives. Every color comes from theme tokens.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { harnessHue, monogram } from '../lib/format';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

type Tone = 'neutral' | 'accent' | 'pass' | 'fail' | 'warn';
const TONES: Record<Tone, string> = {
  neutral: 'bg-hover text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  pass: 'bg-pass-soft text-pass',
  fail: 'bg-fail-soft text-fail',
  warn: 'bg-warn-soft text-warn',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent',
  secondary: 'bg-surface text-ink border border-line hover:bg-hover disabled:opacity-50',
  ghost: 'text-ink-2 hover:bg-hover disabled:opacity-40',
};

export function Button({ variant = 'secondary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-3.5 h-9 text-sm font-medium transition-colors disabled:cursor-not-allowed', VARIANTS[variant], className)}
    />
  );
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-ink transition-colors disabled:opacity-40', className)}
    />
  );
}

export function Avatar({ harness, size = 28 }: { harness: string; size?: number }) {
  const h = harnessHue(harness);
  return (
    <span
      aria-hidden
      className="avatar inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight"
      style={{ width: size, height: size, fontSize: size * 0.4, ['--h' as string]: h }}
    >
      {monogram(harness)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cx('dot-pulse inline-flex items-center gap-[3px]', className)} aria-label="Working">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[50vh] items-center justify-center p-6 text-center text-sm text-muted">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-fail/30 bg-fail-soft px-3.5 py-2.5 text-sm text-fail">{children}</div>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[10px] px-3 h-8 text-[13px] font-medium transition-colors',
            o.value === value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
