import { ZodError } from 'zod';
import { query } from './db.js';
import { defaultSettings } from './engine/defaults.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wrap async route handlers so rejected promises reach the error handler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw r.error;
  return r.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Please check the highlighted fields',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === '23505') return res.status(409).json({ error: 'That record already exists' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, details: err.details });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

export function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merge `override` onto `base` (arrays are replaced, not merged). */
export function deepMerge(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Organisation settings merged over defaults so newly added settings always have a value. */
export const orgSettings = (org) => deepMerge(defaultSettings(), org.settings || {});

export async function audit(req, action, entity, entityId, details) {
  const orgId = req.org?.id;
  if (!orgId) return;
  await query(
    'insert into audit_log (org_id, user_id, action, entity, entity_id, details, ip) values ($1,$2,$3,$4,$5,$6,$7)',
    [orgId, req.user?.id || null, action, entity || null, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, req.ip],
  ).catch((e) => console.error('audit failed', e.message));
}

export function assertLine(user, line) {
  if (user && !user.lines.includes(line)) {
    throw new HttpError(403, `Your account is not set up for ${line === 'sme' ? 'Small Business' : 'Individual & Family'} health insurance. Update your insurance lines in Preferences or ask an admin.`);
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addYearsMinusDay(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
