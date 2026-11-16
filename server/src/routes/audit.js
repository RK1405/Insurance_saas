import { Router } from 'express';
import { requireRole } from '../auth.js';
import { query } from '../db.js';
import { ah } from '../lib.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `select a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.at, u.name as user_name
     from audit_log a left join users u on u.id = a.user_id where a.org_id = $1 order by a.at desc limit 300`,
    [req.org.id],
  );
  res.json({ events: rows });
}));

export default r;
