import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BENEFIT_MODES,
  commissionFund,
  commissionPayment,
  deathBenefit,
  effectiveAnnualRate,
  funeralCost,
  grownFace,
  growthYears,
  netTrustRate,
  normalize,
  premiumsPaid,
  project,
  projectYear,

  trustFunds,
  unpaidPremiums,
} from '../src/model.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const near = (actual, expected, tolerance = 1e-9, message = '') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} expected ${expected}, got ${actual}`,
  );
};

/** A complete input set. Each test changes only what it is about. */
const base = (overrides = {}) => normalize({
  price: 10000,
  inflation: 0.04,
  deliveryPercent: 1,
  trust: { netReturn: 0.043 },
  insurance: {
    businessTaxRate: 0.3,
    payments: 1,
    annualPremium: 10000,
    growthRate: 0.02,
    growthStartsAtPaidUp: false,
    benefitMode: 'fullFace',
    waitingYears: 2,
    waitingSchedule: [0.4, 0.7],
    ropInterest: 0.07,
    firstYearCommission: 0.12,
    renewalCommission: 0.03,
  },
  ...overrides,
});

const withInsurance = (patch) => {
  const inputs = base();
  Object.assign(inputs.insurance, patch);
  return inputs;
};

const withTrust = (patch) => {
  const inputs = base();
  Object.assign(inputs.trust, patch);
  return inputs;
};

/* ------------------------------------------------------------------ */
/* The trust                                                           */
/* ------------------------------------------------------------------ */

test('the trust uses the entered net rate, with nothing subtracted from it', () => {
  // Fees and tax are already inside the number the user gives. The model must
  // not take them off a second time.
  near(netTrustRate(withTrust({ netReturn: 0.043 })), 0.043);
  near(netTrustRate(withTrust({ netReturn: 0 })), 0);
  near(netTrustRate(withTrust({ netReturn: -0.02 })), -0.02);
});

test('the balance compounds each year, it is not simple interest', () => {
  const inputs = withTrust({ netReturn: 0.043 });
  for (let t = 1; t <= 30; t += 1) {
    near(trustFunds(t, inputs), trustFunds(t - 1, inputs) * 1.043, 1e-7, `year ${t}:`);
  }
  const simple = 10000 * (1 + 30 * 0.043);
  assert.ok(trustFunds(30, inputs) > simple + 1000, 'year 30 must beat simple interest');
});

test('a zero net return holds the balance flat', () => {
  const inputs = withTrust({ netReturn: 0 });
  for (let t = 1; t <= 30; t += 1) near(trustFunds(t, inputs), 10000, 1e-9, `year ${t}:`);
});

/* ------------------------------------------------------------------ */
/* The bill                                                            */
/* ------------------------------------------------------------------ */

test('the cost of the funeral compounds at the inflation rate', () => {
  const inputs = base();
  near(funeralCost(1, inputs), 10400);
  near(funeralCost(2, inputs), 10816, 1e-9);
  near(funeralCost(10, inputs), 10000 * 1.04 ** 10, 1e-9);
});

test('the cost to deliver scales the whole bill', () => {
  const full = base();
  const sixty = base();
  sixty.deliveryPercent = 0.6;
  for (let t = 1; t <= 30; t += 1) {
    near(funeralCost(t, sixty), funeralCost(t, full) * 0.6, 1e-9, `year ${t}:`);
  }
});

/* ------------------------------------------------------------------ */
/* Premiums and growth                                                 */
/* ------------------------------------------------------------------ */

test('premiums stop at the end of the pay period', () => {
  const inputs = withInsurance({ payments: 5, annualPremium: 2200 });
  assert.equal(premiumsPaid(1, inputs), 2200);
  assert.equal(premiumsPaid(5, inputs), 11000);
  assert.equal(premiumsPaid(20, inputs), 11000);
  assert.equal(unpaidPremiums(1, inputs), 8800);
  assert.equal(unpaidPremiums(5, inputs), 0);
  assert.equal(unpaidPremiums(20, inputs), 0);
});

test('growth runs from year one when it is not held to paid-up', () => {
  const inputs = withInsurance({ payments: 10, growthStartsAtPaidUp: false });
  for (let t = 1; t <= 30; t += 1) assert.equal(growthYears(t, inputs), t);
});

test('a 10-pay policy shows no growth before year 10 when growth waits for paid-up', () => {
  const inputs = withInsurance({
    payments: 10,
    annualPremium: 1200,
    growthStartsAtPaidUp: true,
  });
  for (let t = 1; t <= 10; t += 1) {
    assert.equal(growthYears(t, inputs), 0, `year ${t} should have no growth years`);
    near(grownFace(t, inputs), 10000, 1e-9, `year ${t}:`);
  }
  assert.equal(growthYears(11, inputs), 1);
  near(grownFace(11, inputs), 10000 * 1.02, 1e-9);
  near(grownFace(30, inputs), 10000 * 1.02 ** 20, 1e-9);
});

/* ------------------------------------------------------------------ */
/* The four benefit modes                                              */
/* ------------------------------------------------------------------ */

