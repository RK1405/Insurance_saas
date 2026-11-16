import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { generateApiKey, hashApiKey, requireRole } from '../auth.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ah, audit, HttpError, parse } from '../lib.js';
import { WEBHOOK_EVENTS } from '../webhooks.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/keys', ah(async (req, res) => {
  const { rows } = await query('select id, name, prefix, created_at, last_used_at, revoked_at from api_keys where org_id = $1 order by created_at desc', [req.org.id]);
  res.json({ keys: rows });
}));

r.post('/keys', ah(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
  const key = generateApiKey();
  const row = await one(
    'insert into api_keys (org_id, name, prefix, key_hash, created_by) values ($1,$2,$3,$4,$5) returning id, name, prefix, created_at',
    [req.org.id, name, key.slice(0, 12), hashApiKey(key), req.user.id],
  );
  await audit(req, 'api_key.created', 'api_key', row.id, { name });
  res.status(201).json({ key: row, secret: key });
}));

r.delete('/keys/:id', ah(async (req, res) => {
  const row = await one('update api_keys set revoked_at = now() where id = $1 and org_id = $2 and revoked_at is null returning id', [req.params.id, req.org.id]);
  if (!row) throw new HttpError(404, 'Key not found');
  await audit(req, 'api_key.revoked', 'api_key', row.id);
  res.json({ ok: true });
}));

const webhookSchema = z.object({
  url: z.string().trim().url().max(500).refine((u) => !config.isProd || u.startsWith('https://'), 'Webhook URLs must use https'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

r.get('/webhooks', ah(async (req, res) => {
  const { rows } = await query(
    `select w.id, w.url, w.events, w.active, w.created_at,
            (select json_agg(d order by d.at desc) from (select event, status_code, error, at from webhook_deliveries
              where webhook_id = w.id order by at desc limit 5) d) as recent
     from webhooks w where w.org_id = $1 order by w.created_at desc`,
    [req.org.id],
  );
  res.json({ webhooks: rows });
}));

r.post('/webhooks', ah(async (req, res) => {
  const body = parse(webhookSchema, req.body);
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const row = await one('insert into webhooks (org_id, url, events, secret) values ($1,$2,$3,$4) returning id, url, events, active, created_at', [req.org.id, body.url, body.events, secret]);
  await audit(req, 'webhook.created', 'webhook', row.id, { url: body.url });
  res.status(201).json({ webhook: row, secret });
}));

r.delete('/webhooks/:id', ah(async (req, res) => {
  const row = await one('delete from webhooks where id = $1 and org_id = $2 returning id', [req.params.id, req.org.id]);
  if (!row) throw new HttpError(404, 'Webhook not found');
  await audit(req, 'webhook.deleted', 'webhook', row.id);
  res.json({ ok: true });
}));

export default r;
