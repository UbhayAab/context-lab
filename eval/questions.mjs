// Business questions an analytics agent gets asked. `where` filters orders (o) and customers (c)
// for the golden query. Golden truth = finance's definition (context 1.1.0). Every slice holds
// test accounts, pending orders and refunds, so a wrong definition changes the number.
export const QUESTIONS = [
  { id: 'q01', text: 'What is total net revenue across all time?', where: '1=1' },
  { id: 'q02', text: 'What is net revenue for the North region?', where: "c.region='North'" },
  { id: 'q03', text: 'What was net revenue in September 2026?', where: "o.order_date BETWEEN '2026-09-01' AND '2026-09-30'" },
  { id: 'q04', text: 'What is net revenue from enterprise customers?', where: "c.segment='enterprise'" },
  { id: 'q05', text: 'What was net revenue for the West region in October 2026?', where: "c.region='West' AND o.order_date BETWEEN '2026-10-01' AND '2026-10-31'" },
  { id: 'q06', text: 'What is net revenue from SMB customers in the South region?', where: "c.segment='smb' AND c.region='South'" },
  { id: 'q07', text: "Which region has the highest net revenue? Give that region's net revenue as the answer.", kind: 'max-region' },
  { id: 'q08', text: 'What was net revenue in Q3 2026 (July 1 to September 30)?', where: "o.order_date BETWEEN '2026-07-01' AND '2026-09-30'" },
  { id: 'q09', text: 'What was net revenue from consumer customers in August 2026?', where: "c.segment='consumer' AND o.order_date BETWEEN '2026-08-01' AND '2026-08-31'" },
  { id: 'q10', text: 'What is net revenue for the East region minus net revenue for the West region?', kind: 'east-minus-west' },
  { id: 'q11', text: 'What is net revenue for customer C017?', where: "c.id='C017'" },
  { id: 'q12', text: 'What was net revenue for the East region in July 2026?', where: "c.region='East' AND o.order_date BETWEEN '2026-07-01' AND '2026-07-31'" },
];