const face = (t) => 10000 * 1.02 ** t;

test('mode 1, full face, pays the grown face in every year', () => {
  const inputs = withInsurance({ benefitMode: 'fullFace' });
  near(deathBenefit(1, inputs), face(1), 1e-9);
  near(deathBenefit(2, inputs), face(2), 1e-9);
  near(deathBenefit(5, inputs), face(5), 1e-9);
  near(deathBenefit(20, inputs), face(20), 1e-9);
});

test('mode 2, percent of face, pays the schedule inside the waiting period', () => {
  const inputs = withInsurance({
    benefitMode: 'percentOfFace',
    waitingYears: 2,
    waitingSchedule: [0.4, 0.7],
  });
  near(deathBenefit(1, inputs), 4000, 1e-9);
  near(deathBenefit(2, inputs), 7000, 1e-9);
  near(deathBenefit(5, inputs), face(5), 1e-9);
  near(deathBenefit(20, inputs), face(20), 1e-9);
});

test('mode 3, return of premium, pays the premiums with interest inside the waiting period', () => {
  const inputs = withInsurance({
    benefitMode: 'returnOfPremium',
    payments: 5,
    annualPremium: 2200,
    waitingYears: 2,
    ropInterest: 0.07,
  });
  near(deathBenefit(1, inputs), 2200 * 1.07, 1e-9);
  near(deathBenefit(2, inputs), 4400 * 1.07, 1e-9);
  near(deathBenefit(5, inputs), face(5), 1e-9);
  near(deathBenefit(20, inputs), face(20), 1e-9);
});

test('mode 4, face less unpaid premiums, deducts the remaining schedule', () => {
  const inputs = withInsurance({
    benefitMode: 'faceLessUnpaid',
    payments: 5,
    annualPremium: 2200,
  });
  near(deathBenefit(1, inputs), face(1) - 8800, 1e-9);
  near(deathBenefit(2, inputs), face(2) - 6600, 1e-9);
  near(deathBenefit(5, inputs), face(5), 1e-9);
  near(deathBenefit(20, inputs), face(20), 1e-9);
});

test('mode 4 needs no branch after the policy is paid up', () => {
  const inputs = withInsurance({
    benefitMode: 'faceLessUnpaid',
    payments: 3,
    annualPremium: 3600,
  });
  for (let t = 3; t <= 30; t += 1) {
    near(deathBenefit(t, inputs), grownFace(t, inputs), 1e-9, `year ${t}:`);
  }
});

test('the modes are mutually exclusive, so early death is never penalised twice', () => {
  const graded = withInsurance({
    benefitMode: 'percentOfFace',
    payments: 5,
    annualPremium: 2200,
    waitingYears: 2,
    waitingSchedule: [0.4, 0.7],
  });
  // The graded benefit is the schedule alone. Unpaid premiums are not also deducted.
  near(deathBenefit(1, graded), 10000 * 0.4, 1e-9);
});

test('a waiting year past the end of the schedule holds the last percent', () => {
  const inputs = withInsurance({
    benefitMode: 'percentOfFace',
    waitingYears: 4,
    waitingSchedule: [0.4, 0.7],
  });
  near(deathBenefit(3, inputs), 7000, 1e-9);
  near(deathBenefit(4, inputs), 7000, 1e-9);
  near(deathBenefit(5, inputs), face(5), 1e-9);
});

test('a waiting period of zero years turns every mode into full face', () => {
  ['percentOfFace', 'returnOfPremium'].forEach((mode) => {
    const inputs = withInsurance({ benefitMode: mode, waitingYears: 0 });
    for (let t = 1; t <= 5; t += 1) {
      near(deathBenefit(t, inputs), grownFace(t, inputs), 1e-9, `${mode} year ${t}:`);
    }
  });
});

