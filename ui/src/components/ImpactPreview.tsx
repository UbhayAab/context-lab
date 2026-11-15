// Business impact preview: how each reported number moves between two context releases.
import { ArrowRight, TrendingDown } from 'lucide-react';
import { fmtMoney, fmtPct, fmtSignedMoney } from '../lib/format';
import type { Impact, ImpactRow } from '../lib/types';
import { Card, cx } from './ui';

const DATE_FILTERED = /\b(19|20)\d{2}\b|\bQ[1-4]\b|January|February|March|April|May|June|July|August|September|October|November|December/i;
const DIFFERENCE = /\bminus\b|\bdifference\b/i;

const changed = (r: ImpactRow) => r.delta != null && Math.abs(r.delta) >= 0.005;
const unresolvedRow = (r: ImpactRow) => r.before == null || r.after == null;

function sideOfUnresolved(rows: ImpactRow[]) {
  const before = rows.filter((r) => r.before == null).length;
  const after = rows.filter((r) => r.after == null).length;
  if (before && !after) return 'before';
  if (after && !before) return 'after';
  return 'on one side';
}

/** One plain sentence about what shipping `to` does to the numbers. Every value comes from the data. */
export function releaseHeadline(impact: Impact) {
  const unresolved = impact.unresolved ?? impact.rows.filter(unresolvedRow).length;
  let s = `Shipping ${impact.toVersion} changes ${impact.moved} of ${impact.total} numbers`;
  s += unresolved ? `; ${unresolved} more had no agent majority ${sideOfUnresolved(impact.rows)}.` : '.';
  const b = impact.biggest;
  if (b && b.delta != null) {
    const dir = b.delta < 0 ? 'drops' : 'rises';
    const size = b.pct != null && !DIFFERENCE.test(b.question) ? `${Math.abs(b.pct).toFixed(1)}%` : fmtMoney(Math.abs(b.delta));
    s += ` Biggest move: "${b.question}" ${dir} ${size}.`;
  }
  return s;
}

/** Comparing two candidate fixes: where do they give the same number, and where not. */
export function compareHeadline(impact: Impact, fromLabel: string, toLabel: string) {
  const differ = impact.rows.filter(changed);
  const same = impact.rows.filter((r) => !unresolvedRow(r) && !changed(r)).length;
  let s = `${toLabel} and ${fromLabel} agree on ${same} of ${impact.total} numbers`;
  if (!differ.length) return `${s}.`;
  const dated = impact.rows.filter((r) => DATE_FILTERED.test(r.question));
  const allDated = differ.every((r) => DATE_FILTERED.test(r.question));
  if (allDated && differ.length === dated.length) s += `; they differ on exactly the ${differ.length} questions filtered by date.`;
  else if (allDated) s += `; every difference is on a question filtered by date.`;
  else s += `; they differ on ${differ.map((r) => r.questionId).join(', ')}.`;
  return s;
}

function Row({ r }: { r: ImpactRow }) {
  const moved = changed(r);
  const pctOk = r.pct != null && !DIFFERENCE.test(r.question);
  return (
    <li className={cx('px-4 py-2.5', !moved && !unresolvedRow(r) && 'opacity-60')}>
      <p className="text-[13px] text-ink"><span className="mr-1.5 font-mono text-[11px] text-faint">{r.questionId}</span>{r.question}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12.5px] tnum">
        <span className="flex flex-wrap items-center gap-1.5 text-ink-2">
          {r.before != null ? fmtMoney(r.before) : <span className="rounded bg-warn-soft px-1.5 text-[11.5px] text-warn">agents split</span>}
          <ArrowRight className="h-3 w-3 text-faint" />
          <span className="font-medium text-ink">{r.after != null ? fmtMoney(r.after) : <span className="rounded bg-warn-soft px-1.5 text-[11.5px] font-normal text-warn">agents split</span>}</span>
        </span>
        {moved ? (
          <span className={cx('font-medium', (r.delta ?? 0) < 0 ? 'text-fail' : 'text-pass')}>
            {fmtSignedMoney(r.delta ?? 0)}{pctOk ? <span className="ml-1.5 font-normal opacity-85">{fmtPct(r.pct)}</span> : <span className="ml-1.5 font-normal text-muted" title="A percent change is not meaningful for a difference of two numbers">difference</span>}
          </span>
        ) : unresolvedRow(r) ? <span className="text-muted">no majority</span> : <span className="text-muted">no change</span>}
      </div>
    </li>
  );
}

export function ImpactPreview({ impact, title, headline, note }: { impact: Impact; title: string; headline: string; note?: string }) {
  const rows = [...impact.rows].sort((a, b) => Number(changed(b)) - Number(changed(a)) || a.questionId.localeCompare(b.questionId));
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink"><TrendingDown className="h-4 w-4 text-muted" />{title}</p>
        <p className="mt-1.5 text-[14px] font-medium leading-snug text-ink">{headline}</p>
        <p className="mt-1 text-[12px] text-muted">Each number is the answer most agents gave on {impact.fromVersion}, then on {impact.toVersion}.</p>
        {note && <p className="mt-2 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[12px] text-accent-ink">{note}</p>}
      </div>
      <ul className="divide-y divide-line">{rows.map((r) => <Row key={r.questionId} r={r} />)}</ul>
    </Card>
  );
}
