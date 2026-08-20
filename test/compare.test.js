import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CONTRACTS,
  normalize,
  project,
  projectYear,
  winnerOf,
  winnerRuns,
} from '../src/model.js';
import { defaults, deriveValues, makeContract } from '../src/inputs.js';

/**
 * The comparison: one trust against any number of insurance contracts, all
 * against the same funeral bill.
 *
 * The yearly winner is the tool the dashboard is built around, so it is
 * tested here in its own right: who is ahead, by how much, and where the lead
 * changes hands.
 */

/** A dashboard input object with `count` contracts, each patched in turn. */
const withContracts = (patches) => {
  const values = defaults();
  values.contracts = patches.map((patch, index) =>
    makeContract(`c${index + 1}`, patch.name || `Contract ${index + 1}`, patch));
  return deriveValues(values);
};

/* ------------------------------------------------------------------ */
/* The contract list                                                   */
/* ------------------------------------------------------------------ */

test('normalize accepts a list of contracts and keeps them in order', () => {
  const inputs = normalize({
    price: 10000,
    inflation: 0.04,
    trust: { netReturn: 0.03 },
    contracts: [
      { id: 'c1', name: 'A', annualPremium: 10000, growthRate: 0.02 },
      { id: 'c2', name: 'B', annualPremium: 10000, growthRate: 0.05 },
    ],
  });

  assert.equal(inputs.contracts.length, 2);
  assert.deepEqual(inputs.contracts.map((c) => c.name), ['A', 'B']);
});

test('normalize reads a lone `insurance` object as the first contract', () => {
  // Every caller that predates the contract list still works, and still finds
  // its policy at `inputs.insurance`.
  const inputs = normalize({
    price: 10000,
    insurance: { annualPremium: 10000, growthRate: 0.02 },
  });
  assert.equal(inputs.contracts.length, 1);
  assert.equal(inputs.insurance, inputs.contracts[0]);
  assert.equal(inputs.insurance.growthRate, 0.02);
});

test('normalize never holds more contracts than there are colours for them', () => {
  const many = Array.from({ length: MAX_CONTRACTS + 4 }, (_, i) => ({ id: `c${i + 1}` }));
  assert.equal(normalize({ contracts: many }).contracts.length, MAX_CONTRACTS);
});

test('a contract with no name and no id is given one', () => {
  const inputs = normalize({ contracts: [{}, {}] });
  assert.deepEqual(inputs.contracts.map((c) => c.id), ['c1', 'c2']);
  assert.deepEqual(inputs.contracts.map((c) => c.name), ['Contract 1', 'Contract 2']);
});

test('every contract is priced against the same bill', () => {
  const result = project(withContracts([
    { growthRate: 0.01 },
    { growthRate: 0.05 },
    { growthRate: 0.09 },
  ]));

  result.rows.forEach((row) => {
    assert.equal(row.contracts.length, 3, `year ${row.year}`);
    row.contracts.forEach((cell) => {
      assert.equal(cell.margin, cell.total - row.cost, `year ${row.year}, ${cell.name}`);
    });
  });
});

test('one contract is priced exactly as it was before the list existed', () => {
  // Adding a second contract must not move the first one's numbers.
  const alone = project(defaults());
  const beside = project(withContracts([
    {}, { growthRate: 0.09, name: 'A loud neighbour' },
  ]));

  alone.rows.forEach((row, index) => {
    assert.equal(row.insurance.total, beside.rows[index].contracts[0].total, `year ${row.year}`);
    assert.equal(row.trust.total, beside.rows[index].trust.total, `year ${row.year}`);
  });
});

test('a contract that grows faster than the bill covers it in every year', () => {
  const values = withContracts([
    { growthRate: 0.001, name: 'Slow' },
    { growthRate: 0.20, name: 'Fast' },
  ]);
  const result = project(values);
  assert.equal(result.summary.byOption.c2.firstLossYear, null);
  assert.ok(result.summary.byOption.c1.firstLossYear !== null);
});

/* ------------------------------------------------------------------ */
/* The yearly winner                                                   */
/* ------------------------------------------------------------------ */

const option = (key, total, name = key) => ({ key, name, total, margin: total - 100 });

test('the winner is the option that leaves the most money in your hand', () => {
  const won = winnerOf([option('trust', 100), option('c1', 300), option('c2', 200)]);
  assert.equal(won.key, 'c1');
  assert.equal(won.tie, false);
  assert.equal(won.total, 300);
});

test('the lead is the distance to the runner-up, not to the field', () => {
  const won = winnerOf([option('trust', 100), option('c1', 300), option('c2', 290)]);
  assert.equal(won.lead, 10);
  assert.equal(won.runnerUp.key, 'c2');
});

test('two options on the same number are level, not a winner and a loser', () => {
  const won = winnerOf([option('trust', 300), option('c1', 300), option('c2', 100)]);
  assert.equal(won.tie, true);
  assert.deepEqual(won.tied, ['trust', 'c1']);
  // The lead is still the distance to the next option below them, which the
  // two of them hold jointly.
  assert.equal(won.lead, 200);
  assert.equal(won.runnerUp.key, 'c2');
});

