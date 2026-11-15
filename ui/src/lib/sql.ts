// Turns raw agent tool calls into something a person can read: the SQL, and result tables.

/** Pulls every SQL statement passed to `node q.mjs "..."`, whatever shell quoting wrapped it. */
export function extractSql(command: string | undefined): string[] {
  if (!command) return [];
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const i = command.indexOf('q.mjs', at);
    if (i < 0) break;
    let j = i + 5;
    while (j < command.length && command[j] === ' ') j++;
    let sql: string | null = null;
    if (command.startsWith('\\"', j)) {
      const end = command.indexOf('\\"', j + 2);
      sql = end > 0 ? command.slice(j + 2, end) : command.slice(j + 2);
      at = end > 0 ? end + 2 : command.length;
    } else if (command[j] === '"' || command[j] === "'") {
      const q = command[j];
      let k = j + 1;
      let s = '';
      while (k < command.length && command[k] !== q) {
        if (command[k] === '\\' && command[k + 1] === q) { s += q; k += 2; continue; }
        s += command[k++];
      }
      sql = s;
      at = k + 1;
    } else {
      at = j;
    }
    if (sql && sql.trim() && !sql.trim().startsWith('--')) out.push(sql.trim());
  }
  return out;
}

const BREAK_BEFORE = /\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION ALL|UNION|LEFT JOIN|INNER JOIN|JOIN)\s+/gi;

/** Light formatting: one clause per line. Keeps the agent's exact text otherwise. */
export function formatSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(BREAK_BEFORE, (_m, kw: string) => `\n${kw.toUpperCase()} `).trim();
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'JOIN', 'LEFT', 'INNER', 'ON', 'AND', 'OR',
  'NOT', 'IN', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'SUM', 'COUNT', 'ROUND', 'COALESCE', 'DISTINCT', 'BETWEEN',
  'WITH', 'UNION', 'ALL', 'NULL', 'IS', 'DESC', 'ASC', 'MAX', 'MIN', 'AVG', 'LIKE', 'SUBSTR', 'STRFTIME', 'IFNULL',
]);

export type SqlToken = { t: string; k: 'kw' | 'str' | 'num' | 'plain' };

export function tokenizeSql(sql: string): SqlToken[] {
  const parts = sql.match(/'[^']*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]+\b|\s+|[^\sA-Za-z_\d']+/g) ?? [sql];
  return parts.map((t) => {
    if (t.startsWith("'")) return { t, k: 'str' as const };
    if (/^\d/.test(t)) return { t, k: 'num' as const };
    if (KEYWORDS.has(t.toUpperCase())) return { t, k: 'kw' as const };
    return { t, k: 'plain' as const };
  });
}

export type OutputBlock =
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: 'text'; text: string };

/** Splits tool output into JSON-row tables and plain text, in order. */
export function parseOutput(output: string | undefined): OutputBlock[] {
  if (!output) return [];
  const blocks: OutputBlock[] = [];
  let text: string[] = [];
  const flush = () => { if (text.join('').trim()) blocks.push({ kind: 'text', text: text.join('\n').trim() }); text = []; };
  for (const line of output.split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const rows = JSON.parse(s) as unknown;
        if (Array.isArray(rows) && rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
          flush();
          const columns = [...new Set((rows as Record<string, unknown>[]).flatMap((r) => Object.keys(r)))];
          blocks.push({ kind: 'table', columns, rows: rows as Record<string, unknown>[] });
          continue;
        }
      } catch { /* not JSON, keep as text */ }
    }
    if (s === '---') { flush(); continue; }
    text.push(line);
  }
  flush();
  return blocks;
}

export function describeTool(tool: string | undefined, input: string | undefined) {
  const sql = extractSql(input);
  if (sql.length) return { label: sql.length > 1 ? `Ran ${sql.length} queries` : 'Ran a query', sql };
  if (input && /CONTEXT\.md/i.test(input)) return { label: 'Read the context release', sql };
  if (input && /--schema/.test(input)) return { label: 'Looked at the schema', sql };
  if (tool === 'Read') return { label: `Read ${(input ?? '').split(/[\\/]/).pop()}`, sql };
  return { label: 'Ran a command', sql };
}

export function countQueries(steps: { kind: string; input?: string }[]) {
  return steps.reduce((n, s) => n + (s.kind === 'tool' ? extractSql(s.input).length : 0), 0);
}

/** Strips the trailing ANSWER: line, which the UI shows as a chip instead. */
export function answerProse(text: string) {
  return text.replace(/\n?\s*\**ANSWER:\s*\**[^\n]*\s*$/i, '').trim();
}
