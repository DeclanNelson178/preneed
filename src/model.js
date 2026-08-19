/**
 * The whole model. Section 2 of plan.md.
 *
 * Massachusetts cost-protected pre-need funeral contract.
 * Funeral establishment charges only. Trust paid in full, or insurance paid
 * in full or over 3, 5 or 10 years.
 *
 * This file holds no DOM code and no defaults. It imports unchanged into the
 * browser and into `node --test`. Starting values live in `src/inputs.js`.
 *
 * Symbols, as in plan.md section 2:
 *   P  price            i  inflation        net trust net return
 *   Tb business tax rate
 *   n  payments         Q  annual premium   g  policy growth rate
 *   w  waiting years    c1 first-year commission   c2 renewal commission
 *   t  year of death
 */

/** Years of death the model reports, 1 to HORIZON. */
export const HORIZON = 30;

/** The four early-death benefit shapes. One setting. Mutually exclusive. */
export const BENEFIT_MODES = [
  'fullFace',
  'percentOfFace',
  'returnOfPremium',
  'faceLessUnpaid',
];

/** The pay plans in scope. */
export const PAY_PLANS = [1, 3, 5, 10];

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Coerce a raw input object into numbers. It does not supply starting values.
 * A missing field becomes 0, false, or an empty list.
 */
