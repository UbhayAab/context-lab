// Agents x context releases. Each cell: accuracy, time, tokens. Optional "Agents agreed" row.
import { useState, type CSSProperties } from 'react';
import { ChevronRight, Split } from 'lucide-react';
import { parseCombo, fmtTokens } from '../lib/format';
import { movement } from '../lib/gate';
import type { Cell, Consensus, RunRecord } from '../lib/types';
import { Avatar, Card, ErrorNote, cx } from './ui';
import { CellSheet } from './CellSheet';

function AccuracyCell({ cell, base, onOpen }: { cell: Cell | undefined; base?: Cell; onOpen: () => void }) {
  if (!cell) return <div className="p-2.5 text-[13px] text-faint">Not run yet</div>;
  const pct = cell.accuracy;
  const tone = pct >= 90 ? 'bg-pass' : pct >= 50 ? 'bg-warn' : 'bg-fail';
  const d = base ? cell.accuracy - base.accuracy : null;
  return (
    <button type="button" onClick={onOpen} className="group w-full rounded-xl p-2.5 text-left transition-colors hover:bg-hover">
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-baseline md:gap-x-1.5">
        <span className="text-[19px] font-semibold tracking-tight text-ink tnum md:text-[22px]">{Math.round(pct)}%</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] text-muted tnum">{cell.correct}/{cell.n}</span>
          {d != null && d !== 0 && <span className={cx('text-[11.5px] font-medium tnum', d > 0 ? 'text-pass' : 'text-fail')}>{d > 0 ? '+' : ''}{Math.round(d)}</span>}
        </span>
        <ChevronRight className="ml-auto hidden h-4 w-4 self-center text-faint opacity-0 transition-opacity group-hover:opacity-100 md:block" />
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hover">
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted tnum">
        {cell.medianSeconds != null ? `${cell.medianSeconds} s` : '-'} · {fmtTokens(cell.medianInputTokens)} tokens{cell.errors ? ` · ${cell.errors} errors` : ''}
      </p>
    </button>
  );
}

function ChangeCell({ a, b, mv }: { a?: Cell; b?: Cell; mv: { fixed: number; regressed: number } | null }) {
  if (!a || !b) return <span className="p-2.5 text-[13px] text-faint">-</span>;
  const d = b.accuracy - a.accuracy;
  return (
    <div className="p-2.5">
      <p className={cx('text-[15px] font-semibold tnum', d > 0 ? 'text-pass' : d < 0 ? 'text-fail' : 'text-muted')}>{d > 0 ? '+' : ''}{Math.round(d)} pts</p>
      {mv && <p className="mt-0.5 text-[11.5px] text-muted tnum">{mv.fixed} fixed · <span className={mv.regressed ? 'font-medium text-fail' : undefined}>{mv.regressed} regressed</span></p>}
    </div>
  );
}

function AgentName({ combo }: { combo: string }) {
  const p = parseCombo(combo);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar harness={p.harness} size={30} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[14px] font-medium text-ink">{p.modelName}</p>
        <p className="truncate text-[12px] text-muted">in {p.harnessName}{p.via === 'bridge' ? ' (local bridge)' : ''}</p>
      </div>
    </div>
  );
}

