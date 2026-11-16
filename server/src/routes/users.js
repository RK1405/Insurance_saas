import crypto from 'node:crypto';
import { Router } from 'express';
import { hashPassword, requireRole } from '../auth.js';
import { one, query } from '../db.js';
import { ah, audit, HttpError, parse } from '../lib.js';
import { inviteUserSchema, updateUserSchema } from '../schemas.js';

const r = Router();
r.use(requireRole('admin'));

const tempPassword = () => `Hs-${crypto.randomBytes(6).toString('base64url')}9`;
const cols = 'id, email, name, role, lines, active, must_change_password, last_login_at, created_at';

r.get('/', ah(async (req, res) => {
  const { rows } = await query(`select ${cols} from users where org_id = $1 order by created_at`, [req.org.id]);
  res.json({ users: rows });
}));

r.post('/', ah(async (req, res) => {
  const body = parse(inviteUserSchema, req.body);
  const exists = await one('select 1 from users where lower(email) = $1', [body.email]);
  if (exists) throw new HttpError(409, 'An account with this email already exists');
  const password = tempPassword();
  const user = await one(
    `insert into users (org_id, email, name, password_hash, role, lines, preferences, must_change_password)
     values ($1,$2,$3,$4,$5,$6,$7,true) returning ${cols}`,
    [req.org.id, body.email, body.name, await hashPassword(password), body.role, body.lines, { defaultLine: body.lines[0], theme: 'system' }],
  );
  await audit(req, 'user.invited', 'user', user.id, { email: body.email, role: body.role, lines: body.lines });
  res.status(201).json({ user, temporaryPassword: password });
}));

r.patch('/:id', ah(async (req, res) => {
  const body = parse(updateUserSchema, req.body);
  if (req.params.id === req.user.id && (body.role && body.role !== 'admin' || body.active === false)) {
    throw new HttpError(400, 'You cannot remove your own admin access');
  }
  const user = await one(
    `update users set role = coalesce($3, role), lines = coalesce($4, lines), active = coalesce($5, active)
     where id = $1 and org_id = $2 returning ${cols}`,
    [req.params.id, req.org.id, body.role ?? null, body.lines ?? null, body.active ?? null],
  );
  if (!user) throw new HttpError(404, 'User not found');
  await audit(req, 'user.updated', 'user', user.id, body);
  res.json({ user });
}));

r.post('/:id/reset-password', ah(async (req, res) => {
  const password = tempPassword();
  const user = await one(
    `update users set password_hash = $3, must_change_password = true where id = $1 and org_id = $2 returning ${cols}`,
    [req.params.id, req.org.id, await hashPassword(password)],
  );
  if (!user) throw new HttpError(404, 'User not found');
  await audit(req, 'user.password_reset', 'user', user.id);
  res.json({ user, temporaryPassword: password });
}));

export default r;
