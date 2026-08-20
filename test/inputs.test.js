import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaults, deriveValues, makeContract, nextContractId, nextContractName,
  contractFields, panelsFor, CONTRACT_PRESETS,
} from '../src/inputs.js';
import { project, MAX_CONTRACTS } from '../src/model.js';

/**
 * The values the dashboard works out for him. Section 3 of plan.md.
 *
 * A derived value replaces a field he would otherwise have to fill in twice.
 * If one of these rules breaks, he sees a field with no way to correct it.
 */

const first = (values) => values.contracts[0];

test('paid in full: the premium is the price', () => {
  const values = defaults();
  values.price = 12000;
  deriveValues(values);
  assert.equal(first(values).annualPremium, 12000);
});

test('paid in full: the growth cannot start at paid-up', () => {
  const values = defaults();
  first(values).growthStartsAtPaidUp = true;
  deriveValues(values);
  assert.equal(first(values).growthStartsAtPaidUp, false);
});

test('multi-pay: the premium and the growth start are left alone', () => {
  const values = defaults();
  Object.assign(first(values), {
    payments: 3, annualPremium: 3600, growthStartsAtPaidUp: true,
  });
  deriveValues(values);
  assert.equal(first(values).annualPremium, 3600);
  assert.equal(first(values).growthStartsAtPaidUp, true);
});

test('graded: the waiting period is the count of the early years', () => {
  const values = defaults();
  first(values).benefitMode = 'percentOfFace';
  first(values).waitingSchedule = [0.4, 0.7, 0.85];
  deriveValues(values);
  assert.equal(first(values).waitingYears, 3);
});

test('the waiting period is his own number in every other mode', () => {
  ['fullFace', 'returnOfPremium', 'faceLessUnpaid'].forEach((mode) => {
    const values = defaults();
    first(values).benefitMode = mode;
    first(values).waitingYears = 4;
    first(values).waitingSchedule = [0.4, 0.7];
    deriveValues(values);
    assert.equal(first(values).waitingYears, 4, mode);
  });
});

test('a derived graded schedule can never be shorter than the waiting period', () => {
  // The warning at model.js `warnings` cannot fire from the dashboard, because
  // the two numbers are now one number.
  const values = defaults();
  first(values).benefitMode = 'percentOfFace';
  first(values).waitingSchedule = [0.4];
  const result = project(deriveValues(values));
  assert.equal(result.warnings.some((line) => line.includes('shorter than')), false);
});

test('the rules apply to every contract, not only the first', () => {
  const values = defaults();
  values.price = 12000;
  values.contracts.push(makeContract('c2', 'Second'));
  values.contracts.push(makeContract('c3', 'Third', {
    payments: 5, annualPremium: 2600, benefitMode: 'percentOfFace', waitingSchedule: [0.3, 0.6, 0.9],
  }));
  deriveValues(values);

  assert.equal(values.contracts[1].annualPremium, 12000, 'a paid-in-full second contract');
  assert.equal(values.contracts[2].annualPremium, 2600, 'a multi-pay third contract is left alone');
  assert.equal(values.contracts[2].waitingYears, 3, 'the third contract derives its own waiting period');
});

test('the starting values need no derivation', () => {
  // The dashboard opens on the pinned values in golden.test.js. If a rule
  // moved one of them, every pinned number would move with it.
  assert.deepEqual(deriveValues(defaults()), defaults());
});

/* ------------------------------------------------------------------ */
/* Adding a contract                                                   */
/* ------------------------------------------------------------------ */

test('a new contract id never collides with one already in the list', () => {
  const contracts = [makeContract('c1', 'A'), makeContract('c3', 'C')];
  assert.equal(nextContractId(contracts), 'c2');
  contracts.push(makeContract('c2', 'B'));
  assert.equal(nextContractId(contracts), 'c4');
});

test('a new contract name never collides with one already in the list', () => {
  const contracts = [makeContract('c1', 'Level'), makeContract('c2', 'Level 2')];
  assert.equal(nextContractName(contracts, 'Graded'), 'Graded');
  assert.equal(nextContractName(contracts, 'Level'), 'Level 3');
});

test('every preset builds a contract the model can price', () => {
  CONTRACT_PRESETS.forEach((preset) => {
    const values = defaults();
    values.contracts.push(makeContract('c2', preset.label, preset.patch));
    const result = project(deriveValues(values));
    result.rows.forEach((row) => {
      assert.ok(Number.isFinite(row.contracts[1].total),
        `${preset.label}: year ${row.year} is not a number`);
    });
  });
});

test('a contract field is stamped out against its own place in the list', () => {
  const paths = contractFields(2).filter((field) => field.path).map((field) => field.path);
  assert.ok(paths.includes('contracts.2.annualPremium'));
  assert.ok(paths.every((path) => path.startsWith('contracts.2.')));
});

test('a contract field is hidden when its own contract does not need it', () => {
  const values = defaults();
  values.contracts.push(makeContract('c2', 'Ten pay', { payments: 10, annualPremium: 1055 }));

  const shownFor = (index, key) => {
    const field = contractFields(index).find((f) => f.path === `contracts.${index}.${key}`);
    return field.showWhen(values);
  };

  // The renewal rate belongs to the multi-pay contract only. The single-pay
  // contract beside it must not gain a field it cannot use.
  assert.equal(shownFor(0, 'renewalCommission'), false);
  assert.equal(shownFor(1, 'renewalCommission'), true);
});

test('the panel list grows and shrinks with the contract list', () => {
  const values = defaults();
  assert.equal(panelsFor(values).length, 3);
  values.contracts.push(makeContract('c2', 'Second'));
  values.contracts.push(makeContract('c3', 'Third'));
  assert.equal(panelsFor(values).length, 5);
  assert.deepEqual(
    panelsFor(values).slice(2).map((panel) => panel.title),
    ['Single pay, level', 'Second', 'Third'],
  );
});

test('the contract limit is the number of colours the charts can keep apart', () => {
  assert.equal(MAX_CONTRACTS, 6);
});
