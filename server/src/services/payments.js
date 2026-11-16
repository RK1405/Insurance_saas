// Payment links. The gateway is a built-in DUMMY for testing: the customer opens a public page,
// clicks "Pay" and the payment is marked successful with a test reference. Swap `gateway`
// for Razorpay / PayU / Cashfree to take real payments; the rest of the flow stays the same.
import crypto from 'node:crypto';
import { one, query, tx } from '../db.js';
import { HttpError, today } from '../lib.js';
import { emit } from '../webhooks.js';

const LINK_DAYS = 7;

export function publicLink(l) {
  if (!l) return null;
  return {
    id: l.id, token: l.token, path: `/pay/${l.token}`, amount: l.amount, status: l.status, method: l.method,
    reference: l.reference, gateway: l.gateway, createdAt: l.created_at, expiresAt: l.expires_at, paidAt: l.paid_at,
  };
}

export const latestLink = (quoteId) =>
  one("select * from payment_links where quote_id = $1 and status <> 'cancelled' order by created_at desc limit 1", [quoteId]);

/** Creates a new link for the quote, cancelling any unpaid earlier link. */
export async function createLink(org, user, quote) {
  if (!['quoted', 'approved'].includes(quote.status)) throw new HttpError(409, `A payment link cannot be created for a ${quote.status} quote`);
  if (quote.valid_until < today()) throw new HttpError(409, 'This quote has expired. Create a new quote.');
  const existing = await latestLink(quote.id);
  if (existing?.status === 'paid') throw new HttpError(409, 'Payment has already been received for this quote');
  return tx(async (db) => {
    await db.query("update payment_links set status = 'cancelled' where quote_id = $1 and status = 'created'", [quote.id]);
    const token = crypto.randomBytes(24).toString('base64url');
    const { rows } = await db.query(
      `insert into payment_links (org_id, quote_id, token, amount, created_by, expires_at)
       values ($1,$2,$3,$4,$5, least(now() + interval '${LINK_DAYS} days', ($6::date + 1)::timestamptz)) returning *`,
      [org.id, quote.id, token, quote.total, user?.id || null, quote.valid_until],
    );
    return rows[0];
  });
}

async function loadByToken(token) {
  const l = await one(
    `select l.*, q.quote_number, q.status as quote_status, q.line, q.customer, q.valid_until, o.name as org_name, p.name as product_name
     from payment_links l join quotes q on q.id = l.quote_id join organizations o on o.id = l.org_id
     join products p on p.id = q.product_id where l.token = $1`,
    [token],
  );
  if (!l) throw new HttpError(404, 'This payment link is not valid');
  return l;
}

function payView(l) {
  const expired = l.status === 'created' && new Date(l.expires_at) < new Date();
  return {
    status: expired ? 'expired' : l.status,
    amount: l.amount,
    orgName: l.org_name,
    productName: l.product_name,
    quoteNumber: l.quote_number,
    line: l.line,
    customerName: l.customer?.name,
    method: l.method,
    reference: l.reference,
    paidAt: l.paid_at,
    expiresAt: l.expires_at,
    testMode: l.gateway === 'dummy',
  };
}

export async function getPayment(token) {
  return payView(await loadByToken(token));
}

/** Dummy gateway: marks the link paid with a generated test reference. */
export async function completePayment(token, method) {
  const l = await loadByToken(token);
  const view = payView(l);
  if (view.status === 'paid') throw new HttpError(409, 'This link has already been paid');
  if (view.status !== 'created') throw new HttpError(410, `This payment link is ${view.status}. Ask your agent for a new link.`);
  if (!['quoted', 'approved'].includes(l.quote_status)) throw new HttpError(409, 'This quote can no longer be paid');
  const reference = `pay_TEST${crypto.randomBytes(7).toString('hex').toUpperCase()}`;
  const updated = await one(
    "update payment_links set status = 'paid', method = $2, reference = $3, paid_at = now() where id = $1 and status = 'created' returning *",
    [l.id, method, reference],
  );
  if (!updated) throw new HttpError(409, 'This link has already been paid');
  await query(
    `insert into audit_log (org_id, action, entity, entity_id, details) values ($1, 'payment.received', 'quote', $2, $3)`,
    [l.org_id, l.quote_id, { quote: l.quote_number, amount: l.amount, method, reference, gateway: l.gateway }],
  );
  emit(l.org_id, 'payment.received', { quoteNumber: l.quote_number, amount: Number(l.amount), method, reference });
  return payView({ ...l, ...updated });
}