test('a difference under a cent is a tie, so rounding never invents a winner', () => {
  const won = winnerOf([option('trust', 300), option('c1', 300.001)]);
  assert.equal(won.tie, true);
  assert.deepEqual(won.tied.sort(), ['c1', 'trust']);
  assert.equal(won.lead, 0, 'nothing sits below the tied pair');
});

test('a lone option wins with no lead and no runner-up', () => {
  const won = winnerOf([option('trust', 100)]);
  assert.equal(won.key, 'trust');
  assert.equal(won.lead, 0);
  assert.equal(won.runnerUp, null);
});

test('the winner of a year is one of that year\'s options, at that year\'s top total', () => {
  const inputs = normalize(withContracts([{ growthRate: 0.01 }, { growthRate: 0.08 }]));
  for (let t = 1; t <= 30; t += 1) {
    const row = projectYear(t, inputs);
    const best = Math.max(...row.options.map((o) => o.total));
    assert.equal(row.winner.total, best, `year ${t}`);
    assert.ok(row.options.some((o) => o.key === row.winner.key), `year ${t}`);
  }
});

test('a run holds every year the same option stays ahead', () => {
  const rows = [
    { year: 1, winner: { key: 'c1', name: 'A', tie: false, lead: 5 } },
    { year: 2, winner: { key: 'c1', name: 'A', tie: false, lead: 9 } },
    { year: 3, winner: { key: 'trust', name: 'Trust', tie: false, lead: 2 } },
    { year: 4, winner: { key: 'c1', name: 'A', tie: false, lead: 1 } },
  ];
  assert.deepEqual(winnerRuns(rows).map((run) => [run.key, run.from, run.to, run.bestLead]), [
    ['c1', 1, 2, 9],
    ['trust', 3, 3, 2],
    ['c1', 4, 4, 1],
  ]);
});

test('the runs cover every year exactly once, with no gap and no overlap', () => {
  const result = project(withContracts([
    { growthRate: 0.01 }, { growthRate: 0.05 }, { growthRate: 0.09 },
  ]));
  const covered = result.summary.runs.flatMap(
    (run) => Array.from({ length: run.to - run.from + 1 }, (_, i) => run.from + i),
  );
  assert.deepEqual(covered, result.rows.map((row) => row.year));
});

test('the years each option leads add up to the horizon', () => {
  const result = project(withContracts([
    { growthRate: 0.01 }, { growthRate: 0.05 }, { growthRate: 0.09 },
  ]));
  const total = result.summary.options
    .reduce((sum, o) => sum + result.summary.byOption[o.key].outrightWinYears, 0);
  assert.equal(total, result.horizon);
});

test('the lead changes hands where the top total changes hands', () => {
  // The trust starts behind an insurance contract that grows slowly, and
  // passes it. The change belongs to the year of the pass, not the year after.
  const result = project(withContracts([{ growthRate: 0.005 }]));
  const changes = result.summary.leadChanges;
  assert.ok(changes.length >= 1);
  changes.forEach((change) => {
    const before = result.rows[change.year - 2];
    const now = result.rows[change.year - 1];
    assert.notEqual(before.winner.key, now.winner.key);
    assert.equal(now.winner.key, change.leader);
  });
});

/* ------------------------------------------------------------------ */
/* What the dashboard reads off the result                             */
/* ------------------------------------------------------------------ */

test('the options list names the trust first, then each contract in order', () => {
  const result = project(withContracts([
    { name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' },
  ]));
  assert.deepEqual(result.summary.options.map((o) => o.name),
    ['Trust', 'Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(result.summary.options.map((o) => o.key),
    ['trust', 'c1', 'c2', 'c3']);
});

test('every option in the list has a row of statistics', () => {
  const result = project(withContracts([{}, {}, {}]));
  result.summary.options.forEach((o) => {
    const stat = result.summary.byOption[o.key];
    assert.ok(stat, o.key);
    assert.equal(stat.name, o.name);
    assert.ok(stat.lossYears >= 0 && stat.lossYears <= result.horizon);
    assert.ok(stat.winYears >= 0 && stat.winYears <= result.horizon);
  });
});

test('a warning names the contract it is about, once there is more than one', () => {
  const alone = project(withContracts([{ benefitMode: 'faceLessUnpaid', name: 'Odd shape' }]));
  assert.ok(alone.warnings.some((line) => line.startsWith('The "full amount')));

  const many = project(withContracts([
    { name: 'Plain' }, { benefitMode: 'faceLessUnpaid', name: 'Odd shape' },
  ]));
  assert.ok(many.warnings.some((line) => line.startsWith('Odd shape: The "full amount')));
});

test('a warning is raised once for each contract that earns it', () => {
  const result = project(withContracts([
    { benefitMode: 'faceLessUnpaid', name: 'One' },
    { benefitMode: 'faceLessUnpaid', name: 'Two' },
    { name: 'Three' },
  ]));
  const unconfirmed = result.warnings.filter((line) => line.includes('is not confirmed'));
  assert.equal(unconfirmed.length, 2);
});
