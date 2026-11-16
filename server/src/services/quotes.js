// Quote → underwriting → issuance workflow. Shared by the web portal and the public partner API.
import { nextCounter, one, query, tx } from '../db.js';
import { rateRetail, rateSme, withGst } from '../engine/rating.js';
import { underwriteRetail, underwriteSme } from '../engine/underwriting.js';
import { addDays, addYearsMinusDay, HttpError, orgSettings, today } from '../lib.js';
import { emit } from '../webhooks.js';

const pad = (n, w) => String(n).padStart(w, '0');

async function loadPublishedProduct(orgId, productId, line) {
  const p = await one('select * from products where id = $1 and org_id = $2', [productId, orgId]);
  if (!p) throw new HttpError(404, 'Product not found');
  if (p.status !== 'published') throw new HttpError(422, 'This product is not published');
  if (p.line !== line) throw new HttpError(422, 'Product is for a different line of business');
  return p;
}

function statusFor(decision) {
  if (decision === 'refer') return 'referred';
  if (decision === 'decline') return 'declined';
  return 'quoted';
}

async function insertQuote(org, userId, source, q) {
  const settings = orgSettings(org);
  const validUntil = addDays(today(), settings.workflow.quoteValidityDays);
  return tx(async (db) => {
    const n = await nextCounter(db, org.id, `quote-${new Date().getUTCFullYear()}`);
    const number = `Q-${org.code}-${new Date().getUTCFullYear()}-${pad(n, 6)}`;
    const { rows } = await db.query(
      `insert into quotes (org_id, quote_number, product_id, line, status, source, customer, members, census, inputs,
                           rating, underwriting, premium, gst, total, stp, created_by, valid_until)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
      [org.id, number, q.productId, q.line, q.status, source, q.customer, JSON.stringify(q.members || []),
        JSON.stringify(q.census || []), q.inputs, q.rating, q.underwriting, q.price.premium, q.price.gst,
        q.price.total, q.stp, userId, validUntil],
    );
    return rows[0];
  });
}

function afterCreate(org, quote) {
  emit(org.id, 'quote.created', summary(quote));
  if (quote.status === 'referred') emit(org.id, 'quote.referred', summary(quote));
}

export function summary(q) {
  return {
    id: q.id, quoteNumber: q.quote_number, line: q.line, status: q.status, premium: q.premium, gst: q.gst,
    total: q.total, stp: q.stp, validUntil: q.valid_until, customer: q.customer,
  };
}

/** Instant indicative price without saving anything (used by the quote wizard). */
export async function previewRetail(org, input) {
  const product = await loadPublishedProduct(org.id, input.productId, 'retail');
  const rating = rateRetail(product.config, input);
  return { rating, price: withGst(rating.netPremium, orgSettings(org).gst.retail) };
}

export async function createRetailQuote(org, userId, input, source = 'portal') {
  const settings = orgSettings(org);
  const product = await loadPublishedProduct(org.id, input.productId, 'retail');
  rateRetail(product.config, input); // validate eligibility before underwriting
  const uw = underwriteRetail(settings.underwriting, input.members, input.sumInsured);
  const rating = rateRetail(product.config, input, uw.loadings);
  const price = withGst(rating.netPremium, settings.gst.retail);
  const { customer, members, ...inputs } = input;
  const quote = await insertQuote(org, userId, source, {
    productId: product.id, line: 'retail', status: statusFor(uw.decision), customer, members, inputs,
    rating, underwriting: uw, price, stp: uw.stp,
  });
  afterCreate(org, quote);
  return quote;
}

export async function createSmeQuote(org, userId, input, source = 'portal') {
  const settings = orgSettings(org);
  const product = await loadPublishedProduct(org.id, input.productId, 'sme');
  const base = rateSme(product.config, input);
  const uw = underwriteSme(settings.underwriting, base);
  const rating = uw.loadingPct ? rateSme(product.config, input, uw.loadingPct) : base;
  const price = withGst(rating.netPremium, settings.gst.sme);
  const { company, census, ...inputs } = input;
  const quote = await insertQuote(org, userId, source, {
    productId: product.id, line: 'sme', status: statusFor(uw.decision), customer: company, census, inputs,
    rating, underwriting: uw, price, stp: uw.stp,
  });
  afterCreate(org, quote);
  return quote;
}

/** Underwriter decision on a referred quote; approval re-rates with the underwriter's loadings. */
export async function decide(org, user, quote, body) {
  if (quote.status !== 'referred') throw new HttpError(409, 'Only referred quotes need an underwriting decision');
  const settings = orgSettings(org);
  const product = await one('select * from products where id = $1', [quote.product_id]);
  const manual = { by: user.name, at: new Date().toISOString(), decision: body.decision, notes: body.notes, exclusions: body.exclusions || [] };

  let rating = quote.rating;
  let price = { premium: quote.premium, gst: quote.gst, total: quote.total };
  let status = 'declined';

  if (body.decision === 'approve') {
    status = 'approved';
    if (quote.line === 'retail') {
      const loadings = body.memberLoadings || quote.underwriting.loadings || [];
      manual.memberLoadings = loadings;
      rating = rateRetail(product.config, { ...quote.inputs, members: quote.members }, loadings);
      price = withGst(rating.netPremium, settings.gst.retail);
    } else {
      const loadingPct = body.loadingPct ?? quote.underwriting.loadingPct ?? 0;
      manual.loadingPct = loadingPct;
      rating = rateSme(product.config, { ...quote.inputs, census: quote.census }, loadingPct);
      price = withGst(rating.netPremium, settings.gst.sme);
    }
  }

  const updated = await one(
    `update quotes set status = $2, rating = $3, underwriting = underwriting || jsonb_build_object('manual', $4::jsonb),
            premium = $5, gst = $6, total = $7, decided_by = $8, decided_at = now(), decision_notes = $9,
            valid_until = $10, updated_at = now()
     where id = $1 returning *`,
    [quote.id, status, rating, manual, price.premium, price.gst, price.total, user.id, body.notes,
      addDays(today(), settings.workflow.quoteValidityDays)],
  );
  emit(org.id, status === 'approved' ? 'quote.approved' : 'quote.declined', summary(updated));
  return updated;
}

/** Collect payment details and issue the policy. */
export async function issue(org, user, quote, body) {
  const settings = orgSettings(org);
  if (!['quoted', 'approved'].includes(quote.status)) {
    throw new HttpError(409, quote.status === 'issued' ? 'A policy has already been issued for this quote' : `A ${quote.status} quote cannot be issued`);
  }
  if (quote.valid_until < today()) {
    await query("update quotes set status = 'expired', updated_at = now() where id = $1", [quote.id]);
    throw new HttpError(409, 'This quote has expired. Create a new quote.');
  }
  if (user.role === 'agent' && !settings.workflow.agentsCanIssue) throw new HttpError(403, 'Agents are not allowed to issue policies in your organisation');
  const paidLink = await one("select * from payment_links where quote_id = $1 and status = 'paid' order by paid_at desc limit 1", [quote.id]);
  if (paidLink) {
    body = { ...body, payment: { method: paidLink.method, reference: paidLink.reference, gateway: paidLink.gateway, paymentLinkId: paidLink.id, paidAt: paidLink.paid_at } };
  }
  if (settings.workflow.requirePaymentReference && !body.payment.reference) throw new HttpError(400, 'Payment reference (UTR / transaction ID) is required');
  if (body.startDate < today() || body.startDate > addDays(today(), 60)) throw new HttpError(400, 'Start date must be between today and 60 days from today');

  const product = await one('select * from products where id = $1', [quote.product_id]);
  const c = product.config;
  const endDate = addYearsMinusDay(body.startDate, 1);
  const peds = quote.line === 'retail'
    ? (quote.underwriting.members || []).map((m) => ({ name: m.name, peds: m.peds })).filter((m) => m.peds.length)
    : [];

  const schedule = {
    product: { id: product.id, code: product.code, name: product.name, version: product.version },
    benefits: c.benefits,
    waitingPeriods: c.waitingPeriods,
    freeLookDays: c.freeLookDays,
    gracePeriodDays: c.gracePeriodDays,
    moratoriumMonths: c.moratoriumMonths,
    rating: quote.rating,
    inputs: quote.inputs,
    members: quote.line === 'retail' ? quote.members.map(({ declaration, ...m }) => m) : undefined,
    categories: quote.line === 'sme' ? quote.inputs.categories : undefined,
    lives: quote.line === 'sme' ? quote.census.length : quote.members.length,
    pedDeclared: peds,
    exclusions: quote.underwriting?.manual?.exclusions || [],
    gstRatePct: quote.rating ? (quote.line === 'retail' ? settings.gst.retail : settings.gst.sme) : 0,
    taxNote: quote.line === 'retail'
      ? 'Premium paid by any mode other than cash is eligible for deduction under Section 80D of the Income-tax Act, subject to limits.'
      : 'Group premium paid by the employer is a business expense; GST input credit as per applicable law.',
  };

  const policy = await tx(async (db) => {
    const locked = await db.query('select status from quotes where id = $1 for update', [quote.id]);
    if (locked.rows[0].status === 'issued') throw new HttpError(409, 'A policy has already been issued for this quote');
    const year = new Date().getUTCFullYear();
    const n = await nextCounter(db, org.id, `policy-${year}`);
    const number = `${org.code}/${quote.line === 'retail' ? 'HR' : 'HG'}/${year}/${pad(n, 7)}`;
    const { rows } = await db.query(
      `insert into policies (org_id, quote_id, product_id, policy_number, line, customer, start_date, end_date,
                             premium, gst, total, payment, schedule, issued_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [org.id, quote.id, product.id, number, quote.line, quote.customer, body.startDate, endDate, quote.premium,
        quote.gst, quote.total, { ...body.payment, amount: quote.total, recordedAt: new Date().toISOString() }, schedule, user.id],
    );
    await db.query("update quotes set status = 'issued', updated_at = now() where id = $1", [quote.id]);
    return rows[0];
  });

  emit(org.id, 'policy.issued', { policyNumber: policy.policy_number, quoteNumber: quote.quote_number, line: policy.line, startDate: policy.start_date, endDate: policy.end_date, total: policy.total, customer: policy.customer });
  return policy;
}
