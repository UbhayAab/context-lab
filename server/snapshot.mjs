// Freezes everything the UI needs into one read-only file for hosted "snapshot" mode.
// Usage: node --no-warnings server/snapshot.mjs [outFile] [--runs runIdA,runIdB]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combinedPayload, consensusPayload, contextPayload, feedbackPayload, impactsPayload, listRuns, loadRun, questionsPayload } from './data.mjs';
import { MIX_MATRIX, harnessStatus } from './harnesses.mjs';

const DEFAULT_OUT = fileURLToPath(new URL('../ui/public/data/snapshot.json', import.meta.url));

export function buildSnapshot(runIds) {
  const runs = listRuns().filter((r) => r.status === 'complete' && (!runIds || runIds.includes(r.runId)));
  return {
    generatedAt: new Date().toISOString(),
    status: {
      mode: 'snapshot', app: 'context-lab', version: '0.3.0',
      // Recorded on the author's machine; harness availability is historical, not the viewer's.
      harnesses: harnessStatus().map((h) => ({ ...h, signedIn: false, recordedOnly: true })),
      mixMatrix: MIX_MATRIX,
    },
    context: contextPayload(),
    questions: questionsPayload(),
    runs,
    runDetails: Object.fromEntries(runs.map((r) => [r.runId, loadRun(r.runId)])),
    feedback: feedbackPayload(null, null, 'default'),
    feedbackReview: feedbackPayload(null, null, 'review'),
    combined: combinedPayload(),
    consensus: consensusPayload(),
    impacts: impactsPayload(),
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_OUT;
  const i = process.argv.indexOf('--runs');
  const snap = buildSnapshot(i > 0 ? process.argv[i + 1].split(',') : null);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snap));
  console.log(`snapshot: ${snap.runs.length} runs, ${Object.values(snap.runDetails).reduce((n, d) => n + d.results.length, 0)} records -> ${out}`);
}
