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

  assert.equal(round(result.netTrustRate * 1e6) / 1e6, 0.043);

  compare(result, [
    [1, 9591.82, 9564.31, -27.51, 9353.4, 770.28, 10123.68, 531.86],
    [2, 10033.04, 9975.58, -57.47, 9540.47, 803.4, 10343.87, 310.83],
    [3, 10494.56, 10404.53, -90.04, 9731.28, 837.95, 10569.23, 74.66],
    [5, 11482.27, 11318.55, -163.72, 10124.42, 911.56, 11035.98, -446.29],
    [10, 14377.59, 13970.52, -407.08, 11178.18, 1125.14, 12303.32, -2074.27],
    [20, 22542.55, 21284.11, -1258.44, 13626.14, 1714.16, 15340.29, -7202.26],
    [30, 35344.34, 32426.39, -2917.95, 16610.19, 2611.52, 19221.71, -16122.63],
  ]);

  assert.deepEqual(result.summary, {
    trustFirstLossYear: 1,
    insuranceFirstLossYear: 4,
    trustLossYears: 30,
    insuranceLossYears: 27,
    leadChanges: [{ year: 4, leader: 'trust' }],
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
    [1, 5755.09, 9564.31, 3809.22, 3668, 147.7, 3815.7, -1939.39],
    [2, 6019.83, 9975.58, 3955.75, 6419, 168.82, 6587.82, 567.99],
    [3, 6296.74, 10404.53, 4107.79, 9170, 190.85, 9360.85, 3064.11],
    [5, 6889.36, 11318.55, 4429.19, 9170, 237.79, 9407.79, 2518.43],
    [10, 8626.56, 13970.52, 5343.96, 9170, 373.99, 9543.99, 917.43],
    [20, 13525.53, 21284.11, 7758.58, 11178.18, 569.77, 11747.95, -1777.58],
    [30, 21206.6, 32426.39, 11219.79, 13626.14, 868.05, 14494.18, -6712.42],
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
      netReturn: 0.043,
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
