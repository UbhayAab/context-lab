// Minimal, safe markdown: headings, lists, paragraphs, **bold**, `code`. Renders React nodes only.
import { Fragment, type ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={key} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return <code key={key} className="rounded-md bg-code px-1.5 py-0.5 font-mono text-[0.86em] text-ink">{p.slice(1, -1)}</code>;
    }
    return <Fragment key={key}>{p}</Fragment>;
  });
}

type Block =
  | { k: 'h'; level: number; text: string }
  | { k: 'ul' | 'ol'; items: string[] }
  | { k: 'p'; text: string }
  | { k: 'pre'; text: string };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ k: 'p', text: para.join(' ') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) body.push(lines[i]);
      blocks.push({ k: 'pre', text: body.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); blocks.push({ k: 'h', level: h[1].length, text: h[2] }); continue; }
    const li = line.match(/^\s*(?:[-*]|(\d+)[.)])\s+(.*)$/);
    if (li) {
      flush();
      const kind = li[1] ? 'ol' : 'ul';
      const last = blocks[blocks.length - 1];
      if (last && last.k === kind) last.items.push(li[2]);
      else blocks.push({ k: kind, items: [li[2]] });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    // Indented continuation of a list item.
    const last = blocks[blocks.length - 1];
    if (!para.length && last && (last.k === 'ul' || last.k === 'ol') && /^\s{2,}/.test(line)) {
      last.items[last.items.length - 1] += ' ' + line.trim();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        if (b.k === 'h') {
          const size = b.level <= 1 ? 'text-[17px]' : b.level === 2 ? 'text-[15px]' : 'text-sm';
          return <p key={key} className={`${size} mt-4 mb-1.5 font-semibold text-ink first:mt-0`}>{inline(b.text, key)}</p>;
        }
        if (b.k === 'ul' || b.k === 'ol') {
          const Tag = b.k;
          return (
            <Tag key={key} className={`my-2 space-y-1 pl-5 ${b.k === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-faint`}>
              {b.items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>)}
            </Tag>
          );
        }
        if (b.k === 'pre') {
          return <pre key={key} className="scroll-thin my-2 overflow-x-auto rounded-xl bg-code p-3 font-mono text-[12.5px] leading-relaxed">{b.text}</pre>;
        }
        if (b.k === 'p') return <p key={key} className="my-2 first:mt-0 last:mb-0">{inline(b.text, key)}</p>;
        return null;
      })}
    </div>
  );
}
