// Golden answers computed straight from the data with finance's definition (context 1.1.0).
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from '../data/seed.mjs';
import { QUESTIONS } from './questions.mjs';

const REGIONS = ['North', 'South', 'East', 'West'];
const NET_SQL = (where) => `
  SELECT ROUND(COALESCE(SUM(o.amount - COALESCE(rf.r, 0)), 0), 2) AS v
  FROM orders o JOIN customers c ON c.id = o.customer_id
  LEFT JOIN (SELECT order_id, SUM(amount) AS r FROM refunds GROUP BY order_id) rf ON rf.order_id = o.id
  WHERE o.status = 'completed' AND c.is_test = 0 AND (${where})`;

const round2 = (x) => Math.round(x * 100) / 100;

export function goldenAnswers(path = DB_PATH) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const net = (where) => db.prepare(NET_SQL(where)).get().v;
    const byRegion = Object.fromEntries(REGIONS.map((r) => [r, net(`c.region='${r}'`)]));
    const answers = {};
    for (const q of QUESTIONS) {
      if (q.kind === 'max-region') answers[q.id] = Math.max(...Object.values(byRegion));
      else if (q.kind === 'east-minus-west') answers[q.id] = round2(byRegion.East - byRegion.West);
      else answers[q.id] = net(q.where);
    }
    return answers;
  } finally {
    db.close();
  }
}

// Every golden value is an exact cent sum, so only rounding noise is forgiven. A relative tolerance
// (tried first) let a $37 error on the all-time total pass, enough to hide a missing order.
const TOLERANCE_USD = 0.05;

/** Correct when within 5 cents: tolerates cent rounding, not logic errors. */
export function isCorrect(answer, golden) {
  if (typeof answer !== 'number' || Number.isNaN(answer)) return false;
  return Math.abs(answer - golden) <= TOLERANCE_USD;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) console.log(goldenAnswers());