function AgreementCell({ consensus, version, onSplits }: { consensus: Consensus; version: string; onSplits: () => void }) {
  const c = consensus[version];
  if (!c) return <div className="p-2.5 text-[12.5px] text-faint">-</div>;
  const split = c.total - c.agreed;
  return (
    <button type="button" onClick={onSplits} disabled={!split} className="w-full rounded-xl p-2.5 text-left enabled:hover:bg-hover">
      <p className="text-[13px] font-medium text-ink tnum">Agreed on {c.agreed}/{c.total}</p>
      <div className="mt-1.5 flex gap-[3px]">
        {c.questions.map((q) => <span key={q.questionId} title={`${q.questionId}: ${q.agree ? 'agreed' : 'split'}`} className={cx('h-1.5 flex-1 rounded-full', q.agree ? 'bg-line-strong' : 'bg-warn')} />)}
      </div>
      {split > 0 && <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-warn"><Split className="h-3 w-3" />{split} split</p>}
    </button>
  );
}

export function Matrix({ combos, versions, cells, records, recordsLoading, recordsError, consensus, onShowSplits }: {
  combos: string[]; versions: string[]; cells: Cell[]; records: RunRecord[]; recordsLoading?: boolean; recordsError?: string | null;
  consensus?: Consensus | null; onShowSplits?: () => void;
}) {
  const [open, setOpen] = useState<{ combo: string; version: string } | null>(null);
  const cell = (combo: string, v: string) => cells.find((c) => c.combo === combo && c.contextVersion === v);
  const twoWay = versions.length === 2;
  const [a, b] = [versions[0], versions[versions.length - 1]];
  const desktopCols = `minmax(190px,1.25fr) repeat(${versions.length}, minmax(0,1fr))${twoWay ? ' minmax(0,0.8fr)' : ''}`;
  const mobileCols = `repeat(${Math.min(versions.length, 3)}, minmax(0,1fr))`;
  const gridStyle = { '--dcols': desktopCols, '--mcols': mobileCols } as CSSProperties;
  const rowCls = 'grid items-start gap-x-1 gap-y-1 [grid-template-columns:var(--mcols)] md:items-center md:[grid-template-columns:var(--dcols)]';
  const fullRow = 'col-[1/-1] md:col-auto';
  return (
    <>
      {recordsError && <div className="mb-3"><ErrorNote>{recordsError}</ErrorNote></div>}
      <Card className="overflow-hidden">
        <div style={gridStyle} className="hidden items-center gap-x-1 border-b border-line bg-code px-4 py-2.5 text-[12px] font-medium text-muted md:grid md:[grid-template-columns:var(--dcols)]">
          <span>Agent</span>
          {versions.map((v) => <span key={v} className="px-2.5">Context {v}</span>)}
          {twoWay && <span className="px-2.5">Change</span>}
        </div>
        <ul className="divide-y divide-line">
          {combos.map((combo) => (
            <li key={combo} style={gridStyle} className={cx(rowCls, 'px-3 py-3 md:px-4')}>
              <div className={cx(fullRow, 'px-1 pb-1 md:pb-0')}><AgentName combo={combo} /></div>
              {versions.map((v, i) => (
                <div key={v}>
                  <p className="px-2.5 text-[11.5px] font-medium text-faint md:hidden">{v}</p>
                  <AccuracyCell cell={cell(combo, v)} base={!twoWay && i > 0 ? cell(combo, a) : undefined} onOpen={() => setOpen({ combo, version: v })} />
                </div>
              ))}
              {twoWay && (
                <div className={cx(fullRow, 'border-t border-line pt-1 md:border-0 md:pt-0')}>
                  <ChangeCell a={cell(combo, a)} b={cell(combo, b)} mv={records.length ? movement(records, combo, a, b) : null} />
                </div>
              )}
            </li>
          ))}
          {consensus && (
            <li style={gridStyle} className={cx(rowCls, 'bg-code px-3 py-2 md:px-4')}>
              <div className={cx(fullRow, 'px-1 text-[13px] font-medium text-ink-2')}>Agents agreed<span className="block text-[11.5px] font-normal text-muted">same answer from every agent</span></div>
              {versions.map((v) => <AgreementCell key={v} consensus={consensus} version={v} onSplits={() => onShowSplits?.()} />)}
              {twoWay && <span />}
            </li>
          )}
        </ul>
      </Card>
      <CellSheet open={!!open} combo={open?.combo ?? ''} version={open?.version ?? ''} results={records} loading={recordsLoading} onClose={() => setOpen(null)} />
    </>
  );
}
