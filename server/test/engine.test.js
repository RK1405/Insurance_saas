import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCompliance } from '../src/engine/compliance.js';
import { defaultRetailConfig, defaultSettings, defaultSmeConfig } from '../src/engine/defaults.js';
import { rateRetail, rateSme, withGst } from '../src/engine/rating.js';
import { bmiOf, underwriteRetail, underwriteSme } from '../src/engine/underwriting.js';

const cfg = defaultRetailConfig();
const rules = defaultSettings().underwriting;
const decl = (h, w, extra = {}) => ({ heightCm: h, weightKg: w, smoker: false, conditions: [], hospitalisedLast3Years: false, ...extra });

test('retail: single adult, no discounts', () => {
  const r = rateRetail(cfg, { coverType: 'individual', sumInsured: 500000, cityTier: 2, copayPct: 0, members: [{ name: 'A', relation: 'self', age: 30 }] });
  assert.equal(r.members[0].premium, 750 * 5); // ₹750/lakh × 5 lakh, tier 2 factor 1.0
  assert.equal(r.netPremium, 3750);
});

test('retail: floater discount, city factor, SI discount, co-pay and rider stack correctly', () => {
  const input = {
    coverType: 'floater', sumInsured: 1000000, cityTier: 1, copayPct: 10, riders: ['OPD'],
    members: [{ name: 'A', relation: 'self', age: 30 }, { name: 'B', relation: 'spouse', age: 30 }],
  };
  const r = rateRetail(cfg, input);
  const perMember = 750 * 10 * 0.85 * 1.15 * 0.92; // SI 15% off, tier-1 1.15, co-pay 8% off
  assert.equal(r.members[0].premium, Math.round(perMember));
  assert.equal(r.factors.floaterDiscountPct, 20);
  const cover = Math.round(Math.round(perMember) * 2 * 0.8);
  assert.equal(r.coverPremium, cover);
  assert.equal(r.netPremium, cover + Math.round(cover * 0.12));
});

test('retail: underwriting loadings are applied per member', () => {
  const r = rateRetail(cfg, { coverType: 'individual', sumInsured: 500000, cityTier: 2, members: [{ name: 'A', relation: 'self', age: 30 }] }, [25]);
  assert.equal(r.members[0].premium, Math.round(3750 * 1.25));
});

test('retail: rejects invalid inputs', () => {
  const base = { coverType: 'floater', sumInsured: 500000, cityTier: 1, members: [{ name: 'A', relation: 'self', age: 30 }] };
  assert.throws(() => rateRetail(cfg, { ...base, sumInsured: 123 }), /sum insured/);
  assert.throws(() => rateRetail(cfg, { ...base, members: [{ name: 'Kid', relation: 'son', age: 8 }] }), /adult/);
  assert.throws(() => rateRetail(cfg, { ...base, copayPct: 35 }), /Co-pay/);
  assert.throws(() => rateRetail(cfg, { ...base, riders: ['NOPE'] }), /Rider/);
});

test('underwriting: healthy applicant is straight-through', () => {
  const uw = underwriteRetail(rules, [{ name: 'A', age: 30, declaration: decl(175, 70) }], 500000);
  assert.equal(uw.decision, 'accept');
  assert.equal(uw.stp, true);
  assert.equal(bmiOf(decl(175, 70)), 22.9);
});

test('underwriting: diabetes + smoker + BMI 31 loads but stays STP', () => {
  const uw = underwriteRetail(rules, [{ name: 'A', age: 45, declaration: decl(170, 90, { smoker: true, conditions: ['diabetes'] }) }], 500000);
  assert.equal(uw.decision, 'accept_with_loading');
  assert.equal(uw.loadings[0], 10 + 10 + 25); // BMI 31.1 + tobacco + diabetes
  assert.deepEqual(uw.members[0].peds, ['Diabetes']);
});

