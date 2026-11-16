import { Router } from 'express';
import { requireRole } from '../auth.js';
import { one, query } from '../db.js';
import { addDays, ah, audit, HttpError } from '../lib.js';
import { emit } from '../webhooks.js';

const r = Router();

function scope(req) {
  const params = [req.org.id, req.user.lines];
  let where = 'p.org_id = $1 and p.line = any($2)';
  if (req.user.role === 'agent') { params.push(req.user.id); where += ` and p.issued_by = $${params.length}`; }
  return { where, params };
}

r.get('/', ah(async (req, res) => {
  const { where, params } = scope(req);
  const { rows } = await query(
    `select p.id, p.policy_number, p.line, p.status, p.customer->>'name' as customer_name, p.start_date, p.end_date,
            p.premium, p.gst, p.total, p.issued_at, p.schedule->'product'->>'name' as product_name, q.quote_number
     from policies p join quotes q on q.id = p.quote_id where ${where} order by p.issued_at desc limit 200`,
    params,
  );
  res.json({ policies: rows });
}));

async function load(req) {
  const { where, params } = scope(req);
  params.push(req.params.id);
  const p = await one(
    `select p.*, q.quote_number, u.name as issued_by_name from policies p
     join quotes q on q.id = p.quote_id left join users u on u.id = p.issued_by
     where ${where} and p.id = $${params.length}`,
    params,
  );
  if (!p) throw new HttpError(404, 'Policy not found');
  return p;
}

r.get('/:id', ah(async (req, res) => {
  res.json({ policy: await load(req), org: { name: req.org.name, code: req.org.code } });
}));

// Free-look cancellation: full refund within the free-look period (IRDAI), otherwise a normal cancellation
r.post('/:id/cancel', requireRole('admin', 'underwriter'), ah(async (req, res) => {
  const p = await load(req);
  if (p.status !== 'active') throw new HttpError(409, 'Policy is not active');
  const freeLookEnds = addDays(p.start_date, p.schedule.freeLookDays || 30);
  const isFreeLook = new Date().toISOString().slice(0, 10) <= freeLookEnds;
  const status = isFreeLook ? 'free_look_cancelled' : 'cancelled';
  const updated = await one('update policies set status = $2 where id = $1 returning *', [p.id, status]);
  await audit(req, 'policy.cancelled', 'policy', p.id, { status, reason: String(req.body?.reason || '').slice(0, 300) });
  emit(req.org.id, 'policy.cancelled', { policyNumber: p.policy_number, status });
  res.json({ policy: updated, freeLook: isFreeLook });
}));

export default r;
