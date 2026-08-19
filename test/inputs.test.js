import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults, deriveValues } from '../src/inputs.js';
import { project } from '../src/model.js';

/**
 * The values the dashboard works out for him. Section 3 of plan.md.
 *
 * A derived value replaces a field he would otherwise have to fill in twice.
 * If one of these rules breaks, he sees a field with no way to correct it.
 */

test('paid in full: the premium is the price', () => {
  const values = defaults();
  values.price = 12000;
  deriveValues(values);
  assert.equal(values.insurance.annualPremium, 12000);
});

test('paid in full: the growth cannot start at paid-up', () => {
  const values = defaults();
  values.insurance.growthStartsAtPaidUp = true;
  deriveValues(values);
  assert.equal(values.insurance.growthStartsAtPaidUp, false);
});

test('multi-pay: the premium and the growth start are left alone', () => {
  const values = defaults();
  values.insurance.payments = 3;
  values.insurance.annualPremium = 3600;
  values.insurance.growthStartsAtPaidUp = true;
  deriveValues(values);
  assert.equal(values.insurance.annualPremium, 3600);
  assert.equal(values.insurance.growthStartsAtPaidUp, true);
});

test('graded: the waiting period is the count of the early years', () => {
  const values = defaults();
  values.insurance.benefitMode = 'percentOfFace';
  values.insurance.waitingSchedule = [0.4, 0.7, 0.85];
  deriveValues(values);
  assert.equal(values.insurance.waitingYears, 3);
});

test('the waiting period is his own number in every other mode', () => {
  ['fullFace', 'returnOfPremium', 'faceLessUnpaid'].forEach((mode) => {
    const values = defaults();
    values.insurance.benefitMode = mode;
    values.insurance.waitingYears = 4;
    values.insurance.waitingSchedule = [0.4, 0.7];
    deriveValues(values);
    assert.equal(values.insurance.waitingYears, 4, mode);
  });
});

test('a derived graded schedule can never be shorter than the waiting period', () => {
  // The warning at model.js `warnings` cannot fire from the dashboard, because
  // the two numbers are now one number.
  const values = defaults();
  values.insurance.benefitMode = 'percentOfFace';
  values.insurance.waitingSchedule = [0.4];
  const result = project(deriveValues(values));
  assert.equal(result.warnings.some((line) => line.includes('shorter than')), false);
});

test('the starting values need no derivation', () => {
  // The dashboard opens on the pinned values in golden.test.js. If a rule
  // moved one of them, every pinned number would move with it.
  assert.deepEqual(deriveValues(defaults()), defaults());
});
