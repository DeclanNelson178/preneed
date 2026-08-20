/**
 * The field list: labels, starting values and where each number comes from.
 * Section 3 of plan.md.
 *
 * This file holds no DOM code. `test/golden.test.js` imports it.
 *
 * The starting values below are working defaults, so the dashboard opens with
 * a complete picture. You replace them with your own.
 *
 * Field kinds:
 *   currency percent years   a number, with a unit
 *   text                     a line of words. The contract name.
 *   choice                   a row of buttons. One answer.
 *   percentRows              one percent for each early year. The count of the
 *                            rows gives the length of the waiting period.
 *   note                     a computed line. It holds no value of its own.
 *
 * A note has an `id` and no `path`, because the user cannot type into it.
 *
 * The insurance fields are written once, as CONTRACT_FIELDS, with a `key`
 * relative to one contract. `contractFields(index)` stamps them out against
 * `contracts.<index>.<key>` for each contract in the comparison.
 */

import { MAX_CONTRACTS } from './model.js';

export { MAX_CONTRACTS };

export const BENEFIT_MODE_OPTIONS = [
  {
    value: 'fullFace',
    label: 'The full amount',
    help: 'Level policy. It pays the full grown amount from year 1.',
  },
  {
    value: 'percentOfFace',
    label: 'A part of it',
    help: 'Graded policy. It pays a percent of the amount in the early years.',
  },
  {
    value: 'returnOfPremium',
    label: 'The money back, with interest',
    help: 'Guaranteed-issue policy. In the early years it returns the premiums paid, with interest.',
  },
  {
    value: 'faceLessUnpaid',
    label: 'The full amount, less the premiums not yet paid',
    help: 'Not confirmed. No carrier document shows this shape.',
    advanced: true,
  },
];

export const PAY_PLAN_OPTIONS = [
  { value: 1, label: 'In full' },
  { value: 3, label: '3 years' },
  { value: 5, label: '5 years' },
  { value: 10, label: '10 years' },
];

export const GROWTH_START_OPTIONS = [
  { value: false, label: 'From the start' },
  { value: true, label: 'When it is paid up' },
];

/** The most early years a graded policy can list. */
export const MAX_WAITING_ROWS = 5;

/* ------------------------------------------------------------------ */
/* Derived values                                                      */
/* ------------------------------------------------------------------ */

/**
 * The values that another answer already gives. You never type these.
 *
 * 1. The customer pays in full, so the single premium is the price you
 *    charge. The contract price is also the face amount at issue, so the
 *    two are one number. Two fields for one number can disagree. One cannot.
 * 2. The customer pays in full, so there is no pay period to wait for. The
 *    growth starts at the start.
 * 3. A graded policy lists one percent for each early year. The count of
 *    those years is the waiting period. You give it once.
 *
 * The function writes into the object it is given and returns it.
 */
export function deriveValues(values) {
  values.contracts.forEach((ins) => {
    if (ins.payments === 1) {
      ins.annualPremium = values.price;
      ins.growthStartsAtPaidUp = false;
    }
    if (ins.benefitMode === 'percentOfFace') {
      ins.waitingYears = ins.waitingSchedule.length;
    }
  });
  return values;
}

/* ------------------------------------------------------------------ */
/* The panels                                                          */
/* ------------------------------------------------------------------ */

/* A contract-level test. It is given the one contract the field belongs to. */
const paidInFull = (c) => c.payments === 1;
const multiPay = (c) => c.payments > 1;
const graded = (c) => c.benefitMode === 'percentOfFace';
const moneyBack = (c) => c.benefitMode === 'returnOfPremium';

/**
 * The two fixed panels: the bill everyone is measured against, and the trust.
 *
 * Each field:
 *   path     dotted path into the input object
 *   id       a note has this in the place of a path
 *   kind     currency | percent | years | text | choice | percentRows | note
 *   value    the starting value, in model units (a percent is a fraction)
 *   source   where you get the real number
 *   group    an optional heading above the field
 *   showWhen optional test against the current input object
 */
export const BASE_PANELS = [
  {
    id: 'contract',
    title: 'The funeral',
    lede: 'The price you guaranteed, and how fast funeral prices rise. Every option is measured against this bill.',
    fields: [
      {
        path: 'price',
        label: 'Contract price',
        kind: 'currency',
        value: 9170,
        step: 100,
        min: 0,
        source: 'From your general price list. The full bill at death, and the face amount at issue.',
      },
      {
        path: 'inflation',
        label: 'Funeral inflation rate',
        kind: 'percent',
        value: 0.046,
        step: 0.1,
        min: -20,
        max: 30,
        source: 'From your price history, or the BLS funeral services index.',
      },
    ],
  },
  {
    id: 'trust',
    title: 'The trust option',
    lede: 'The full price goes to the bank in five business days. You get no commission.',
    fields: [
      {
        path: 'trust.netReturn',
        label: 'Net rate of return, after fees and after tax',
        kind: 'percent',
        value: 0.043,
        step: 0.1,
        min: -20,
        max: 30,
        source:
          'From the trustee. How fast the account balance itself grows. Fees and '
          + 'tax are already inside this number, so do not subtract them again. '
          + 'To find it, take ten years of year-end balances on one fully-funded '
          + 'account with no deposits and no withdrawals, then compute '
          + '(last balance / first balance) ^ (1 / years) - 1. Under 239 CMR '
          + '4.09(2) the balance is what you receive at death, so it is the only '
          + 'trust number this model needs.',
      },
    ],
  },
];