export function normalize(raw = {}) {
  const trust = raw.trust || {};
  const ins = raw.insurance || {};
  return {
    price: num(raw.price),
    inflation: num(raw.inflation),
    deliveryPercent: raw.deliveryPercent === undefined ? 1 : num(raw.deliveryPercent),
    trust: {
      netReturn: num(trust.netReturn),
    },
    insurance: {
      businessTaxRate: num(ins.businessTaxRate),
      payments: Math.max(1, Math.round(num(ins.payments, 1))),
      annualPremium: num(ins.annualPremium),
      growthRate: num(ins.growthRate),
      growthStartsAtPaidUp: Boolean(ins.growthStartsAtPaidUp),
      benefitMode: BENEFIT_MODES.includes(ins.benefitMode) ? ins.benefitMode : 'fullFace',
      waitingYears: Math.max(0, Math.round(num(ins.waitingYears))),
      waitingSchedule: Array.isArray(ins.waitingSchedule)
        ? ins.waitingSchedule.map((p) => num(p))
        : [],
      ropInterest: num(ins.ropInterest),
      firstYearCommission: num(ins.firstYearCommission),
      renewalCommission: num(ins.renewalCommission),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2.2 The trust                                                       */
/* ------------------------------------------------------------------ */

/**
 * The trust uses one rate: how fast the account balance itself grows.
 *
 * The model asks for the net rate directly and does not build it from a gross
 * return, a fee and a tax rate. A tax rate needs a base, and the two obvious
 * bases disagree: tax divided by income earned and tax divided by total return
 * give the same answer for a bond account and differ by about three times for
 * an equity account. The balance has no such ambiguity. It is also what the
 * funeral establishment receives under 239 CMR 4.09(2), and the trustee can
 * read it off a statement.
 */
export function netTrustRate(inputs) {
  return inputs.trust.netReturn;
}

/** funds(t) = P * (1 + net)^t */
export function trustFunds(t, inputs) {
  return inputs.price * Math.pow(1 + netTrustRate(inputs), t);
}

/* ------------------------------------------------------------------ */
/* 2.1 The bill                                                        */
/* ------------------------------------------------------------------ */

/**
 * cost(t) = P * (1 + i)^t * deliveryPercent
 *
 * deliveryPercent of 1 gives the funding gap view: does the money cover the
 * bill? A lower value gives the profit view: what do you keep?
 */
export function funeralCost(t, inputs) {
  return inputs.price * Math.pow(1 + inputs.inflation, t) * inputs.deliveryPercent;
}

/* ------------------------------------------------------------------ */
/* 2.3 The insurance policy                                            */
/* ------------------------------------------------------------------ */

/** premiumsPaid(t) = Q * min(t, n) */
export function premiumsPaid(t, inputs) {
  const { annualPremium, payments } = inputs.insurance;
  return annualPremium * Math.min(t, payments);
}

/** unpaid(t) = Q * max(0, n - t) */
export function unpaidPremiums(t, inputs) {
  const { annualPremium, payments } = inputs.insurance;
  return annualPremium * Math.max(0, payments - t);
}

/** growthYears(t) = growthStartsAtPaidUp ? max(0, t - n) : t */
export function growthYears(t, inputs) {
  const { payments, growthStartsAtPaidUp } = inputs.insurance;
  return growthStartsAtPaidUp ? Math.max(0, t - payments) : t;
}

/** grownFace(t) = P * (1 + g)^growthYears(t) */
export function grownFace(t, inputs) {
  const { growthRate } = inputs.insurance;
  return inputs.price * Math.pow(1 + growthRate, growthYears(t, inputs));
}

/**
 * The percent of face the policy pays in year t of the waiting period.
 * The schedule lists year 1 first. A year past the end of the schedule holds
 * the last listed percent. An empty schedule pays nothing.
 */
export function waitingPercent(t, inputs) {
  const schedule = inputs.insurance.waitingSchedule;
  if (schedule.length === 0) return 0;
  const index = Math.min(Math.max(t, 1), schedule.length) - 1;
  return schedule[index];
}

/**
 * The death benefit in year t. One setting, four modes.
 * The modes are mutually exclusive, so early death is never penalised twice.
 *
 * The result is held at or above zero. A policy does not pay a negative amount.
 */
export function deathBenefit(t, inputs) {
  const ins = inputs.insurance;
  const face = grownFace(t, inputs);
  let benefit;

  switch (ins.benefitMode) {
    case 'percentOfFace':
      benefit = t <= ins.waitingYears ? inputs.price * waitingPercent(t, inputs) : face;
      break;
    case 'returnOfPremium':
      // The plan applies the interest once. It is not compounded.
      benefit = t <= ins.waitingYears
        ? premiumsPaid(t, inputs) * (1 + ins.ropInterest)
        : face;
      break;
    case 'faceLessUnpaid':
      // No branch is necessary: unpaid(t) is already zero after the policy is paid up.
      benefit = face - unpaidPremiums(t, inputs);
      break;
    case 'fullFace':
    default:
      benefit = face;
      break;
  }

  return Math.max(0, benefit);
}

/**
 * Commission is paid on each premium as it arrives, taxed as business income
 * in the year of receipt, then compounded at the net trust rate.
 *
 *   payment(1)   = c1 * Q * (1 - Tb)
 *   payment(k>1) = c2 * Q * (1 - Tb)   for k = 2 .. n
 *   fund(t)      = sum over k = 1 .. min(t, n) of payment(k) * (1 + net)^(t - k)
 *
 * Set c1 = c2 for an as-earned schedule. Set c1 high and c2 low for a heaped
 * schedule. There is no special case in the code.
 */
export function commissionPayment(k, inputs) {
  const ins = inputs.insurance;
  if (k < 1 || k > ins.payments) return 0;
  const rate = k === 1 ? ins.firstYearCommission : ins.renewalCommission;
  return rate * ins.annualPremium * (1 - ins.businessTaxRate);
}

export function commissionFund(t, inputs) {
  const net = netTrustRate(inputs);
  const last = Math.min(t, inputs.insurance.payments);
  let fund = 0;
  for (let k = 1; k <= last; k += 1) {
    fund += commissionPayment(k, inputs) * Math.pow(1 + net, t - k);
  }
  return fund;
}

/* ------------------------------------------------------------------ */
/* 2.4 The result                                                      */
/* ------------------------------------------------------------------ */

/**
 * The honest comparison against funeral inflation.
 * Both options use P as the base, because P is what you guaranteed.
 */
export function effectiveAnnualRate(total, price, t) {
  if (!(price > 0) || t < 1) return NaN;
  return Math.pow(total / price, 1 / t) - 1;
}

/** One row of the result table: year t. */
export function projectYear(t, inputs) {
  const cost = funeralCost(t, inputs);

  const trustFundsAtDeath = trustFunds(t, inputs);
  // 239 CMR 4.08. A trust sale pays no commission. This is the regulation.
  const trustCommission = 0;
  const trustTotal = trustFundsAtDeath + trustCommission;

  const benefit = deathBenefit(t, inputs);
  const insuranceCommission = commissionFund(t, inputs);
  const insuranceTotal = benefit + insuranceCommission;

  return {
    year: t,
    cost,
    trust: {
      funds: trustFundsAtDeath,
      commission: trustCommission,
      total: trustTotal,
      // 239 CMR 4.08(6)(a) lets you keep a positive margin.
      // 4.08(6)(b) makes you bear a negative one. You may not bill the estate.
      margin: trustTotal - cost,
      effectiveRate: effectiveAnnualRate(trustTotal, inputs.price, t),
    },
    insurance: {
      funds: benefit,
      commission: insuranceCommission,
      total: insuranceTotal,
      margin: insuranceTotal - cost,
      effectiveRate: effectiveAnnualRate(insuranceTotal, inputs.price, t),
      grownFace: grownFace(t, inputs),
      premiumsPaid: premiumsPaid(t, inputs),
      unpaid: unpaidPremiums(t, inputs),
    },
  };
}

/** The whole table, year 1 to the horizon, plus what the dashboard reads off it. */
export function project(raw, horizon = HORIZON) {
  const inputs = normalize(raw);
  const rows = [];
  for (let t = 1; t <= horizon; t += 1) rows.push(projectYear(t, inputs));

  return {
    inputs,
    horizon,
    netTrustRate: netTrustRate(inputs),
    rows,
    summary: summarise(rows),
    warnings: warnings(inputs),
  };
}

const firstYearWhere = (rows, test) => {
  const row = rows.find(test);
  return row ? row.year : null;
};

export function summarise(rows) {
  const lastRow = rows[rows.length - 1];
  return {
    trustFirstLossYear: firstYearWhere(rows, (r) => r.trust.margin < 0),
    insuranceFirstLossYear: firstYearWhere(rows, (r) => r.insurance.margin < 0),
    trustLossYears: rows.filter((r) => r.trust.margin < 0).length,
    insuranceLossYears: rows.filter((r) => r.insurance.margin < 0).length,
    // The year the better option changes hands, if it changes at all.
    leadChanges: leadChanges(rows),
    leaderAtStart: leaderOf(rows[0]),
    leaderAtEnd: leaderOf(lastRow),
  };
}

const leaderOf = (row) => {
  if (!row) return null;
  if (row.insurance.total > row.trust.total) return 'insurance';
  if (row.trust.total > row.insurance.total) return 'trust';
  return 'level';
};

function leadChanges(rows) {
  const changes = [];
  for (let k = 1; k < rows.length; k += 1) {
    const before = leaderOf(rows[k - 1]);
    const now = leaderOf(rows[k]);
    if (before !== now && now !== 'level') changes.push({ year: rows[k].year, leader: now });
  }
  return changes;
}

/**
 * Statements the dashboard must show, because the inputs make them true.
 * These are not errors. They tell you what you have assumed.
 */
export function warnings(inputs) {
  const out = [];
  const ins = inputs.insurance;

  if (ins.benefitMode === 'faceLessUnpaid') {
    out.push(
      'The "full amount, less unpaid premiums" shape is not confirmed. No carrier '
      + 'document shows it. Get written confirmation before you use this result.',
    );
  }
  if (ins.payments > 1 && ins.annualPremium * ins.payments <= inputs.price) {
    out.push(
      'The premiums total no more than the face amount. On a multi-pay plan they '
      + 'usually total more. Check the annual premium on the carrier illustration.',
    );
  }
  if (ins.benefitMode === 'percentOfFace' && ins.waitingSchedule.length < ins.waitingYears) {
    out.push(
      'The waiting-period schedule is shorter than the waiting period. '
      + 'The last percent listed applies to the remaining years.',
    );
  }
  if (inputs.trust.netReturn >= inputs.inflation) {
    out.push(
      'The trust net return is at or above funeral inflation, so the trust covers '
      + 'the bill in every year. Confirm that the rate is net of fees and net of '
      + 'tax, and that it is a rate the trustee actually earned.',
    );
  }
  return out;
}
