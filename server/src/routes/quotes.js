import { Router } from 'express';
import { requireRole } from '../auth.js';
import { one, query } from '../db.js';
import { ah, assertLine, audit, HttpError, parse, visibleLines } from '../lib.js';
import { decisionSchema, issueSchema, lineEnum, retailPreviewSchema, retailQuoteSchema, smeQuoteSchema } from '../schemas.js';
import { createRetailQuote, createSmeQuote, decide, issue, previewRetail } from '../services/quotes.js';
import { createLink, latestLink, publicLink } from '../services/payments.js';

const r = Router();

/** Admins see everything; underwriters see their lines; agents see only quotes they created. */
function scope(req, alias = 'q') {
  const params = [req.org.id, visibleLines(req.user)];
  let where = `${alias}.org_id = $1 and ${alias}.line = any($2)`;
  if (req.user.role === 'agent') { params.push(req.user.id); where += ` and ${alias}.created_by = $${params.length}`; }
  return { where, params };
}

async function loadQuote(req) {
  const { where, params } = scope(req);
  params.push(req.params.id);
  const q = await one(`select q.* from quotes q where ${where} and q.id = $${params.length}`, params);
  if (!q) throw new HttpError(404, 'Quote not found');
  return q;
}

r.get('/', ah(async (req, res) => {
  const { where, params } = scope(req);
  let filter = '';
  if (req.query.status) { params.push(String(req.query.status)); filter += ` and q.status = $${params.length}`; }
  if (req.query.line) { params.push(lineEnum.parse(req.query.line)); filter += ` and q.line = $${params.length}`; }
  if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 80)}%`); filter += ` and (q.quote_number ilike $${params.length} or q.customer->>'name' ilike $${params.length})`; }
  const { rows } = await query(
    `select q.id, q.quote_number, q.line, q.status, q.source, q.customer->>'name' as customer_name, q.premium, q.gst, q.total,
            q.stp, q.valid_until, q.created_at, p.name as product_name, u.name as created_by_name,
            jsonb_array_length(q.members) + jsonb_array_length(q.census) as lives
     from quotes q join products p on p.id = q.product_id left join users u on u.id = q.created_by
     where ${where}${filter} order by q.created_at desc limit 200`,
    params,
  );
  res.json({ quotes: rows });
}));

r.post('/retail/preview', ah(async (req, res) => {
  assertLine(req.user, 'retail');
  res.json(await previewRetail(req.org, parse(retailPreviewSchema, req.body)));
}));

r.post('/retail', ah(async (req, res) => {
  assertLine(req.user, 'retail');
  const quote = await createRetailQuote(req.org, req.user.id, parse(retailQuoteSchema, req.body));
  await audit(req, 'quote.created', 'quote', quote.id, { number: quote.quote_number, status: quote.status });
  res.status(201).json({ quote });
}));

r.post('/sme', ah(async (req, res) => {
  assertLine(req.user, 'sme');
  const quote = await createSmeQuote(req.org, req.user.id, parse(smeQuoteSchema, req.body));
  await audit(req, 'quote.created', 'quote', quote.id, { number: quote.quote_number, status: quote.status });
  res.status(201).json({ quote });
}));

r.get('/:id', ah(async (req, res) => {
  const q = await loadQuote(req);
  const product = await one('select id, code, name, version, line, config from products where id = $1', [q.product_id]);
  const policy = await one('select id, policy_number from policies where quote_id = $1', [q.id]);
  const decidedBy = q.decided_by ? await one('select name from users where id = $1', [q.decided_by]) : null;
  res.json({ quote: q, product, policy, decidedBy: decidedBy?.name, paymentLink: publicLink(await latestLink(q.id)) });
}));

r.post('/:id/decision', requireRole('admin', 'underwriter'), ah(async (req, res) => {
  const q = await loadQuote(req);
  const updated = await decide(req.org, req.user, q, parse(decisionSchema, req.body));
  await audit(req, `quote.${updated.status}`, 'quote', q.id, { number: q.quote_number });
  res.json({ quote: updated });
}));

// Stage 1 of issuance: create (or re-create) a payment link for the customer
r.post('/:id/payment-link', ah(async (req, res) => {
  const q = await loadQuote(req);
  const link = await createLink(req.org, req.user, q);
  await audit(req, 'payment_link.created', 'quote', q.id, { number: q.quote_number, amount: link.amount });
  res.status(201).json({ paymentLink: publicLink(link) });
}));

r.get('/:id/payment-link', ah(async (req, res) => {
  const q = await loadQuote(req);
  res.json({ paymentLink: publicLink(await latestLink(q.id)) });
}));

r.post('/:id/issue', ah(async (req, res) => {
  const q = await loadQuote(req);
  const policy = await issue(req.org, req.user, q, parse(issueSchema, req.body));
  await audit(req, 'policy.issued', 'policy', policy.id, { number: policy.policy_number, quote: q.quote_number });
  res.status(201).json({ policy });
}));

export default r;
