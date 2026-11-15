// Deterministic synthetic commerce dataset. Same seed -> identical facts on every machine.
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DB_PATH = fileURLToPath(new URL('./commerce.db', import.meta.url));
const SEED = 42;
const CUSTOMERS = 60;
const ORDERS = 700;
const TEST_ACCOUNT_IDS = new Set([5, 13, 22, 31, 44, 58]);
const REGIONS = ['North', 'South', 'East', 'West'];
const FIRST = ['Asha', 'Ben', 'Chen', 'Dara', 'Eli', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jo', 'Kiran', 'Lea'];
const LAST = ['Rao', 'Silva', 'Kim', 'Okafor', 'Novak', 'Haddad', 'Berg', 'Ito', 'Moreau', 'Shah'];
const AMOUNT_RANGE = { enterprise: [800, 6000], smb: [150, 1800], consumer: [20, 400] };
const REFUND_RATE = 0.1;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w) => String(n).padStart(w, '0');
const addDays = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
const segmentFor = (r) => (r < 0.2 ? 'enterprise' : r < 0.55 ? 'smb' : 'consumer');

export function seed(path = DB_PATH) {
  const rand = mulberry32(SEED);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const money = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;

  rmSync(path, { force: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL,
      segment TEXT NOT NULL, is_test INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
      order_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('completed','pending','cancelled')),
      amount REAL NOT NULL);
    CREATE TABLE refunds (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      refund_date TEXT NOT NULL, amount REAL NOT NULL);
  `);
  const insC = db.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?)');
  const insO = db.prepare('INSERT INTO orders VALUES (?,?,?,?,?)');
  const insR = db.prepare('INSERT INTO refunds VALUES (?,?,?,?)');

  const customers = [];
  for (let i = 1; i <= CUSTOMERS; i++) {
    const isTest = TEST_ACCOUNT_IDS.has(i);
    const c = {
      id: 'C' + pad(i, 3),
      name: isTest ? `QA Test Account ${i}` : `${pick(FIRST)} ${pick(LAST)}`,
      region: pick(REGIONS),
      segment: segmentFor(rand()),
    };
    customers.push(c);
    insC.run(c.id, c.name, c.region, c.segment, isTest ? 1 : 0, `2026-0${1 + Math.floor(rand() * 6)}-15`);
  }

  let refundN = 0;
  let c017Completed = 0;
  for (let i = 1; i <= ORDERS; i++) {
    const c = customers[Math.floor(rand() * customers.length)];
    const date = addDays('2026-07-01', Math.floor(rand() * 123)); // Jul 1 .. Oct 31
    const r = rand();
    const status = r < 0.78 ? 'completed' : r < 0.9 ? 'pending' : 'cancelled';
    const [lo, hi] = AMOUNT_RANGE[c.segment];
    const amount = money(lo, hi);
    const id = 'O' + pad(i, 4);
    insO.run(id, c.id, date, status, amount);
    // Guarantee the single-customer question exercises the refund rule.
    const forceRefund = c.id === 'C017' && status === 'completed' && c017Completed++ % 2 === 0;
    if (status === 'completed' && (rand() < REFUND_RATE || forceRefund)) {
      refundN++;
      const refundAmount = Math.round(amount * (0.2 + rand() * 0.8) * 100) / 100;
      insR.run('R' + pad(refundN, 4), id, addDays(date, 3 + Math.floor(rand() * 38)), refundAmount);
    }
  }
  db.close();
  return path;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('seeded', seed());
}
