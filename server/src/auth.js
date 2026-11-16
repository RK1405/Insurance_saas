import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, query } from './db.js';
import { ah, HttpError } from './lib.js';

export const COOKIE = 'hs_session';

export const hashPassword = (pw) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, org: user.org_id }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

const USER_SQL = `
  select u.id, u.org_id, u.email, u.name, u.role, u.lines, u.preferences, u.active, u.must_change_password,
         o.id as o_id, o.name as o_name, o.code as o_code, o.org_type as o_type, o.settings as o_settings
  from users u join organizations o on o.id = u.org_id
  where u.id = $1`;

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, lines: u.lines,
    preferences: u.preferences || {}, mustChangePassword: u.must_change_password,
  };
}

/** Requires a valid session cookie; loads the user and their organisation on every request. */
export const requireAuth = ah(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'Please sign in');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  const row = await one(USER_SQL, [payload.sub]);
  if (!row || !row.active) throw new HttpError(401, 'Please sign in');
  req.user = { ...row, id: row.id, orgId: row.org_id };
  req.org = { id: row.o_id, name: row.o_name, code: row.o_code, org_type: row.o_type, settings: row.o_settings };
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) return next(new HttpError(403, 'You do not have permission to do this'));
  next();
};

/** Blocks most API use until a user replaces an admin-issued temporary password. */
export const requirePasswordCurrent = (req, _res, next) => {
  if (req.user?.must_change_password) return next(new HttpError(403, 'Please set a new password first'));
  next();
};

export const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

export function generateApiKey() {
  return `hs_live_${crypto.randomBytes(24).toString('base64url')}`;
}

/** Machine-to-machine auth for the public integration API (header: x-api-key). */
export const requireApiKey = ah(async (req, _res, next) => {
  const key = req.get('x-api-key');
  if (!key) throw new HttpError(401, 'Missing x-api-key header');
  const row = await one(
    `select k.id, o.id as org_id, o.name, o.code, o.org_type, o.settings
     from api_keys k join organizations o on o.id = k.org_id
     where k.key_hash = $1 and k.revoked_at is null`,
    [hashApiKey(key)],
  );
  if (!row) throw new HttpError(401, 'Invalid API key');
  req.apiKey = { id: row.id };
  req.org = { id: row.org_id, name: row.name, code: row.code, org_type: row.org_type, settings: row.settings };
  query('update api_keys set last_used_at = now() where id = $1', [row.id]).catch(() => {});
  next();
});