/**
 * One insurance contract. Written once, stamped out for each contract in the
 * comparison. `key` is the path inside the contract; `showWhen` is given that
 * contract, not the whole input object.
 */
export const CONTRACT_FIELDS = [
  {
    key: 'name',
    label: 'Name this contract',
    kind: 'text',
    value: '',
    maxLength: 32,
    source: 'The carrier and product, so you can tell the lines apart on the charts.',
  },
  /* ---- the policy ---- */
  {
    key: 'payments',
    label: 'How does the customer pay?',
    kind: 'choice',
    value: 1,
    options: PAY_PLAN_OPTIONS,
    group: 'The policy',
    source: 'From the contract.',
  },
  {
    id: 'single-premium',
    kind: 'note',
    showWhen: paidInFull,
    source: 'One payment. The premium is the contract price, so you do not enter it.',
  },
  {
    key: 'annualPremium',
    label: 'Premium each year',
    kind: 'currency',
    value: 9170,
    step: 100,
    min: 0,
    showWhen: multiPay,
    source:
      'From the carrier illustration. On a multi-pay plan the premiums total '
      + 'more than the price. Do not divide the price.',
  },
  {
    id: 'premium-check',
    kind: 'note',
    showWhen: multiPay,
  },
  {
    key: 'growthRate',
    label: 'The amount grows each year',
    kind: 'percent',
    value: 0.02,
    step: 0.1,
    min: -10,
    max: 20,
    source: 'From the carrier product sheet.',
  },
  {
    key: 'growthStartsAtPaidUp',
    label: 'The growth starts',
    kind: 'choice',
    value: false,
    options: GROWTH_START_OPTIONS,
    showWhen: multiPay,
    source: 'From the carrier. On a 10-year plan, this choice can remove ten years of growth.',
  },
  {
    key: 'benefitMode',
    label: 'If the customer dies in the first years, the policy pays',
    kind: 'choice',
    value: 'fullFace',
    options: BENEFIT_MODE_OPTIONS,
    source: 'From the carrier product sheet. Pick one shape only. They cannot be mixed.',
  },
  {
    key: 'waitingSchedule',
    label: 'What it pays in each early year',
    kind: 'percentRows',
    value: [0.4, 0.7],
    showWhen: graded,
    source:
      'From the carrier product sheet. Add one row for each year that pays a '
      + 'part. The 40 and 70 values are placeholders. Replace them.',
  },
  {
    key: 'waitingYears',
    label: 'The money-back period lasts',
    kind: 'years',
    value: 2,
    step: 1,
    min: 0,
    max: 10,
    showWhen: moneyBack,
    source: 'From the carrier product sheet.',
  },
  {
    key: 'ropInterest',
    label: 'Interest added to the money paid back',
    kind: 'percent',
    value: 0.07,
    step: 0.5,
    min: 0,
    max: 30,
    showWhen: moneyBack,
    source: 'From the carrier product sheet. Usually 5% to 10%. It is applied once.',
  },
  {
    id: 'full-amount-from',
    kind: 'note',
    showWhen: (c) => graded(c) || moneyBack(c),
  },
  /* ---- what you keep ---- */
  {
    key: 'firstYearCommission',
    label: 'Commission on the first premium',
    kind: 'percent',
    value: 0.12,
    step: 0.5,
    min: 0,
    max: 100,
    group: 'What you keep',
    source: 'From your carrier commission schedule.',
  },
  {
    key: 'renewalCommission',
    label: 'Commission on the later premiums',
    kind: 'percent',
    value: 0.03,
    step: 0.5,
    min: 0,
    max: 100,
    showWhen: multiPay,
    source:
      'From your carrier commission schedule. It equals the first-year rate on '
      + 'an as-earned schedule, and is lower on a heaped schedule.',
  },
  {
    key: 'businessTaxRate',
    label: 'Your business income tax rate',
    kind: 'percent',
    value: 0.3,
    step: 1,
    min: 0,
    max: 60,
    source: 'From your accountant. The rate depends on how the business is organised.',
  },
  {
    id: 'commission-growth',
    kind: 'note',
  },
];

