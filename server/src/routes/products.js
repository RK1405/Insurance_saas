import { Router } from 'express';
import { requireRole } from '../auth.js';
import { one, query, tx } from '../db.js';
import { checkCompliance } from '../engine/compliance.js';
import { defaultRetailConfig, defaultSmeConfig } from '../engine/defaults.js';
import { ah, assertLine, audit, HttpError, isPlainObject, parse } from '../lib.js';
import { lineEnum, productCreateSchema, productUpdateSchema } from '../schemas.js';

const r = Router();
const canEdit = requireRole('admin', 'underwriter');
const defaultsFor = (line) => (line === 'retail' ? defaultRetailConfig() : defaultSmeConfig());

async function getOwned(req) {
  const p = await one('select * from products where id = $1 and org_id = $2', [req.params.id, req.org.id]);
  if (!p) throw new HttpError(404, 'Product not found');
  assertLine(req.user, p.line);
  return p;
}

r.get('/', ah(async (req, res) => {
  const params = [req.org.id, req.user.lines];
  let where = 'org_id = $1 and line = any($2)';
  if (req.query.line) { params.push(lineEnum.parse(req.query.line)); where += ` and line = $${params.length}`; }
  if (req.user.role === 'agent' || req.query.status === 'published') where += " and status = 'published'";
  else where += " and status <> 'archived'";
  const { rows } = await query(
    `select id, code, name, line, version, status, compliance->>'passed' as compliance_passed, updated_at, published_at,
            config->>'description' as description, config->'sumInsuredOptions' as sum_insured_options
     from products where ${where} order by line, code, version desc`,
    params,
  );
  res.json({ products: rows });
}));

r.get('/defaults/:line', canEdit, (req, res) => {
  res.json({ config: defaultsFor(lineEnum.parse(req.params.line)) });
});

r.post('/compliance-check', canEdit, (req, res) => {
  const line = lineEnum.parse(req.body?.line);
  if (!isPlainObject(req.body?.config)) throw new HttpError(400, 'config is required');
  res.json(checkCompliance(req.body.config, line));
});

r.get('/:id', ah(async (req, res) => {
  const p = await getOwned(req);
  if (req.user.role === 'agent' && p.status !== 'published') throw new HttpError(404, 'Product not found');
  res.json({ product: p });
}));

r.post('/', canEdit, ah(async (req, res) => {
  const body = parse(productCreateSchema, req.body);
  assertLine(req.user, body.line);
  const config = defaultsFor(body.line);
  const p = await one(
    `insert into products (org_id, code, name, line, config, compliance, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [req.org.id, body.code, body.name, body.line, config, checkCompliance(config, body.line), req.user.id],
  );
  await audit(req, 'product.created', 'product', p.id, { code: p.code, line: p.line });
  res.status(201).json({ product: p });
}));

r.put('/:id', canEdit, ah(async (req, res) => {
  const p = await getOwned(req);
  if (p.status !== 'draft') throw new HttpError(409, 'Only draft versions can be edited. Create a new version first.');
  const body = parse(productUpdateSchema, req.body);
  const config = body.config || p.config;
  const updated = await one(
    'update products set name = coalesce($2, name), config = $3, compliance = $4, updated_at = now() where id = $1 returning *',
    [p.id, body.name ?? null, config, checkCompliance(config, p.line)],
  );
  await audit(req, 'product.updated', 'product', p.id);
  res.json({ product: updated });
}));

r.post('/:id/publish', canEdit, ah(async (req, res) => {
  const p = await getOwned(req);
  if (p.status !== 'draft') throw new HttpError(409, 'Only drafts can be published');
  const compliance = checkCompliance(p.config, p.line);
  if (!compliance.passed) {
    await query('update products set compliance = $2 where id = $1', [p.id, compliance]);
    throw new HttpError(422, 'Compliance checks failed. Fix the highlighted items before publishing.', compliance);
  }
  const updated = await tx(async (db) => {
    // Only one live version per product code; the previous one is archived (existing policies keep their snapshot)
    await db.query(
      "update products set status = 'archived', updated_at = now() where org_id = $1 and code = $2 and status = 'published'",
      [req.org.id, p.code],
    );
    const { rows } = await db.query(
      "update products set status = 'published', compliance = $2, published_at = now(), updated_at = now() where id = $1 returning *",
      [p.id, compliance],
    );
    return rows[0];
  });
  await audit(req, 'product.published', 'product', p.id, { code: p.code, version: p.version });
  res.json({ product: updated });
}));

r.post('/:id/new-version', canEdit, ah(async (req, res) => {
  const p = await getOwned(req);
  const draft = await one("select id from products where org_id = $1 and code = $2 and status = 'draft'", [req.org.id, p.code]);
  if (draft) throw new HttpError(409, 'A draft version of this product already exists', { id: draft.id });
  const { max } = await one('select max(version) as max from products where org_id = $1 and code = $2', [req.org.id, p.code]);
  const copy = await one(
    `insert into products (org_id, code, name, line, version, config, compliance, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [req.org.id, p.code, p.name, p.line, max + 1, p.config, checkCompliance(p.config, p.line), req.user.id],
  );
  await audit(req, 'product.versioned', 'product', copy.id, { code: p.code, version: copy.version });
  res.status(201).json({ product: copy });
}));

r.post('/:id/archive', canEdit, ah(async (req, res) => {
  const p = await getOwned(req);
  const updated = await one("update products set status = 'archived', updated_at = now() where id = $1 returning *", [p.id]);
  await audit(req, 'product.archived', 'product', p.id);
  res.json({ product: updated });
}));

export default r;
