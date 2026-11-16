// End-to-end API tests against a real PostgreSQL database (TEST_DATABASE_URL).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/healthstack_test';
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');

let server;
let base;

before(async () => {
  await pool.query('drop schema public cascade; create schema public;');
  await migrate();
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await pool.end();
});

/** Minimal cookie-keeping client. */
function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b ?? {}, h), put: (p, b) => call('PUT', p, b), patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p) };
}

const admin = client();
const admin2 = client();
const agent = client();
const ctx = {};

const member = (name, relation, age, decl = {}) => ({ name, relation, age, gender: 'male', declaration: { heightCm: 175, weightKg: 70, ...decl } });
const customer = { name: 'Test Customer', phone: '9876543210', city: 'Pune', pincode: '411001', nomineeName: 'Nominee', nomineeRelation: 'spouse' };

test('register, session cookie and /me', async () => {
  const r = await admin.post('/api/auth/register', { orgName: 'Alpha Insurance', orgType: 'insurer', name: 'Alpha Admin', email: 'a@alpha.in', password: 'Secret#123', lines: ['retail', 'sme'] });
  assert.equal(r.status, 201);
  const me = await admin.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'admin');
  assert.deepEqual(me.body.org.gst, { retail: 0, sme: 18 });
  const dup = await client().post('/api/auth/register', { orgName: 'Xeta Brokers', orgType: 'broker', name: 'Xeta Admin', email: 'A@alpha.in', password: 'Secret#123', lines: ['retail'] });
  assert.equal(dup.status, 409);
});

test('login: wrong password rejected, unauthenticated requests 401', async () => {
  assert.equal((await client().post('/api/auth/login', { email: 'a@alpha.in', password: 'nope' })).status, 401);
  assert.equal((await client().get('/api/quotes')).status, 401);
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email: 'a@alpha.in', password: 'Secret#123' })).status, 200);
  assert.equal((await c.get('/api/quotes')).status, 200);
});

test('starter products are published and compliant', async () => {
  const r = await admin.get('/api/products?status=published');
  assert.equal(r.body.products.length, 2);
  ctx.retail = r.body.products.find((p) => p.line === 'retail').id;
  ctx.sme = r.body.products.find((p) => p.line === 'sme').id;
});

test('admin invites a retail-only agent who must change password', async () => {
  const r = await admin.post('/api/users', { name: 'Agent One', email: 'agent@alpha.in', role: 'agent', lines: ['retail'] });
  assert.equal(r.status, 201);
  await agent.post('/api/auth/login', { email: 'agent@alpha.in', password: r.body.temporaryPassword });
  assert.equal((await agent.get('/api/quotes')).status, 403, 'blocked until password changed');
  assert.equal((await agent.post('/api/auth/change-password', { currentPassword: r.body.temporaryPassword, newPassword: 'AgentPass#1' })).status, 200);
  assert.equal((await agent.get('/api/quotes')).status, 200);
});

test('per-user lines: retail agent cannot quote SME or see SME products', async () => {
  const p = await agent.get('/api/products');
  assert.ok(p.body.products.every((x) => x.line === 'retail'));
  const r = await agent.post('/api/quotes/sme', { productId: ctx.sme });
  assert.equal(r.status, 403);
  // preferences round-trip
  const pref = await agent.put('/api/me/preferences', { preferences: { defaultSumInsured: 1500000, theme: 'dark' } });
  assert.equal(pref.body.user.preferences.defaultSumInsured, 1500000);
  assert.equal(pref.body.user.preferences.theme, 'dark');
});

