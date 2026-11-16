// Digital health underwriting: turns a health declaration into an automatic decision.
// Outcomes: accept | accept_with_loading  (straight-through)  ·  refer (underwriter)  ·  decline
import { CONDITIONS } from './defaults.js';

const conditionLabel = (code) => CONDITIONS.find((c) => c.code === code)?.label || code;

export function bmiOf(d) {
  if (!d?.heightCm || !d?.weightKg) return null;
  const m = d.heightCm / 100;
  return Math.round((d.weightKg / (m * m)) * 10) / 10;
}

/**
 * members: [{ name, age, declaration: { heightCm, weightKg, smoker, conditions: [], hospitalisedLast3Years, onMedication } }]
 */
export function underwriteRetail(rules, members, sumInsured) {
  const reasons = [];
  let refer = false;
  let decline = false;

  if (sumInsured > rules.autoApproveMaxSumInsured) {
    refer = true;
    reasons.push(`Sum insured above auto-approval limit of ₹${rules.autoApproveMaxSumInsured.toLocaleString('en-IN')}`);
  }

  const memberResults = members.map((m) => {
    const d = m.declaration || {};
    const out = { name: m.name, age: m.age, bmi: bmiOf(d), loadingPct: 0, peds: [], reasons: [], decision: 'accept' };
    const flag = (kind, text) => {
      out.reasons.push(text);
      if (kind === 'refer') out.decision = out.decision === 'decline' ? 'decline' : 'refer';
      if (kind === 'decline') out.decision = 'decline';
    };

    if (m.age > rules.referAboveAge) flag('refer', `Age ${m.age} above ${rules.referAboveAge}: pre-policy medical check-up required`);

    if (out.bmi !== null) {
      const { min, max, loadUpTo, loadingPct } = rules.bmi;
      if (m.age >= 18) {
        if (out.bmi < min - 2 || out.bmi > loadUpTo) flag('refer', `BMI ${out.bmi} outside acceptable range`);
        else if (out.bmi > max) { out.loadingPct += loadingPct; out.reasons.push(`BMI ${out.bmi}: +${loadingPct}% loading`); }
      }
    } else if (m.age >= 18) {
      flag('refer', 'Height / weight not declared');
    }

    if (d.smoker) {
      out.loadingPct += rules.smokerLoadingPct;
      out.reasons.push(`Tobacco user: +${rules.smokerLoadingPct}% loading`);
    }

    for (const code of d.conditions || []) {
      const rule = rules.conditions[code] || { action: 'refer' };
      const label = conditionLabel(code);
      if (rule.ped) out.peds.push(label);
      if (rule.action === 'load') {
        out.loadingPct += rule.loadingPct || 0;
        out.reasons.push(`${label}: +${rule.loadingPct}% loading${rule.ped ? ', covered after PED waiting period' : ''}`);
      } else if (rule.action === 'accept') {
        out.reasons.push(`${label}: accepted${rule.ped ? ' with PED waiting period' : ''}`);
      } else if (rule.action === 'decline') {
        flag('decline', `${label}: not insurable under current rules`);
      } else {
        flag('refer', `${label}: underwriter review required`);
      }
    }

    if (d.hospitalisedLast3Years) {
      if (rules.hospitalisedLast3YearsAction === 'refer') flag('refer', 'Hospitalised in last 3 years: underwriter review');
      else out.reasons.push('Hospitalised in last 3 years: noted');
    }

    if (out.loadingPct > rules.maxAutoLoadingPct) flag('refer', `Total loading ${out.loadingPct}% exceeds auto limit of ${rules.maxAutoLoadingPct}%`);
    if (out.decision === 'accept' && out.loadingPct > 0) out.decision = 'accept_with_loading';
    if (out.decision === 'refer') refer = true;
    if (out.decision === 'decline') decline = true;
    return out;
  });

  let decision = 'accept';
  if (decline) decision = 'decline';
  else if (refer) decision = 'refer';
  else if (memberResults.some((m) => m.loadingPct > 0)) decision = 'accept_with_loading';

  return {
    decision,
    stp: decision === 'accept' || decision === 'accept_with_loading',
    reasons,
    members: memberResults,
    loadings: memberResults.map((m) => m.loadingPct),
    evaluatedAt: new Date().toISOString(),
  };
}

/** Group underwriting: based on group size, age profile and dependant mix. */
export function underwriteSme(rules, rating) {
  const r = rules.sme;
  const reasons = [];
  let decision = 'accept';
  let loadingPct = 0;

  if (rating.lives < r.referBelowLives) {
    decision = 'refer';
    reasons.push(`Small group (${rating.lives} lives < ${r.referBelowLives}): individual health declarations required`);
  }
  if (rating.averageAge > r.avgAgeLoadingAbove) {
    loadingPct += r.avgAgeLoadingPct;
    reasons.push(`Average age ${rating.averageAge} above ${r.avgAgeLoadingAbove}: +${r.avgAgeLoadingPct}% loading`);
  }
  const parentsShare = (rating.parents / rating.lives) * 100;
  if (parentsShare > r.maxParentsSharePct) {
    decision = 'refer';
    reasons.push(`Parents are ${Math.round(parentsShare)}% of lives (limit ${r.maxParentsSharePct}%): anti-selection review`);
  }
  if (rating.employees === 0) {
    decision = 'decline';
    reasons.push('Census contains no employees (relation "self")');
  }
  if (decision === 'accept' && loadingPct > 0) decision = 'accept_with_loading';

  return {
    decision,
    stp: decision === 'accept' || decision === 'accept_with_loading',
    loadingPct,
    reasons,
    evaluatedAt: new Date().toISOString(),
  };
}
