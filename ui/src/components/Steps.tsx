// Renders what an agent did: each tool call as a readable query + result table, plus its notes.
import { useState } from 'react';
import { ChevronRight, Database, FileText, Terminal, TriangleAlert } from 'lucide-react';
import { describeTool, formatSql, parseOutput, tokenizeSql, type OutputBlock } from '../lib/sql';
import type { Step } from '../lib/types';
import { cx } from './ui';
import { Markdown } from './Markdown';

const MAX_ROWS = 8;

export function SqlBlock({ sql }: { sql: string }) {
  return (
    <pre className="scroll-thin overflow-x-auto rounded-xl bg-code px-3.5 py-3 font-mono text-[12.5px] leading-[1.65] text-ink-2">
      {tokenizeSql(formatSql(sql)).map((t, i) => (
        <span key={i} className={t.k === 'plain' ? undefined : `tok-${t.k}`}>{t.t}</span>
      ))}
    </pre>
  );
}

function cellText(v: unknown) {
  if (v == null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
}

function ResultTable({ block }: { block: Extract<OutputBlock, { kind: 'table' }> }) {
  if (!block.rows.length) return <p className="text-[12.5px] text-muted">No rows.</p>;
  const shown = block.rows.slice(0, MAX_ROWS);
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-[12.5px] tnum">
        <thead>
          <tr className="bg-code text-left text-muted">
            {block.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-1.5 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {block.columns.map((c) => (
                <td key={c} className={cx('whitespace-nowrap px-3 py-1.5 text-ink-2', typeof r[c] === 'number' && 'text-right')}>{cellText(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {block.rows.length > MAX_ROWS && (
        <p className="border-t border-line px-3 py-1.5 text-[12px] text-muted">+{block.rows.length - MAX_ROWS} more rows</p>
      )}
    </div>
  );
}

function Output({ output, isError }: { output?: string; isError?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!output) return null;
  if (isError) return <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap rounded-xl bg-fail-soft px-3 py-2 font-mono text-[12px] text-fail">{output}</pre>;
  const blocks = parseOutput(output);
  const tables = blocks.filter((b) => b.kind === 'table');
  const text = blocks.filter((b) => b.kind === 'text').map((b) => (b as { text: string }).text).join('\n');
  return (
    <div className="space-y-2">
      {tables.map((b, i) => <ResultTable key={i} block={b as Extract<OutputBlock, { kind: 'table' }>} />)}
      {text && (
        <div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
            <ChevronRight className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
            {open ? 'Hide output' : 'Show output'}
          </button>
          {open && <pre className="scroll-thin mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-code px-3 py-2 font-mono text-[12px] text-ink-2">{text}</pre>}
        </div>
      )}
    </div>
  );
}

/** File tools get the file name only: the agent's sandbox path is noise and local detail. */
function displayInput(step: Step) {
  const input = step.input ?? '';
  if (/^(Read|Glob|Grep)$/.test(step.tool ?? '') && /[\\/]/.test(input)) return input.split(/[\\/]/).pop();
  return input.replace(/[A-Za-z]:\\[^\s"']*\\\.work\\[0-9a-f-]{36}\\/gi, '');
}

function ToolStep({ step }: { step: Step }) {
  const { label, sql } = describeTool(step.tool, step.input);
  const Icon = step.isError ? TriangleAlert : sql.length ? Database : /CONTEXT|Read/i.test(label) ? FileText : Terminal;
  const done = step.output !== undefined && step.output !== '';
  return (
    <li className="animate-rise relative pl-7">
      <span className={cx('absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full', step.isError ? 'bg-fail-soft text-fail' : 'bg-hover text-muted')}>
        <Icon className="h-3 w-3" />
      </span>
      <p className={cx('text-[13px] font-medium', step.isError ? 'text-fail' : 'text-ink-2')}>{label}</p>
      <div className="mt-1.5 space-y-2">
        {sql.length
          ? sql.map((s, i) => <SqlBlock key={i} sql={s} />)
          : <pre className="scroll-thin overflow-x-auto rounded-xl bg-code px-3 py-2 font-mono text-[12px] text-muted">{displayInput(step)}</pre>}
        {done ? <Output output={step.output} isError={step.isError} /> : null}
      </div>
    </li>
  );
}

export function Steps({ steps, hideFinalText }: { steps: Step[]; hideFinalText?: string }) {
  // The last text step usually repeats the final answer, which is shown separately.
  const visible = steps.filter((s) => !(s.kind === 'text' && hideFinalText && s.text?.trim() === hideFinalText.trim()));
  if (!visible.length) return <p className="text-[13px] text-muted">No steps recorded.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[9.5px] before:top-6 before:w-px before:bg-line">
      {visible.map((s, i) => (s.kind === 'tool'
        ? <ToolStep key={i} step={s} />
        : (
          <li key={i} className="animate-rise relative pl-7 text-[13px] text-muted">
            <span className="absolute left-[6px] top-2 h-2 w-2 rounded-full bg-line-strong" />
            <Markdown text={s.text ?? ''} />
          </li>
        )))}
    </ol>
  );
}
