import { Router } from 'express';
import { publicUser } from '../auth.js';
import { one } from '../db.js';
import { ah, audit, deepMerge, orgSettings, parse } from '../lib.js';
import { preferencesSchema } from '../schemas.js';

const r = Router();

r.get('/', (req, res) => {
  res.json({
    user: publicUser(req.user),
    org: { id: req.org.id, name: req.org.name, code: req.org.code, type: req.org.org_type, gst: orgSettings(req.org).gst },
  });
});

// Each user chooses the kinds of insurance they work on and their own defaults
r.put('/preferences', ah(async (req, res) => {
  const body = parse(preferencesSchema, req.body);
  const lines = body.lines || req.user.lines;
  const prefs = deepMerge(req.user.preferences || {}, body.preferences || {});
  if (!lines.includes(prefs.defaultLine)) prefs.defaultLine = lines[0];
  const user = await one('update users set lines = $2, preferences = $3 where id = $1 returning *', [req.user.id, lines, prefs]);
  await audit(req, 'user.preferences_updated', 'user', req.user.id, { lines });
  res.json({ user: publicUser(user) });
}));

export default r;
