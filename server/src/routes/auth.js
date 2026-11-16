import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { clearSession, hashPassword, publicUser, requireAuth, setSession, verifyPassword } from '../auth.js';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ah, audit, HttpError, parse } from '../lib.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../schemas.js';
import { createOrganisation } from '../services/orgs.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

// Dummy hash so failed logins for unknown emails take as long as wrong passwords
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);

r.post('/register', limiter, ah(async (req, res) => {
  if (!config.allowRegistration) throw new HttpError(403, 'Self sign-up is disabled. Ask your administrator for an invite.');
  const body = parse(registerSchema, req.body);
  const exists = await one('select 1 from users where lower(email) = $1', [body.email]);
  if (exists) throw new HttpError(409, 'An account with this email already exists');
  const { org, user } = await createOrganisation(body);
  setSession(res, user);
  req.org = org; req.user = user;
  await audit(req, 'org.registered', 'organization', org.id, { name: org.name });
  res.status(201).json({ user: publicUser(user) });
}));

r.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await one('select * from users where lower(email) = $1', [email]);
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.active) throw new HttpError(401, 'Incorrect email or password');
  await query('update users set last_login_at = now() where id = $1', [user.id]);
  setSession(res, user);
  req.org = { id: user.org_id }; req.user = user;
  await audit(req, 'user.login', 'user', user.id);
  res.json({ user: publicUser(user) });
}));

r.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.post('/change-password', requireAuth, ah(async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const row = await one('select password_hash from users where id = $1', [req.user.id]);
  if (!(await verifyPassword(body.currentPassword, row.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  await query('update users set password_hash = $2, must_change_password = false where id = $1', [req.user.id, await hashPassword(body.newPassword)]);
  await audit(req, 'user.password_changed', 'user', req.user.id);
  res.json({ ok: true });
}));

export default r;
