// Closes the loop: drafts the next metric version from what agents said and where they disagreed.
// The drafter never sees golden answers or the human-written fix, only the evidence an
// operator would have in production. Output: context/proposals/<version>.json, status "proposed".
// Usage: node --no-warnings harness/propose.mjs [--model sonnet] [--from 1.0.0] [--as 1.2.0]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { METRIC_VERSIONS, ONTOLOGY } from '../context/versions.mjs';
import { feedbackPayload, mergedResults } from '../server/data.mjs';
import { consensus } from '../eval/consensus.mjs';
import { agentEnv, runProcess } from './proc.mjs';

const PROPOSALS_DIR = fileURLToPath(new URL('../context/proposals/', import.meta.url));
const MAX_QUOTES_PER_TOPIC = 4;
const TIMEOUT_MS = 240_000;

function evidence(fromVersion) {
  const fb = feedbackPayload(null, fromVersion, 'default');
  const review = feedbackPayload(null, fromVersion, 'review');
  const topics = [fb, review].filter(Boolean).flatMap((f) => f.topics).filter((t) => t.mentions > 0);
  const quotes = [...new Set(topics.flatMap((t) => t.quotes.slice(0, MAX_QUOTES_PER_TOPIC).map((q) => q.text)))];
  const cons = consensus(mergedResults(), fromVersion);
  const disagreements = cons.questions.filter((q) => !q.agree).map((q) => ({
    question: q.question, answers: q.groups.map((g) => `${g.answer} (${g.combos.length} agent${g.combos.length > 1 ? 's' : ''})`),
  }));
  return { quotes, disagreements, runIds: [fb?.runId, review?.runId].filter(Boolean), agreed: `${cons.agreed}/${cons.total}` };
}

function buildPrompt(fromVersion, ev) {
  return [
    'You maintain a business metric definition that AI analytics agents read before they write SQL.',
    'Agents used the current definition below. Their own comments and the questions where they disagreed are listed after it.',
    'Draft a revised definition that fixes the problems the agents raised and removes the ambiguity behind their disagreements.',
    'Do not invent facts the evidence does not support. Where a business policy choice is needed and the evidence does not settle it,',
    'pick the most common convention and list it under assumptions so a human reviewer can confirm it.',
    '',
    `## Current definition (net revenue ${fromVersion})`, METRIC_VERSIONS[fromVersion].body,
    '', '## Data model', ONTOLOGY.body,
    '', `## What agents said while following it (${ev.quotes.length} quotes)`, ...ev.quotes.map((q) => `- ${q}`),
    '', `## Questions where agents disagreed (agreement ${ev.agreed})`,
    ...ev.disagreements.map((d) => `- ${d.question} Answers: ${d.answers.join('; ')}`),
    '',
    'Reply with only a JSON object, no prose, in this shape:',
    '{"body": "<the new definition, same style: one sentence, a Computation line, then numbered Rules>", "changes": ["<what changed and why, one line each>"], "assumptions": ["<policy choices a human should confirm>"]}',
    'Use plain hyphens only, never long dashes.',
  ].join('\n');
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('drafter returned no JSON');
  const j = JSON.parse(m[0]);
  if (typeof j.body !== 'string' || !Array.isArray(j.changes) || !Array.isArray(j.assumptions)) throw new Error('drafter JSON has the wrong shape');
  return j;
}

const LONG_DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g');
const noDashes = (s) => s.replace(LONG_DASHES, '-');

export async function propose({ model = 'sonnet', from = '1.0.0', as = '1.2.0' } = {}) {
  const ev = evidence(from);
  const prompt = buildPrompt(from, ev);
  const args = ['-p', '--model', model, '--setting-sources', 'project', '--settings', JSON.stringify({ claudeMdExcludes: ['**/*.md'] }),
    '--strict-mcp-config', '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json'];
  const proc = await runProcess('claude', args, { cwd: PROPOSALS_DIR, env: agentEnv(), input: prompt, timeoutMs: TIMEOUT_MS });
  if (proc.code !== 0) throw new Error(`drafter failed: ${proc.stderr.slice(0, 500)}`);
  const out = JSON.parse(proc.stdout);
  const draft = parseJson(out.result ?? '');
  const proposal = {
    version: as, basedOn: from, status: 'proposed', proposedBy: `claude-code:${model}`,
    createdAt: new Date().toISOString(), evidenceRunIds: ev.runIds,
    evidence: { quotes: ev.quotes.length, disagreements: ev.disagreements.length, agreement: ev.agreed },
    promptSha16: createHash('sha256').update(prompt).digest('hex').slice(0, 16),
    sawGoldenAnswers: false, sawHumanFix: false,
    body: noDashes(draft.body.trim()), changes: draft.changes.map(noDashes), assumptions: draft.assumptions.map(noDashes),
  };
  mkdirSync(PROPOSALS_DIR, { recursive: true });
  writeFileSync(join(PROPOSALS_DIR, `${as}.json`), JSON.stringify(proposal, null, 2));
  return proposal;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  const p = await propose({ model: opt('model', 'sonnet'), from: opt('from', '1.0.0'), as: opt('as', '1.2.0') });
  console.log(JSON.stringify(p, null, 2));
}