/**
 * The insurance fields for contract `index`, as full-path fields.
 * A `showWhen` written against one contract becomes one written against the
 * whole input object, so the dashboard tests every field the same way.
 */
export function contractFields(index) {
  const at = (values) => values.contracts[index];
  return CONTRACT_FIELDS.map((field) => {
    const out = {
      ...field,
      panel: `contract-${index}`,
      contractIndex: index,
    };
    if (field.key) out.path = `contracts.${index}.${field.key}`;
    if (field.id) out.id = `${field.id}-${index}`;
    if (field.showWhen) out.showWhen = (values) => Boolean(at(values)) && field.showWhen(at(values));
    else out.showWhen = (values) => Boolean(at(values));
    return out;
  });
}

/** The panel for contract `index`. */
export function contractPanel(index, name) {
  return {
    id: `contract-${index}`,
    index,
    title: name,
    lede: 'The policy terms, and the commission you keep.',
    removable: true,
    fields: contractFields(index),
  };
}

/** Every panel, for a given input object: the two fixed ones, then a contract each. */
export function panelsFor(values) {
  return [
    ...BASE_PANELS,
    ...values.contracts.map((ins, index) => contractPanel(index, ins.name)),
  ];
}

/** Every field, for a given input object, in panel order. */
export function fieldsFor(values) {
  return panelsFor(values).flatMap((panel) =>
    panel.fields.map((field) => ({ panel: panel.id, ...field })));
}

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function getPath(object, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
}

export function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => {
    if (node[key] === undefined) node[key] = {};
    return node[key];
  }, object);
  parent[last] = value;
  return object;
}

/* ------------------------------------------------------------------ */
/* Starting values                                                     */
/* ------------------------------------------------------------------ */

const copy = (value) => (Array.isArray(value) ? value.slice() : value);

/** A fresh contract at the starting values, with the given id and name. */
export function makeContract(id, name, patch = {}) {
  const out = { id, name };
  CONTRACT_FIELDS.filter((field) => field.key && field.key !== 'name')
    .forEach((field) => { out[field.key] = copy(field.value); });
  return Object.assign(out, patch);
}

/**
 * The shapes a reader is most likely to want to line up against each other.
 * "Add a contract" offers these, so a second contract is one click, not
 * fourteen fields.
 */
export const CONTRACT_PRESETS = [
  {
    id: 'level',
    label: 'Single pay, level',
    blurb: 'Paid in full. It pays the full grown amount from year 1.',
    patch: {},
  },
  {
    id: 'tenPayGraded',
    label: '10-pay, graded',
    blurb: 'Ten premiums, a part of the amount in the early years, growth held to paid-up.',
    patch: {
      payments: 10,
      annualPremium: 1055,
      growthStartsAtPaidUp: true,
      benefitMode: 'percentOfFace',
      waitingSchedule: [0.4, 0.7],
      waitingYears: 2,
      firstYearCommission: 0.2,
      renewalCommission: 0.02,
    },
  },
  {
    id: 'guaranteedIssue',
    label: 'Guaranteed issue',
    blurb: 'No underwriting. In the early years it returns the premiums paid, with interest.',
    patch: {
      benefitMode: 'returnOfPremium',
      waitingYears: 2,
      ropInterest: 0.07,
      growthRate: 0.01,
    },
  },
  {
    id: 'threePay',
    label: '3-pay, level',
    blurb: 'Three premiums, the full amount from year 1, growth from the start.',
    patch: {
      payments: 3,
      annualPremium: 3400,
      firstYearCommission: 0.15,
      renewalCommission: 0.05,
    },
  },
];

/** A fresh copy of the starting values. A note holds no value. */
export function defaults() {
  const out = {};
  BASE_PANELS.flatMap((panel) => panel.fields)
    .filter((field) => field.path)
    .forEach((field) => { setPath(out, field.path, copy(field.value)); });
  out.contracts = [makeContract('c1', 'Single pay, level')];
  return out;
}

/**
 * A contract id that no current contract holds. The id is what a colour, a
 * chart line and a saved answer are keyed on, so it must never be reused.
 */
export function nextContractId(contracts) {
  const taken = new Set(contracts.map((c) => c.id));
  for (let n = 1; n <= MAX_CONTRACTS * 4 + 1; n += 1) {
    if (!taken.has(`c${n}`)) return `c${n}`;
  }
  return `c${Date.now()}`;
}

/** A name no current contract holds, built from the label the reader picked. */
export function nextContractName(contracts, label) {
  const taken = new Set(contracts.map((c) => c.name));
  if (!taken.has(label)) return label;
  for (let n = 2; n <= 99; n += 1) {
    if (!taken.has(`${label} ${n}`)) return `${label} ${n}`;
  }
  return label;
}

/** The fields a given input object should show. */
export function visibleFields(values) {
  return fieldsFor(values).filter((field) => !field.showWhen || field.showWhen(values));
}
