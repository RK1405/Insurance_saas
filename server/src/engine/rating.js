// Premium rating engines for retail (individual & family) and SME group health.
// Pure functions: no database access, so they are easy to test and reuse from the public API.

export class RatingError extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
  }
}

const round = (n) => Math.round(n);
const lakhs = (si) => si / 100000;

export function bandRate(ageBands, age) {
  const band = ageBands.find((b) => age >= b.min && age <= b.max);
  if (!band) throw new RatingError(`No rate configured for age ${age}`);
  return band.rate;
}

function pickTier(table, key, minField) {
  // tables like [{minSumInsured: 1000000, pct: 15}, ...] -> highest tier whose threshold is met
  return [...(table || [])]
    .sort((a, b) => b[minField] - a[minField])
    .find((t) => key >= t[minField]);
}

/**
 * Retail rating.
 * input: { coverType, sumInsured, cityTier, copayPct, riders: [code], members: [{name, relation, age, gender}] }
 * loadings: optional array of per-member loading percentages (from underwriting), same order as members.
 */
export function rateRetail(config, input, loadings = []) {
  const { coverType, sumInsured, cityTier, copayPct = 0, riders = [], members } = input;

  if (!config.coverTypes.includes(coverType)) throw new RatingError(`Cover type "${coverType}" is not offered on this product`);
  if (!config.sumInsuredOptions.includes(sumInsured)) throw new RatingError('Selected sum insured is not offered on this product');
  if (!members?.length) throw new RatingError('Add at least one member');
  if (members.length > config.maxMembers) throw new RatingError(`A maximum of ${config.maxMembers} members can be covered`);
  if (!members.some((m) => m.age >= 18)) throw new RatingError('At least one adult (18+) must be covered');
  for (const m of members) {
    if (m.age < config.minEntryAge || m.age > config.maxEntryAge) {
      throw new RatingError(`${m.name || 'Member'} (age ${m.age}) is outside entry age ${config.minEntryAge}–${config.maxEntryAge}`);
    }
  }

  const cityFactor = Number(config.cityTierFactors[String(cityTier)] ?? 1);
  const copay = (config.copayOptions || []).find((c) => c.pct === copayPct);
  if (!copay) throw new RatingError(`Co-pay of ${copayPct}% is not offered on this product`);
  const siDiscountPct = pickTier(config.siDiscounts, sumInsured, 'minSumInsured')?.pct || 0;

  const memberLines = members.map((m, i) => {
    const rate = bandRate(config.ageBands, m.age);
    const base = rate * lakhs(sumInsured);
    const afterSi = base * (1 - siDiscountPct / 100);
    const afterCity = afterSi * cityFactor;
    const afterCopay = afterCity * (1 - copay.discountPct / 100);
    const loadingPct = Number(loadings[i] || 0);
    const premium = afterCopay * (1 + loadingPct / 100);
    return { name: m.name, relation: m.relation, age: m.age, ratePerLakh: rate, base: round(base), loadingPct, premium: round(premium) };
  });

  const sumMembers = memberLines.reduce((s, m) => s + m.premium, 0);
  const floaterDiscountPct = coverType === 'floater' && members.length > 1
    ? Number(config.floaterDiscountPct[String(Math.min(members.length, 6))] || 0)
    : 0;
  const coverPremium = sumMembers * (1 - floaterDiscountPct / 100);

  const riderLines = riders.map((code) => {
    const r = (config.riders || []).find((x) => x.code === code);
    if (!r) throw new RatingError(`Rider ${code} is not available on this product`);
    return { code: r.code, name: r.name, ratePct: r.ratePct, premium: round(coverPremium * r.ratePct / 100) };
  });

  const net = round(coverPremium) + riderLines.reduce((s, r) => s + r.premium, 0);

  return {
    members: memberLines,
    factors: { cityTier, cityFactor, siDiscountPct, copayPct, copayDiscountPct: copay.discountPct, floaterDiscountPct },
    coverPremium: round(coverPremium),
    riders: riderLines,
    netPremium: net,
  };
}

/**
 * SME group rating.
 * input: { industry, cityTier, options: [code], categories: { A: {sumInsured}, ... },
 *          census: [{employeeId, name, relation, age, gender, category}] }
 */
export function rateSme(config, input, loadingPct = 0) {
  const { industry, cityTier, options = [], categories, census } = input;
  if (!census?.length) throw new RatingError('Upload the employee census');
  const lives = census.length;
  if (lives < config.minLives) throw new RatingError(`Minimum ${config.minLives} lives required for group cover (got ${lives})`);
  if (lives > config.maxLives) throw new RatingError(`Maximum ${config.maxLives} lives allowed on this product`);
  if (!categories || !Object.keys(categories).length) throw new RatingError('Define at least one employee category');
  for (const [cat, c] of Object.entries(categories)) {
    if (!config.sumInsuredOptions.includes(c.sumInsured)) throw new RatingError(`Category ${cat}: sum insured not offered`);
  }

  const cityFactor = Number(config.cityTierFactors[String(cityTier)] ?? 1);
  const industryFactor = Number(config.industryFactors[industry] ?? config.industryFactors.other ?? 1);

  const byCategory = {};
  let gross = 0;
  for (const [i, row] of census.entries()) {
    const cat = categories[row.category];
    if (!cat) throw new RatingError(`Census row ${i + 1}: unknown category "${row.category}"`);
    const rate = bandRate(config.ageBands, row.age);
    const p = rate * lakhs(cat.sumInsured) * cityFactor * industryFactor;
    gross += p;
    byCategory[row.category] ||= { category: row.category, sumInsured: cat.sumInsured, lives: 0, employees: 0, premium: 0 };
    byCategory[row.category].lives += 1;
    if (row.relation === 'self') byCategory[row.category].employees += 1;
    byCategory[row.category].premium += p;
  }

  const groupDiscountPct = pickTier(config.groupSizeDiscounts, lives, 'minLives')?.pct || 0;
  const afterDiscount = gross * (1 - groupDiscountPct / 100);
  const afterLoading = afterDiscount * (1 + loadingPct / 100);

  const optionLines = options.map((code) => {
    const o = (config.options || []).find((x) => x.code === code);
    if (!o) throw new RatingError(`Option ${code} is not available on this product`);
    return { code: o.code, name: o.name, ratePct: o.ratePct, premium: round(afterLoading * o.ratePct / 100) };
  });

  const ages = census.map((r) => r.age);
  const employees = census.filter((r) => r.relation === 'self').length;
  const parents = census.filter((r) => ['father', 'mother', 'father_in_law', 'mother_in_law'].includes(r.relation)).length;

  return {
    lives,
    employees,
    parents,
    averageAge: Math.round((ages.reduce((a, b) => a + b, 0) / lives) * 10) / 10,
    categories: Object.values(byCategory).map((c) => ({ ...c, premium: round(c.premium) })),
    factors: { cityTier, cityFactor, industry, industryFactor, groupDiscountPct, loadingPct },
    grossPremium: round(gross),
    options: optionLines,
    netPremium: round(afterLoading) + optionLines.reduce((s, o) => s + o.premium, 0),
  };
}

export function withGst(net, ratePct) {
  const gst = Math.round(net * ratePct) / 100;
  return { premium: net, gstRatePct: ratePct, gst, total: Math.round((net + gst) * 100) / 100 };
}
