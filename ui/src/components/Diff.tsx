// Line diff between two context bodies, after joining hard-wrapped source lines.
import { useMemo } from 'react';
import { cx } from './ui';

type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

/** Joins hard-wrapped source lines into logical lines: a line starting lowercase, "(" or indented continues the previous one. */
export function unwrap(body: string): string {
  const out: string[] = [];
  for (const raw of body.split('\n')) {
    const continues = out.length > 0 && (/^\s+\S/.test(raw) || /^[a-z(]/.test(raw));
    if (continues) out[out.length - 1] += ` ${raw.trim()}`;
    else out.push(raw.trimEnd());
  }
  return out.join('\n');
}

function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split('\n');
  const y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) {
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: 'same', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'del', text: x[i++] });
    else out.push({ kind: 'add', text: y[j++] });
  }
  while (i < x.length) out.push({ kind: 'del', text: x[i++] });
  while (j < y.length) out.push({ kind: 'add', text: y[j++] });
  return out;
}

export function Diff({ from, to }: { from: string; to: string }) {
  const lines = useMemo(() => lineDiff(unwrap(from), unwrap(to)), [from, to]);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-code py-1.5 text-[13px] leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={cx('flex gap-2 px-3 py-1', l.kind === 'add' && 'bg-pass-soft text-pass', l.kind === 'del' && 'bg-fail-soft text-fail', l.kind === 'same' && 'text-ink-2')}>
          <span className="w-3 shrink-0 select-none font-mono opacity-70">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}</span>
          <span className={cx('min-w-0 whitespace-pre-wrap break-words', l.kind === 'del' && 'line-through decoration-fail/40')}>{l.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}
