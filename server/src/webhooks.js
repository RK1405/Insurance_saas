import crypto from 'node:crypto';
import { query } from './db.js';

export const WEBHOOK_EVENTS = ['quote.created', 'quote.referred', 'quote.approved', 'quote.declined', 'payment.received', 'policy.issued', 'policy.cancelled'];

/** Fire-and-forget delivery of an event to every subscribed webhook of the organisation. */
export function emit(orgId, event, data) {
  deliverAll(orgId, event, data).catch((e) => console.error('webhook emit failed', e.message));
}

async function deliverAll(orgId, event, data) {
  const { rows } = await query('select * from webhooks where org_id = $1 and active and $2 = any(events)', [orgId, event]);
  await Promise.all(rows.map((wh) => deliver(wh, event, data)));
}

async function deliver(wh, event, data) {
  const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data });
  const signature = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
  let status = null;
  let error = null;
  try {
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-healthstack-event': event, 'x-healthstack-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    status = res.status;
  } catch (e) {
    error = e.message;
  }
  await query('insert into webhook_deliveries (webhook_id, event, status_code, error) values ($1,$2,$3,$4)', [wh.id, event, status, error]);
}
