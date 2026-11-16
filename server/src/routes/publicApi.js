// Partner / embedded-distribution API, authenticated with an organisation API key (x-api-key header).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireApiKey } from '../auth.js';
import { one, query } from '../db.js';
import { ah, HttpError, parse } from '../lib.js';
import { issueSchema, retailQuoteSchema, smeQuoteSchema } from '../schemas.js';
import { createRetailQuote, createSmeQuote, issue, summary } from '../services/quotes.js';

const r = Router();
r.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
r.use(requireApiKey);

const API_USER = { id: null, role: 'api', name: 'Partner API' };

r.get('/products', ah(async (req, res) => {
  const { rows } = await query(
    "select id, code, name, line, version, config from products where org_id = $1 and status = 'published' order by line, code",
    [req.org.id],
  );
  res.json({ products: rows });
}));

r.post('/quotes/retail', ah(async (req, res) => {
  const quote = await createRetailQuote(req.org, null, parse(retailQuoteSchema, req.body), 'api');
  res.status(201).json({ quote: { ...summary(quote), underwriting: quote.underwriting, rating: quote.rating } });
}));

r.post('/quotes/sme', ah(async (req, res) => {
  const quote = await createSmeQuote(req.org, null, parse(smeQuoteSchema, req.body), 'api');
  res.status(201).json({ quote: { ...summary(quote), underwriting: quote.underwriting, rating: quote.rating } });
}));

async function byNumber(req) {
  const q = await one('select * from quotes where org_id = $1 and quote_number = $2', [req.org.id, req.params.number]);
  if (!q) throw new HttpError(404, 'Quote not found');
  return q;
}

r.get('/quotes/:number', ah(async (req, res) => {
  const q = await byNumber(req);
  const policy = await one('select policy_number, status, start_date, end_date from policies where quote_id = $1', [q.id]);
  res.json({ quote: summary(q), policy });
}));

r.post('/quotes/:number/issue', ah(async (req, res) => {
  const q = await byNumber(req);
  const policy = await issue(req.org, API_USER, q, parse(issueSchema, req.body));
  res.status(201).json({ policy: { policyNumber: policy.policy_number, startDate: policy.start_date, endDate: policy.end_date, total: policy.total } });
}));

export default r;
