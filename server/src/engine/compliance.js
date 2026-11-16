// Regulatory compliance checks run before a product can be published.
// Rule pack: India / IRDAI health insurance norms (Master Circular on Health Insurance Business, May 2024,
// and GST changes of Sep 2025). Always verify against the latest IRDAI circulars before going live.

export const RULE_PACK = 'IN-IRDAI-HEALTH-2025';

const checks = [
  {
    id: 'FREE_LOOK',
    title: 'Free-look period of at least 30 days',
    test: (c) => c.freeLookDays >= 30,
    detail: (c) => `Configured: ${c.freeLookDays} days`,
  },
  {
    id: 'GRACE',
    title: 'Grace period of at least 30 days for annual premium',
    test: (c) => c.gracePeriodDays >= 30,
    detail: (c) => `Configured: ${c.gracePeriodDays} days`,
  },
  {
    id: 'PED_WAIT',
    title: 'Pre-existing disease waiting period not more than 36 months',
    test: (c) => c.waitingPeriods?.pedMonths <= 36,
    detail: (c) => `Configured: ${c.waitingPeriods?.pedMonths} months`,
  },
  {
    id: 'SPECIFIC_WAIT',
    title: 'Specific-disease waiting period not more than 36 months',
    test: (c) => c.waitingPeriods?.specificDiseaseMonths <= 36,
    detail: (c) => `Configured: ${c.waitingPeriods?.specificDiseaseMonths} months`,
  },
  {
    id: 'INITIAL_WAIT',
    title: 'Initial waiting period not more than 30 days (accidents covered from day 1)',
    test: (c) => c.waitingPeriods?.initialDays <= 30,
    detail: (c) => `Configured: ${c.waitingPeriods?.initialDays} days`,
  },
  {
    id: 'MORATORIUM',
    title: 'Moratorium period not more than 60 months',
    test: (c) => c.moratoriumMonths <= 60,
    detail: (c) => `Configured: ${c.moratoriumMonths} months`,
  },
  {
    id: 'AYUSH',
    title: 'AYUSH treatment covered up to sum insured',
    test: (c) => c.benefits?.ayushCovered === true,
    detail: (c) => (c.benefits?.ayushCovered ? 'Covered' : 'Not covered'),
  },
  {
    id: 'RATES',
    title: 'Age bands are contiguous and every rate is positive',
    test: (c) => {
      const bands = [...(c.ageBands || [])].sort((a, b) => a.min - b.min);
      if (!bands.length || bands[0].min > (c.minEntryAge ?? 0)) return false;
      for (let i = 0; i < bands.length; i += 1) {
        if (!(bands[i].rate > 0) || bands[i].max < bands[i].min) return false;
        if (i > 0 && bands[i].min !== bands[i - 1].max + 1) return false;
      }
      return true;
    },
    detail: (c) => `${(c.ageBands || []).length} age bands`,
  },
  {
    id: 'SI_OPTIONS',
    title: 'At least one sum insured option',
    test: (c) => Array.isArray(c.sumInsuredOptions) && c.sumInsuredOptions.length > 0 && c.sumInsuredOptions.every((s) => s > 0),
    detail: (c) => `${(c.sumInsuredOptions || []).length} options`,
  },
];

const warnings = [
  {
    id: 'SENIOR_ACCESS',
    title: 'Insurers must offer products to all age groups (no blanket 65+ cut-off)',
    applies: (c, line) => line === 'retail',
    test: (c) => c.maxEntryAge >= 65,
    detail: (c) => `Max entry age ${c.maxEntryAge}`,
  },
  {
    id: 'SME_MIN_LIVES',
    title: 'Group policies should cover a genuine group (7+ lives recommended)',
    applies: (c, line) => line === 'sme',
    test: (c) => c.minLives >= 7,
    detail: (c) => `Minimum lives ${c.minLives}`,
  },
];

export function checkCompliance(config, line) {
  const results = checks.map((ch) => ({ id: ch.id, title: ch.title, severity: 'error', passed: !!safe(() => ch.test(config)), detail: safe(() => ch.detail(config)) }));
  for (const w of warnings) {
    if (!w.applies(config, line)) continue;
    results.push({ id: w.id, title: w.title, severity: 'warning', passed: !!safe(() => w.test(config)), detail: safe(() => w.detail(config)) });
  }
  return {
    rulePack: RULE_PACK,
    passed: results.every((r) => r.passed || r.severity !== 'error'),
    checks: results,
    checkedAt: new Date().toISOString(),
  };
}

function safe(fn) {
  try { return fn(); } catch { return false; }
}