test('preview gives an instant price', async () => {
  const r = await agent.post('/api/quotes/retail/preview', { productId: ctx.retail, coverType: 'floater', sumInsured: 500000, cityTier: 2, members: [{ name: 'A', relation: 'self', age: 30, gender: 'male' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.price.total, 3750);
});

test('retail: STP quote → issue policy', async () => {
  const q = await agent.post('/api/quotes/retail', { productId: ctx.retail, coverType: 'floater', sumInsured: 500000, cityTier: 2, members: [member('A', 'self', 30), member('B', 'spouse', 28)], customer });
  assert.equal(q.status, 201);
  assert.equal(q.body.quote.status, 'quoted');
  assert.equal(q.body.quote.stp, true);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await agent.post(`/api/quotes/${q.body.quote.id}/issue`, { startDate: today, payment: { method: 'upi' } })).status, 400, 'payment reference required');
  const iss = await agent.post(`/api/quotes/${q.body.quote.id}/issue`, { startDate: today, payment: { method: 'upi', reference: 'UTR1' } });
  assert.equal(iss.status, 201);
  assert.match(iss.body.policy.policy_number, /\/HR\/\d{4}\/0000001$/);
  assert.equal((await agent.post(`/api/quotes/${q.body.quote.id}/issue`, { startDate: today, payment: { method: 'upi', reference: 'UTR1' } })).status, 409, 'no double issuance');
});

test('validation errors are reported per field', async () => {
  const r = await agent.post('/api/quotes/retail', { productId: ctx.retail, coverType: 'floater', sumInsured: 500000, cityTier: 2, members: [member('A', 'self', 30)], customer: { ...customer, phone: '12345' } });
  assert.equal(r.status, 400);
  assert.ok(r.body.issues.some((i) => i.path === 'customer.phone'));
});

test('retail: referred quote → underwriter approves with loading → issue', async () => {
  const q = await agent.post('/api/quotes/retail', { productId: ctx.retail, coverType: 'individual', sumInsured: 500000, cityTier: 1, members: [member('Old', 'self', 63)], customer });
  assert.equal(q.body.quote.status, 'referred');
  const id = q.body.quote.id;
  assert.equal((await agent.post(`/api/quotes/${id}/decision`, { decision: 'approve', notes: 'ok' })).status, 403, 'agents cannot decide');
  assert.equal((await agent.post(`/api/quotes/${id}/issue`, { startDate: new Date().toISOString().slice(0, 10), payment: { method: 'upi', reference: 'x' } })).status, 409);
  const d = await admin.post(`/api/quotes/${id}/decision`, { decision: 'approve', notes: 'Medicals clear', memberLoadings: [20], exclusions: ['Knee replacement'] });
  assert.equal(d.status, 200);
  assert.equal(d.body.quote.status, 'approved');
  assert.ok(d.body.quote.premium > q.body.quote.premium, 'loading increases premium');
  const iss = await agent.post(`/api/quotes/${id}/issue`, { startDate: new Date().toISOString().slice(0, 10), payment: { method: 'card', reference: 'TXN9' } });
  assert.equal(iss.status, 201);
  assert.deepEqual(iss.body.policy.schedule.exclusions, ['Knee replacement']);
});

test('sme: group quote with 18% GST, issue', async () => {
  const census = Array.from({ length: 12 }, (_, i) => ({ employeeId: `E${i}`, name: `Emp ${i}`, relation: 'self', age: 25 + i, gender: 'female', category: i < 4 ? 'A' : 'B' }));
  const q = await admin.post('/api/quotes/sme', {
    productId: ctx.sme, cityTier: 1, options: ['MAT'], categories: { A: { sumInsured: 500000 }, B: { sumInsured: 300000 } },
    company: { name: 'Beta Pvt Ltd', industry: 'it_services', city: 'Pune', pincode: '411001', contactName: 'HR', contactPhone: '9123456789' }, census,
  });
  assert.equal(q.status, 201);
  assert.equal(q.body.quote.status, 'quoted');
  assert.equal(q.body.quote.gst, Math.round(q.body.quote.premium * 18) / 100);
  const iss = await admin.post(`/api/quotes/${q.body.quote.id}/issue`, { startDate: new Date().toISOString().slice(0, 10), payment: { method: 'neft', reference: 'N1' } });
  assert.equal(iss.status, 201);
  assert.match(iss.body.policy.policy_number, /\/HG\//);
});

test('agents only see their own quotes; tenants are isolated', async () => {
  const mine = await agent.get('/api/quotes');
  assert.ok(mine.body.quotes.every((q) => q.line === 'retail' && q.created_by_name === 'Agent One'));
  await admin2.post('/api/auth/register', { orgName: 'Gamma Brokers', orgType: 'broker', name: 'Gamma Admin', email: 'g@gamma.in', password: 'Secret#123', lines: ['retail'] });
  const other = await admin2.get('/api/quotes');
  assert.equal(other.body.quotes.length, 0);
  const anyAlphaQuote = (await admin.get('/api/quotes')).body.quotes[0].id;
  assert.equal((await admin2.get(`/api/quotes/${anyAlphaQuote}`)).status, 404);
  assert.equal((await admin2.get(`/api/products/${ctx.retail}`)).status, 404);
});

test('product versioning: compliance blocks publish, new version replaces old', async () => {
  const v2 = await admin.post(`/api/products/${ctx.retail}/new-version`);
  assert.equal(v2.status, 201);
  const cfg = { ...v2.body.product.config, freeLookDays: 10 };
  await admin.put(`/api/products/${v2.body.product.id}`, { config: cfg });
  const fail = await admin.post(`/api/products/${v2.body.product.id}/publish`);
  assert.equal(fail.status, 422);
  await admin.put(`/api/products/${v2.body.product.id}`, { config: { ...cfg, freeLookDays: 30, sumInsuredOptions: [500000, 700000] } });
  assert.equal((await admin.post(`/api/products/${v2.body.product.id}/publish`)).status, 200);
  const live = await admin.get('/api/products?status=published');
  const retail = live.body.products.filter((p) => p.line === 'retail');
  assert.equal(retail.length, 1);
  assert.equal(retail[0].version, 2);
  ctx.retail = retail[0].id;
});

test('settings: admin changes underwriting rules, underwriter cannot', async () => {
  const s = await admin.put('/api/settings', { underwriting: { referAboveAge: 70 } });
  assert.equal(s.body.settings.underwriting.referAboveAge, 70);
  assert.equal(s.body.settings.underwriting.bmi.max, 30, 'other rules untouched');
  const q = await agent.post('/api/quotes/retail', { productId: ctx.retail, coverType: 'individual', sumInsured: 500000, cityTier: 1, members: [member('Old', 'self', 63)], customer });
  assert.equal(q.body.quote.status, 'quoted', 'age 63 now auto-approved');
  assert.equal((await agent.put('/api/settings', { gst: { retail: 5 } })).status, 403);
});

test('partner API with API key + signed webhook delivery', async () => {
  const k = await admin.post('/api/integrations/keys', { name: 'Bank' });
  assert.equal(k.status, 201);
  const key = k.body.secret;
  // local receiver for the webhook
  const http = await import('node:http');
  const crypto = await import('node:crypto');
  const received = [];
  const rx = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { received.push({ body: b, sig: req.headers['x-healthstack-signature'] }); res.end('ok'); }); }).listen(0);
  const wh = await admin.post('/api/integrations/webhooks', { url: `http://localhost:${rx.address().port}/hook`, events: ['policy.issued'] });
  assert.equal(wh.status, 201);

  assert.equal((await client().get('/api/v1/products', { 'x-api-key': 'bad' })).status, 401);
  const prods = await client().get('/api/v1/products', { 'x-api-key': key });
  assert.equal(prods.status, 200);
  const q = await client().post('/api/v1/quotes/retail', { productId: ctx.retail, coverType: 'individual', sumInsured: 500000, cityTier: 2, members: [member('Api', 'self', 33)], customer }, { 'x-api-key': key });
  assert.equal(q.status, 201);
  const num = q.body.quote.quoteNumber;
  const iss = await client().post(`/api/v1/quotes/${num}/issue`, { startDate: new Date().toISOString().slice(0, 10), payment: { method: 'upi', reference: 'API-UTR' } }, { 'x-api-key': key });
  assert.equal(iss.status, 201);
  const st = await client().get(`/api/v1/quotes/${num}`, { 'x-api-key': key });
  assert.equal(st.body.quote.status, 'issued');

  for (let i = 0; i < 20 && !received.length; i += 1) await new Promise((r) => setTimeout(r, 100));
  rx.close();
  assert.equal(received.length, 1);
  const expected = crypto.createHmac('sha256', wh.body.secret).update(received[0].body).digest('hex');
  assert.equal(received[0].sig, `sha256=${expected}`);
  assert.equal(JSON.parse(received[0].body).event, 'policy.issued');
});

test('analytics and audit', async () => {
  const a = await admin.get('/api/analytics/summary?days=30');
  assert.equal(a.status, 200);
  assert.ok(a.body.totals.issued >= 4);
  assert.ok(a.body.totals.gwp > 0);
  const agentView = await agent.get('/api/analytics/summary');
  assert.ok(agentView.body.totals.quotes < a.body.totals.quotes, 'agent sees only own numbers');
  const audit = await admin.get('/api/audit');
  assert.ok(audit.body.events.some((e) => e.action === 'policy.issued'));
  assert.equal((await agent.get('/api/audit')).status, 403);
});
