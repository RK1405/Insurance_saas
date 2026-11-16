// Default configuration for new organisations and starter products.
// All rates are illustrative starting points – every insurer re-configures them in the Product Configurator.

export const CONDITIONS = [
  { code: 'diabetes', label: 'Diabetes' },
  { code: 'hypertension', label: 'Hypertension (high BP)' },
  { code: 'thyroid', label: 'Thyroid disorder' },
  { code: 'asthma', label: 'Asthma / COPD' },
  { code: 'heart_disease', label: 'Heart disease' },
  { code: 'cancer', label: 'Cancer (any history)' },
  { code: 'kidney_disease', label: 'Kidney disease' },
  { code: 'liver_disease', label: 'Liver disease' },
  { code: 'stroke', label: 'Stroke / paralysis' },
  { code: 'mental_illness', label: 'Mental illness' },
  { code: 'hiv', label: 'HIV / AIDS' },
];

export const RELATIONS = ['self', 'spouse', 'son', 'daughter', 'father', 'mother', 'father_in_law', 'mother_in_law'];

export const INDUSTRIES = {
  it_services: 'IT / software services',
  financial_services: 'Banking & financial services',
  manufacturing: 'Manufacturing',
  retail: 'Retail & e-commerce',
  healthcare: 'Healthcare',
  education: 'Education',
  construction: 'Construction & real estate',
  logistics: 'Logistics & transport',
  hospitality: 'Hospitality',
  other: 'Other',
};

export function defaultSettings() {
  return {
    // GST on health insurance in India: individual/family retail policies are exempt from 22-Sep-2025;
    // group (employer) health policies remain at 18%. Kept configurable in case rates change again.
    gst: { retail: 0, sme: 18 },
    underwriting: {
      bmi: { min: 18, max: 30, loadUpTo: 35, loadingPct: 10 },
      smokerLoadingPct: 10,
      referAboveAge: 60,
      autoApproveMaxSumInsured: 5000000,
      maxAutoLoadingPct: 50,
      hospitalisedLast3YearsAction: 'refer',
      conditions: {
        diabetes: { action: 'load', loadingPct: 25, ped: true },
        hypertension: { action: 'load', loadingPct: 15, ped: true },
        thyroid: { action: 'accept', ped: true },
        asthma: { action: 'load', loadingPct: 10, ped: true },
        heart_disease: { action: 'refer' },
        cancer: { action: 'refer' },
        kidney_disease: { action: 'refer' },
        liver_disease: { action: 'refer' },
        stroke: { action: 'refer' },
        mental_illness: { action: 'accept', ped: true },
        hiv: { action: 'refer' },
      },
      sme: { referBelowLives: 10, avgAgeLoadingAbove: 40, avgAgeLoadingPct: 10, maxParentsSharePct: 40 },
    },
    workflow: {
      quoteValidityDays: 30,
      agentsCanIssue: true,
      requirePaymentReference: true,
    },
  };
}

export function defaultRetailConfig() {
  return {
    description: 'Comprehensive individual & family floater health plan with cashless hospitalisation.',
    coverTypes: ['individual', 'floater'],
    sumInsuredOptions: [300000, 500000, 1000000, 1500000, 2500000, 5000000, 10000000],
    minEntryAge: 0,
    maxEntryAge: 99,
    maxMembers: 6,
    // Annual premium in ₹ per ₹1 lakh sum insured, by age band
    ageBands: [
      { min: 0, max: 17, rate: 450 },
      { min: 18, max: 25, rate: 600 },
      { min: 26, max: 35, rate: 750 },
      { min: 36, max: 45, rate: 1050 },
      { min: 46, max: 50, rate: 1450 },
      { min: 51, max: 55, rate: 1900 },
      { min: 56, max: 60, rate: 2500 },
      { min: 61, max: 65, rate: 3300 },
      { min: 66, max: 70, rate: 4200 },
      { min: 71, max: 75, rate: 5300 },
      { min: 76, max: 120, rate: 6600 },
    ],
    // Higher sum insured is cheaper per lakh
    siDiscounts: [
      { minSumInsured: 1000000, pct: 15 },
      { minSumInsured: 2500000, pct: 30 },
      { minSumInsured: 5000000, pct: 45 },
      { minSumInsured: 10000000, pct: 55 },
    ],
    cityTierFactors: { 1: 1.15, 2: 1.0, 3: 0.9 },
    floaterDiscountPct: { 2: 20, 3: 28, 4: 33, 5: 37, 6: 40 },
    copayOptions: [
      { pct: 0, discountPct: 0 },
      { pct: 10, discountPct: 8 },
      { pct: 20, discountPct: 15 },
    ],
    riders: [
      { code: 'OPD', name: 'OPD & consultations', ratePct: 12 },
      { code: 'MAT', name: 'Maternity & newborn', ratePct: 15 },
      { code: 'CI', name: 'Critical illness lump sum', ratePct: 10 },
      { code: 'RRW', name: 'Room-rent limit waiver', ratePct: 5 },
    ],
    benefits: {
      roomRent: 'Single private AC room',
      prePostHospitalisationDays: '60 / 180',
      dayCare: 'All day-care procedures',
      restoreBenefit: true,
      noClaimBonusPct: 10,
      ayushCovered: true,
      domiciliary: true,
    },
    waitingPeriods: { initialDays: 30, pedMonths: 36, specificDiseaseMonths: 24, maternityMonths: 24 },
    freeLookDays: 30,
    gracePeriodDays: 30,
    moratoriumMonths: 60,
  };
}

export function defaultSmeConfig() {
  return {
    description: 'Group health cover for small & medium businesses (7+ lives) with employee, spouse, children and parents.',
    minLives: 7,
    maxLives: 5000,
    sumInsuredOptions: [100000, 200000, 300000, 500000, 1000000],
    ageBands: [
      { min: 0, max: 17, rate: 380 },
      { min: 18, max: 35, rate: 520 },
      { min: 36, max: 45, rate: 760 },
      { min: 46, max: 55, rate: 1150 },
      { min: 56, max: 65, rate: 1800 },
      { min: 66, max: 120, rate: 2800 },
    ],
    cityTierFactors: { 1: 1.1, 2: 1.0, 3: 0.92 },
    industryFactors: {
      it_services: 0.95, financial_services: 0.95, education: 0.95, retail: 1.0, healthcare: 1.05,
      hospitality: 1.05, manufacturing: 1.1, logistics: 1.15, construction: 1.2, other: 1.0,
    },
    groupSizeDiscounts: [
      { minLives: 25, pct: 5 },
      { minLives: 100, pct: 10 },
      { minLives: 500, pct: 15 },
    ],
    options: [
      { code: 'MAT', name: 'Maternity benefit (₹50,000)', ratePct: 8 },
      { code: 'WWP', name: 'Waive all waiting periods (day-1 cover)', ratePct: 10 },
      { code: 'PED', name: 'Pre-existing diseases covered from day 1', ratePct: 7 },
    ],
    parentsCopayPct: 20,
    benefits: {
      roomRent: '1% of sum insured (normal), 2% (ICU)',
      prePostHospitalisationDays: '30 / 60',
      dayCare: 'All day-care procedures',
      ayushCovered: true,
    },
    waitingPeriods: { initialDays: 30, pedMonths: 36, specificDiseaseMonths: 24, maternityMonths: 9 },
    freeLookDays: 30,
    gracePeriodDays: 30,
    moratoriumMonths: 60,
  };
}
