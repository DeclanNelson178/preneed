import test from 'node:test';
import assert from 'node:assert/strict';

import { project } from '../src/model.js';
import { defaults } from '../src/inputs.js';

/**
 * Pinned output. Nothing here proves the model is right. It proves that
 * nothing changed by accident.
 *
 * If a number below moves, the test fails. Read the change, approve it, then
 * re-pin. Do not re-pin to make the test pass.
 *
 * Columns: year, cost, trust total, trust margin,
 *          insurance benefit, commission fund, insurance total, insurance margin.
 */

const round = (n) => Math.round(n * 100) / 100;
const YEARS = [1, 2, 3, 5, 10, 20, 30];

const compare = (result, expected) => {
  YEARS.forEach((t, index) => {
    const row = result.rows[t - 1];
    const actual = [
      row.year,
      round(row.cost),
      round(row.trust.total),
      round(row.trust.margin),
      round(row.insurance.funds),
      round(row.insurance.commission),
      round(row.insurance.total),
      round(row.insurance.margin),
    ];
    assert.deepEqual(actual, expected[index], `year ${t} moved`);
  });
};

/* ------------------------------------------------------------------ */

test('golden — the starting values in src/inputs.js', () => {
  const result = project(defaults());

  assert.equal(round(result.netTrustRate * 1e6) / 1e6, 0.03925);

  compare(result, [
    [1, 9591.82, 9529.92, -61.9, 9353.4, 770.28, 10123.68, 531.86],
    [2, 10033.04, 9903.97, -129.07, 9540.47, 800.51, 10340.98, 307.94],
    [3, 10494.56, 10292.7, -201.86, 9731.28, 831.93, 10563.21, 68.65],
    [5, 11482.27, 11116.54, -365.73, 10124.42, 898.52, 11022.94, -459.33],
    [10, 14377.59, 13476.27, -901.32, 11178.18, 1089.25, 12267.43, -2110.16],
    [20, 22542.55, 19804.78, -2737.77, 13626.14, 1600.77, 15226.91, -7315.64],
    [30, 35344.34, 29105.18, -6239.16, 16610.19, 2352.5, 18962.69, -16381.65],
  ]);

  assert.deepEqual(result.summary, {
    trustFirstLossYear: 1,
    insuranceFirstLossYear: 4,
    trustLossYears: 30,
    insuranceLossYears: 27,
    leadChanges: [{ year: 5, leader: 'trust' }],
    leaderAtStart: 'insurance',
    leaderAtEnd: 'trust',
  });
});

test('golden — a 10-pay graded policy, growth held to paid-up, heaped commission, 60% cost to deliver', () => {
  const raw = defaults();
  raw.deliveryPercent = 0.6;
  raw.insurance.payments = 10;
  raw.insurance.annualPremium = 1055;
  raw.insurance.growthStartsAtPaidUp = true;
  raw.insurance.benefitMode = 'percentOfFace';
  raw.insurance.waitingYears = 2;
  raw.insurance.waitingSchedule = [0.4, 0.7];
  raw.insurance.firstYearCommission = 0.2;
  raw.insurance.renewalCommission = 0.02;

  const result = project(raw);

  compare(result, [
    [1, 5755.09, 9529.92, 3774.83, 3668, 147.7, 3815.7, -1939.39],
    [2, 6019.83, 9903.97, 3884.15, 6419, 168.27, 6587.27, 567.44],
    [3, 6296.74, 10292.7, 3995.96, 9170, 189.64, 9359.64, 3062.9],
    [5, 6889.36, 11116.54, 4227.17, 9170, 234.94, 9404.94, 2515.58],
    [10, 8626.56, 13476.27, 4849.71, 9170, 364.69, 9534.69, 908.14],
    [20, 13525.53, 19804.78, 6279.25, 11178.18, 535.95, 11714.13, -1811.4],
    [30, 21206.6, 29105.18, 7898.58, 13626.14, 787.64, 14413.77, -6792.83],
  ]);

  assert.equal(result.summary.trustFirstLossYear, null);
  assert.equal(result.summary.insuranceFirstLossYear, 1);
});

test('golden — every starting value in src/inputs.js', () => {
  // The starting values are part of the product. A change to one is a change
  // to every number above.
  assert.deepEqual(defaults(), {
    price: 9170,
    inflation: 0.046,
    trust: {
      grossReturn: 0.055,
      fees: 0.0075,
      taxRate: 0.15,
    },
    insurance: {
      payments: 1,
      annualPremium: 9170,
      growthRate: 0.02,
      growthStartsAtPaidUp: false,
      benefitMode: 'fullFace',
      waitingYears: 2,
      waitingSchedule: [0.4, 0.7],
      ropInterest: 0.07,
      businessTaxRate: 0.3,
      firstYearCommission: 0.12,
      renewalCommission: 0.03,
    },
  });
});