test('underwriting: heart disease, high age, large SI and missing height refer', () => {
  assert.equal(underwriteRetail(rules, [{ name: 'A', age: 40, declaration: decl(170, 70, { conditions: ['heart_disease'] }) }], 500000).decision, 'refer');
  assert.equal(underwriteRetail(rules, [{ name: 'A', age: 66, declaration: decl(170, 70) }], 500000).decision, 'refer');
  assert.equal(underwriteRetail(rules, [{ name: 'A', age: 30, declaration: decl(170, 70) }], 10000000).decision, 'refer');
  assert.equal(underwriteRetail(rules, [{ name: 'A', age: 30, declaration: {} }], 500000).decision, 'refer');
  // children do not need height/weight
  assert.equal(underwriteRetail(rules, [{ name: 'Kid', age: 5, declaration: {} }], 500000).decision, 'accept');
});

test('underwriting: configurable decline rule wins over refer', () => {
  const custom = { ...rules, conditions: { ...rules.conditions, cancer: { action: 'decline' } } };
  const uw = underwriteRetail(custom, [{ name: 'A', age: 40, declaration: decl(170, 70, { conditions: ['cancer', 'heart_disease'] }) }], 500000);
  assert.equal(uw.decision, 'decline');
});

const census = (n, extra = []) => [
  ...Array.from({ length: n }, (_, i) => ({ employeeId: `E${i}`, name: `E${i}`, relation: 'self', age: 30, gender: 'male', category: 'A' })),
  ...extra,
];

test('sme: rating by category, industry and group discount', () => {
  const smeCfg = defaultSmeConfig();
  const r = rateSme(smeCfg, { industry: 'manufacturing', cityTier: 2, categories: { A: { sumInsured: 300000 } }, census: census(30) });
  const per = 520 * 3 * 1.0 * 1.1;
  assert.equal(r.grossPremium, Math.round(per * 30));
  assert.equal(r.factors.groupDiscountPct, 5);
  assert.equal(r.netPremium, Math.round(per * 30 * 0.95));
  assert.throws(() => rateSme(smeCfg, { industry: 'other', cityTier: 1, categories: { A: { sumInsured: 300000 } }, census: census(3) }), /Minimum 7 lives/);
});

test('sme: underwriting refers small groups and parent-heavy groups', () => {
  const smeCfg = defaultSmeConfig();
  const small = rateSme(smeCfg, { industry: 'other', cityTier: 1, categories: { A: { sumInsured: 300000 } }, census: census(8) });
  assert.equal(underwriteSme(rules, small).decision, 'refer');
  const parents = census(10, Array.from({ length: 10 }, (_, i) => ({ employeeId: `E${i}`, name: 'P', relation: 'mother', age: 60, gender: 'female', category: 'A' })));
  const heavy = rateSme(smeCfg, { industry: 'other', cityTier: 1, categories: { A: { sumInsured: 300000 } }, census: parents });
  const uw = underwriteSme(rules, heavy);
  assert.equal(uw.decision, 'refer');
  assert.ok(uw.loadingPct > 0, 'older group gets an age loading');
});

test('gst: retail exempt, group at 18%', () => {
  assert.deepEqual(withGst(10000, 0), { premium: 10000, gstRatePct: 0, gst: 0, total: 10000 });
  assert.equal(withGst(10000, 18).total, 11800);
});

test('compliance: defaults pass; violations are caught', () => {
  assert.equal(checkCompliance(defaultRetailConfig(), 'retail').passed, true);
  assert.equal(checkCompliance(defaultSmeConfig(), 'sme').passed, true);
  const bad = { ...defaultRetailConfig(), freeLookDays: 15, waitingPeriods: { initialDays: 30, pedMonths: 48, specificDiseaseMonths: 24 }, maxEntryAge: 60 };
  const res = checkCompliance(bad, 'retail');
  assert.equal(res.passed, false);
  const failed = res.checks.filter((c) => !c.passed).map((c) => c.id).sort();
  assert.deepEqual(failed, ['FREE_LOOK', 'PED_WAIT', 'SENIOR_ACCESS']);
  const gap = { ...defaultRetailConfig(), ageBands: [{ min: 0, max: 17, rate: 100 }, { min: 20, max: 120, rate: 200 }] };
  assert.equal(checkCompliance(gap, 'retail').checks.find((c) => c.id === 'RATES').passed, false);
});
