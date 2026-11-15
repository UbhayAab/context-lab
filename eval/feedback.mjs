// Agent feedback loop: harvest the doubts agents voice about a context release from their own
// replies, and line them up against the reviewed fix. Deterministic keyword matching, no model
// calls, so the same traces always produce the same report.

const TOPICS = [
  {
    id: 'pending', label: 'Pending orders counted as revenue', changelogIndex: 0,
    re: /\bpending\b/i,
  },
  {
    id: 'test_accounts', label: 'Test accounts counted as customers', changelogIndex: 1,
    re: /test accounts?|is_test|QA accounts?|internal QA/i,
  },
  {
    id: 'refund_sign', label: 'Refunds added instead of subtracted', changelogIndex: 2,
    re: /(subtract\w*|minus|deduct\w*|net of).{0,50}refund|refund\w*.{0,60}(subtract|deduct|instead of|rather than)|plus refunds|added (them|the refunds|refunds)/i,
  },
  {
    id: 'date_attribution', label: 'No rule for which date a refund belongs to', changelogIndex: 3,
    re: /refund_date|refund date|order_date.{0,60}refund|attribut/i,
  },
];
const MAX_QUOTES_PER_AGENT = 2;
// One passing mention is often just a description ("completed and pending orders"), not a doubt.
const MIN_MENTIONS_TO_COUNT = 2;
const MAX_QUOTE_CHARS = 280;

function replyText(record) {
  const texts = record.steps.filter((s) => s.kind === 'text').map((s) => s.text);
  return [...new Set([...texts, record.finalText ?? ''])].join('\n');
}

function sentenceAround(text, re) {
  const clean = (s) => s.replace(/\*\*|`/g, '').replace(/^\s*(#+|[-*]|\d+\.)\s+/, '').replace(/\s+/g, ' ').trim();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean);
  const hit = sentences.find((s) => re.test(s));
  if (!hit) return null;
  return hit.length > MAX_QUOTE_CHARS ? hit.slice(0, MAX_QUOTE_CHARS - 3) + '...' : hit;
}

export function analyzeFeedback(results, contextVersion, changelog = []) {
  const runs = results.filter((r) => r.contextVersion === contextVersion);
  const combos = [...new Set(runs.map((r) => r.combo))];
  const topics = TOPICS.map((t) => {
    const byCombo = Object.fromEntries(combos.map((c) => [c, 0]));
    const quotes = [];
    for (const r of runs) {
      const text = replyText(r);
      if (!t.re.test(text)) continue;
      byCombo[r.combo]++;
      const quote = sentenceAround(text, t.re);
      if (quote && quotes.filter((q) => q.combo === r.combo).length < MAX_QUOTES_PER_AGENT) {
        quotes.push({ combo: r.combo, questionId: r.questionId, text: quote });
      }
    }
    const mentions = Object.values(byCombo).reduce((a, b) => a + b, 0);
    return {
      id: t.id, label: t.label, fix: changelog[t.changelogIndex] ?? null, mentions,
      agentsRaising: combos.filter((c) => byCombo[c] > 0), byCombo, quotes,
    };
  });
  const raisedByAnyone = new Set(topics.flatMap((t) => t.agentsRaising));
  return {
    contextVersion,
    answersAnalyzed: runs.length,
    agents: combos,
    topics,
    silentAgents: combos.filter((c) => !raisedByAnyone.has(c)),
    fixesAnticipated: topics.filter((t) => t.fix && t.mentions >= MIN_MENTIONS_TO_COUNT).length,
    fixesTotal: changelog.length,
    method: `Keyword match over each agent reply. Deterministic, no model calls. A mention means the agent named the issue, not that it acted on it. A fix counts as anticipated at ${MIN_MENTIONS_TO_COUNT}+ mentions.`,
  };
}
