import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BENEFIT_MODES,
  PAY_PLANS,
  funeralCost,
  normalize,
  project,
  projectYear,
} from '../src/model.js';

/**
 * One test for each rule in docs/LAW.md that the model must obey.
 */

const inputs = (overrides = {}) => normalize({
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

/** Every combination the dashboard can produce. */
function* allSettings() {
  for (const payments of PAY_PLANS) {
    for (const benefitMode of BENEFIT_MODES) {
      for (const growthStartsAtPaidUp of [false, true]) {
        const set = inputs();
        Object.assign(set.insurance, { payments, benefitMode, growthStartsAtPaidUp });
        set.insurance.annualPremium = payments === 1 ? 10000 : (10000 / payments) * 1.15;
        yield set;
      }
    }
  }
}

/* ------------------------------------------------------------------ */

test('239 CMR 4.08 — a trust sale pays no commission, in every setting', () => {
  for (const set of allSettings()) {
    for (let t = 1; t <= 30; t += 1) {
      const row = projectYear(t, set);
      assert.equal(row.trust.commission, 0, `year ${t}: the trust was paid a commission`);
      assert.equal(row.trust.total, row.trust.funds, `year ${t}: the trust total is not the funds alone`);
    }
  }
});

test('239 CMR 4.08 — the trust starts with the whole contract price on day one', () => {
  const set = inputs();
  set.trust.netReturn = 0;
  assert.equal(projectYear(1, set).trust.funds, 10000);
});

test('239 CMR 4.08(6)(a) — a positive margin is retained in full', () => {
  const set = inputs({ inflation: 0 }); // the price is flat, the trust grows
  const { rows } = project(set);
  rows.forEach((row) => {
    assert.ok(row.trust.margin > 0, `year ${row.year}: expected a surplus`);
    // Nothing is withheld, capped or shared. The margin is the whole difference.
    assert.equal(row.trust.margin, row.trust.total - row.cost);
    assert.equal(row.insurance.margin, row.insurance.total - row.cost);
  });
});

test('239 CMR 4.08(6)(b) — a negative margin is borne in full', () => {
  const set = inputs({ inflation: 0.12 }); // the bill outruns both options
  const { rows } = project(set);
  const losses = rows.filter((row) => row.trust.margin < 0);
  assert.ok(losses.length > 0, 'the test needs at least one loss year');
  losses.forEach((row) => {
    // The loss is not floored at zero and it is not moved anywhere.
    assert.equal(row.trust.margin, row.trust.total - row.cost);
    assert.ok(row.trust.margin < 0);
  });
});

test('239 CMR 4.08(6)(b) — no result field bills the estate', () => {
  const set = inputs({ inflation: 0.12 });
  const result = project(set);

  const names = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    Object.entries(node).forEach(([key, value]) => { names.add(key); walk(value); });
  };
  walk(result.rows);

  const forbidden = /estate|bill|invoice|recover|surcharge|shortfallCharge/i;
  const offenders = [...names].filter((name) => forbidden.test(name));
  assert.deepEqual(offenders, [], `these fields could move a loss off the funeral home: ${offenders}`);
});

test('239 CMR 4.08(6)(b) — the margin is the only settlement figure', () => {
  const set = inputs({ inflation: 0.12 });
  const { rows } = project(set);
  rows.forEach((row) => {
    // margin = money available at death - true cost of the funeral at death
    // The tolerance is floating-point rounding only, not a modelling allowance.
    assert.ok(Math.abs(row.trust.margin + row.cost - row.trust.total) < 1e-9);
    assert.ok(Math.abs(row.insurance.margin + row.cost - row.insurance.total) < 1e-9);
  });
});

test('239 CMR 4.08(6)(a) and (b) — the same line computes surplus and loss', () => {
  // One formula, no branch. A sign change must not change the arithmetic.
  const source = readFileSync(fileURLToPath(new URL('../src/model.js', import.meta.url)), 'utf8');
  const marginLines = source.split('\n').filter((line) => /margin:/.test(line));
  assert.equal(marginLines.length, 2, 'margin should be computed in exactly two places, once per option');
  marginLines.forEach((line) => {
    assert.ok(/total - cost|Total - cost/.test(line), `margin is not a plain difference: ${line}`);
  });
});

test('239 CMR 4.01 — cost protection: the bill follows the price he guaranteed', () => {
  const set = inputs();
  for (let t = 1; t <= 30; t += 1) {
    assert.equal(funeralCost(t, set), 10000 * 1.04 ** t);
  }
});

test('the model covers funeral establishment charges only', () => {
  // 239 CMR 4.08(6)(c) and (d) are out of scope, so no cash advance figure exists.
  const result = project(inputs());
  const row = result.rows[0];
  assert.deepEqual(Object.keys(row).sort(), ['cost', 'insurance', 'trust', 'year']);
});
