// Demo data so a fresh deployment can be explored immediately (enabled with SEED_DEMO=true).
import { hashPassword } from './auth.js';
import { one, query } from './db.js';
import { createOrganisation } from './services/orgs.js';
import { createRetailQuote, createSmeQuote, issue } from './services/quotes.js';
import { today } from './lib.js';

export const DEMO_PASSWORD = 'Demo@12345';

export async function seedDemo() {
  const exists = await one("select id from organizations where code = 'DEMO'");
  if (exists) return;
  console.log('[seed] creating demo organisation');
  const { org, user: admin } = await createOrganisation({
    orgName: 'Demo Health Insurance Co.', orgType: 'insurer', name: 'Asha Admin', email: 'admin@demo.in',
    password: DEMO_PASSWORD, lines: ['retail', 'sme'], code: 'DEMO',
  });
  const hash = await hashPassword(DEMO_PASSWORD);
  const mk = (email, name, role, lines, prefs) => one(
    `insert into users (org_id, email, name, password_hash, role, lines, preferences) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [org.id, email, name, hash, role, lines, prefs],
  );
  const uw = await mk('underwriter@demo.in', 'Uday Underwriter', 'underwriter', ['retail', 'sme'], { defaultLine: 'retail', theme: 'system' });
  const retailAgent = await mk('agent@demo.in', 'Ravi Retail Agent', 'agent', ['retail'], { defaultLine: 'retail', defaultSumInsured: 1000000, defaultCityTier: 1, defaultCoverType: 'floater', theme: 'system' });
  const smeAgent = await mk('sme@demo.in', 'Sneha SME Agent', 'agent', ['sme'], { defaultLine: 'sme', defaultCityTier: 1, theme: 'system' });

  const products = (await query('select id, line from products where org_id = $1', [org.id])).rows;
  const retail = products.find((p) => p.line === 'retail').id;
  const sme = products.find((p) => p.line === 'sme').id;

  const customer = (name, phone, city) => ({ name, phone, city, pincode: '560001', nomineeName: 'Nominee', nomineeRelation: 'spouse' });
  const d = (h, w, extra = {}) => ({ heightCm: h, weightKg: w, smoker: false, conditions: [], hospitalisedLast3Years: false, onMedication: false, ...extra });

  const q1 = await createRetailQuote(org, retailAgent.id, {
    productId: retail, coverType: 'floater', sumInsured: 1000000, cityTier: 1, copayPct: 0, riders: ['OPD'],
    customer: customer('Priya Sharma', '9876543210', 'Bengaluru'),
    members: [
      { name: 'Priya Sharma', relation: 'self', age: 34, gender: 'female', declaration: d(162, 58) },
      { name: 'Arjun Sharma', relation: 'spouse', age: 36, gender: 'male', declaration: d(176, 80) },
      { name: 'Anya Sharma', relation: 'daughter', age: 6, gender: 'female', declaration: d(115, 20) },
    ],
  });
  await issue(org, retailAgent, q1, { startDate: today(), payment: { method: 'upi', reference: 'UPI-DEMO-0001' } });

  await createRetailQuote(org, retailAgent.id, {
    productId: retail, coverType: 'individual', sumInsured: 500000, cityTier: 2, copayPct: 10, riders: [],
    customer: customer('Mohan Iyer', '9812345678', 'Coimbatore'),
    members: [{ name: 'Mohan Iyer', relation: 'self', age: 52, gender: 'male', declaration: d(170, 88, { conditions: ['diabetes', 'hypertension'], onMedication: true }) }],
  });

  await createRetailQuote(org, retailAgent.id, {
    productId: retail, coverType: 'floater', sumInsured: 2500000, cityTier: 1, copayPct: 20, riders: [],
    customer: customer('Kamala Reddy', '9700011122', 'Hyderabad'),
    members: [
      { name: 'Kamala Reddy', relation: 'self', age: 64, gender: 'female', declaration: d(155, 62, { conditions: ['heart_disease'], hospitalisedLast3Years: true }) },
      { name: 'Venkat Reddy', relation: 'spouse', age: 67, gender: 'male', declaration: d(168, 70) },
    ],
  });

  const census = [];
  const names = ['Aditya', 'Bhavna', 'Chirag', 'Divya', 'Eshan', 'Farah', 'Gaurav', 'Harini', 'Imran', 'Jaya', 'Kunal', 'Lakshmi'];
  names.forEach((n, i) => {
    const id = `E${100 + i}`;
    census.push({ employeeId: id, name: `${n} K`, relation: 'self', age: 24 + (i * 3) % 30, gender: i % 2 ? 'female' : 'male', category: i < 3 ? 'A' : 'B' });
    if (i % 3 === 0) census.push({ employeeId: id, name: `${n} spouse`, relation: 'spouse', age: 26 + (i * 3) % 28, gender: i % 2 ? 'male' : 'female', category: i < 3 ? 'A' : 'B' });
    if (i % 4 === 0) census.push({ employeeId: id, name: `${n} child`, relation: 'son', age: 4 + i % 10, gender: 'male', category: i < 3 ? 'A' : 'B' });
  });
  const q4 = await createSmeQuote(org, smeAgent.id, {
    productId: sme, cityTier: 1, options: ['MAT'], categories: { A: { label: 'Managers', sumInsured: 500000 }, B: { label: 'Staff', sumInsured: 300000 } },
    company: { name: 'Kaveri Software Pvt Ltd', industry: 'it_services', city: 'Bengaluru', pincode: '560034', contactName: 'Meera HR', contactPhone: '9900112233', gstin: '29ABCDE1234F1Z5' },
    census,
  });
  await issue(org, smeAgent, q4, { startDate: today(), payment: { method: 'neft', reference: 'NEFT-DEMO-7781' } });
  console.log(`[seed] demo ready: admin@demo.in / underwriter@demo.in / agent@demo.in / sme@demo.in (password ${DEMO_PASSWORD})`);
  return { org, admin, uw };
}
