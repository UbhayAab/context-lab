// Context artifacts, AI Registry style refs (namespace/kind/name@version).
// metric 1.0.0 is the realistic, subtly wrong definition most teams start with.
// metric 1.1.0 is the reviewed fix. Ontology and skill are shared by both releases.

export const ONTOLOGY = {
  ref: 'demo/ontology/commerce-model@1.0.0',
  title: 'Commerce data model',
  body: `SQLite database. Dates are ISO text (YYYY-MM-DD). Money is USD.
- customers(id, name, region, segment, is_test, created_at)
  region: North | South | East | West. segment: enterprise | smb | consumer.
  is_test = 1 marks internal QA accounts.
- orders(id, customer_id -> customers.id, order_date, status, amount)
  status: completed | pending | cancelled.
- refunds(id, order_id -> orders.id, refund_date, amount)
  A refund is money returned to the customer for one order.
An order's region and segment are those of its customer.`,
};

export const SKILL = {
  ref: 'demo/skill/revenue-analysis@1.0.0',
  title: 'Revenue analysis',
  body: `1. Read the metric definition below before writing any SQL. It is the company's source of truth.
2. Explore with small queries first, then compute the answer in SQL.
3. Round money to 2 decimals.`,
};

export const METRIC_VERSIONS = {
  '1.0.0': {
    ref: 'demo/metric/net-revenue@1.0.0',
    title: 'Net revenue',
    status: 'active',
    body: `Net revenue is the total value of orders, excluding cancelled orders, plus refunds.
Computation: SUM(orders.amount) for orders whose status is not 'cancelled', plus SUM(refunds.amount)
for refunds on those orders. Filter by transaction date.`,
  },
  '1.1.0': {
    ref: 'demo/metric/net-revenue@1.1.0',
    title: 'Net revenue',
    status: 'pending_review',
    body: `Net revenue is the revenue we keep from real customers.
Computation: SUM(orders.amount) for orders with status = 'completed' placed by real customers
(customers.is_test = 0), MINUS SUM(refunds.amount) for refunds issued against those same orders.
Rules:
1. Pending and cancelled orders are excluded.
2. Test accounts (customers.is_test = 1) are excluded.
3. Refunds are subtracted, never added.
4. For any date filter, use the original order's orders.order_date for both the order and its
   refunds. refund_date is ignored.
5. Region and segment come from the ordering customer.`,
    changelog: [
      'Pending orders were counted as revenue.',
      'Internal QA test accounts were counted as customers.',
      'Refunds were added instead of subtracted.',
      'Added an explicit date attribution rule (order_date, not refund_date).',
    ],
  },
};

export const CONTEXT_VERSIONS = Object.keys(METRIC_VERSIONS);

/** The snapshot an agent sees for one release of the metric. */
export function renderContext(metricVersion) {
  const metric = METRIC_VERSIONS[metricVersion];
  if (!metric) throw new Error(`Unknown metric version ${metricVersion}`);
  return [
    `# Context release: revenue analytics`,
    ``,
    `## Metric: ${metric.title} (${metric.ref})`,
    metric.body,
    ``,
    `## Data model (${ONTOLOGY.ref})`,
    ONTOLOGY.body,
    ``,
    `## Skill: ${SKILL.title} (${SKILL.ref})`,
    SKILL.body,
    ``,
  ].join('\n');
}