test('a benefit is never negative in any mode', () => {
  BENEFIT_MODES.forEach((mode) => {
    const inputs = withInsurance({
      benefitMode: mode,
      payments: 10,
      annualPremium: 4000, // premiums total four times the face amount
      waitingYears: 3,
      waitingSchedule: [0, 0, 0],
      ropInterest: 0,
    });
    for (let t = 1; t <= 30; t += 1) {
      assert.ok(deathBenefit(t, inputs) >= 0, `${mode} year ${t} paid a negative benefit`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

test('a single-pay plan pays commission once', () => {
  const inputs = withInsurance({
    payments: 1,
    annualPremium: 10000,
    firstYearCommission: 0.12,
    renewalCommission: 0.03,
  });
  const afterTax = 0.12 * 10000 * 0.7; // 840
  near(commissionPayment(1, inputs), afterTax, 1e-9);
  assert.equal(commissionPayment(2, inputs), 0);
  near(commissionFund(1, inputs), afterTax, 1e-9);

  const net = netTrustRate(inputs);
  for (let t = 1; t <= 30; t += 1) {
    near(commissionFund(t, inputs), afterTax * (1 + net) ** (t - 1), 1e-7, `year ${t}:`);
  }
});

test('an as-earned schedule pays the same amount every year of the pay period', () => {
  const inputs = withInsurance({
    payments: 5,
    annualPremium: 2200,
    firstYearCommission: 0.05,
    renewalCommission: 0.05,
  });
  const each = 0.05 * 2200 * 0.7; // 77
  for (let k = 1; k <= 5; k += 1) near(commissionPayment(k, inputs), each, 1e-9, `payment ${k}:`);
  assert.equal(commissionPayment(6, inputs), 0);
});

test('a heaped schedule front-loads the commission', () => {
  const inputs = withInsurance({
    payments: 5,
    annualPremium: 2200,
    firstYearCommission: 0.2,
    renewalCommission: 0.02,
  });
  near(commissionPayment(1, inputs), 0.2 * 2200 * 0.7, 1e-9);
  near(commissionPayment(2, inputs), 0.02 * 2200 * 0.7, 1e-9);
  // Heaped and as-earned totals, before any compounding.
  const heapedTotal = 0.2 * 2200 * 0.7 + 4 * 0.02 * 2200 * 0.7;
  near(heapedTotal, 431.2, 1e-9);
});

test('the commission fund compounds at the net trust rate', () => {
  const inputs = withInsurance({
    payments: 5,
    annualPremium: 2200,
    firstYearCommission: 0.2,
    renewalCommission: 0.02,
  });
  const net = netTrustRate(inputs);
  // An independent accumulation: grow the fund, then add this year's payment.
  let fund = 0;
  for (let t = 1; t <= 30; t += 1) {
    fund = fund * (1 + net) + commissionPayment(t, inputs);
    near(commissionFund(t, inputs), fund, 1e-7, `year ${t}:`);
  }
});

test('commission is taxed as business income in the year it arrives', () => {
  const taxed = withInsurance({ businessTaxRate: 0.3 });
  const untaxed = withInsurance({ businessTaxRate: 0 });
  near(commissionFund(1, taxed), commissionFund(1, untaxed) * 0.7, 1e-9);
});

/* ------------------------------------------------------------------ */
/* The result table                                                    */
/* ------------------------------------------------------------------ */

test('the total to him is the funds plus the commission', () => {
  const inputs = base();
  for (let t = 1; t <= 30; t += 1) {
    const row = projectYear(t, inputs);
    near(row.trust.total, row.trust.funds + row.trust.commission, 1e-9, `year ${t}:`);
    near(row.insurance.total, row.insurance.funds + row.insurance.commission, 1e-9, `year ${t}:`);
  }
});

test('the effective annual rate is measured against the price he guaranteed', () => {
  const inputs = base();
  const row = projectYear(10, inputs);
  near(row.trust.effectiveRate, (row.trust.total / 10000) ** 0.1 - 1, 1e-12);
  near(effectiveAnnualRate(20000, 10000, 10), 2 ** 0.1 - 1, 1e-12);
});

test('the effective annual rate of a flat trust equals its net rate', () => {
  const inputs = base();
  const net = netTrustRate(inputs);
  for (let t = 1; t <= 30; t += 1) {
    near(projectYear(t, inputs).trust.effectiveRate, net, 1e-9, `year ${t}:`);
  }
});

test('the margin falls as funeral inflation rises', () => {
  const low = base();
  const high = base();
  high.inflation = 0.08;
  for (let t = 1; t <= 30; t += 1) {
    assert.ok(
      projectYear(t, high).trust.margin < projectYear(t, low).trust.margin,
      `year ${t} margin did not fall`,
    );
  }
});

test('the margin rises as the trust return rises', () => {
  const low = base();
  const high = withTrust({ netReturn: 0.08 });
  for (let t = 1; t <= 30; t += 1) {
    assert.ok(
      projectYear(t, high).trust.margin > projectYear(t, low).trust.margin,
      `year ${t} margin did not rise`,
    );
  }
});

test('project returns one row for every year of the horizon', () => {
  const result = project(base());
  assert.equal(result.rows.length, 30);
  assert.equal(result.rows[0].year, 1);
  assert.equal(result.rows[29].year, 30);
  assert.equal(result.horizon, 30);
});

test('normalize fills a missing input with zero and keeps the model finite', () => {
  const result = project({});
  assert.equal(result.inputs.price, 0);
  assert.equal(result.inputs.deliveryPercent, 1);
  result.rows.forEach((row) => {
    assert.ok(Number.isFinite(row.trust.total), `year ${row.year} trust total is not finite`);
    assert.ok(Number.isFinite(row.insurance.total), `year ${row.year} insurance total is not finite`);
  });
});

test('the summary reports the first loss year for each option', () => {
  const inputs = base();
  inputs.inflation = 0.08; // the trust cannot keep up
  const { rows, summary } = project(inputs);
  const expected = rows.find((row) => row.trust.margin < 0).year;
  assert.equal(summary.trustFirstLossYear, expected);
});

test('a doubtful benefit mode raises a warning', () => {
  const inputs = withInsurance({ benefitMode: 'faceLessUnpaid' });
  const { warnings } = project(inputs);
  assert.ok(warnings.some((line) => line.includes('not confirmed')));
});
