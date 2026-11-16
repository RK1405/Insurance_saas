import { Router } from 'express';
import { requireRole } from '../auth.js';
import { one } from '../db.js';
import { CONDITIONS, INDUSTRIES, RELATIONS } from '../engine/defaults.js';
import { RULE_PACK } from '../engine/compliance.js';
import { WEBHOOK_EVENTS } from '../webhooks.js';
import { ah, audit, deepMerge, orgSettings, parse } from '../lib.js';
import { settingsSchema } from '../schemas.js';

const r = Router();

r.get('/meta', (req, res) => {
  res.json({ conditions: CONDITIONS, relations: RELATIONS, industries: INDUSTRIES, rulePack: RULE_PACK, webhookEvents: WEBHOOK_EVENTS });
});

r.get('/', requireRole('admin', 'underwriter'), (req, res) => {
  res.json({ settings: orgSettings(req.org) });
});

r.put('/', requireRole('admin'), ah(async (req, res) => {
  const body = parse(settingsSchema, req.body);
  const settings = deepMerge(orgSettings(req.org), body);
  await one('update organizations set settings = $2 where id = $1 returning id', [req.org.id, settings]);
  await audit(req, 'settings.updated', 'organization', req.org.id, Object.keys(body));
  res.json({ settings });
}));

export default r;
