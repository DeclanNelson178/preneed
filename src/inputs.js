/**
 * The field list: labels, starting values and where each number comes from.
 * Section 3 of plan.md.
 *
 * This file holds no DOM code. `test/golden.test.js` imports it.
 *
 * The starting values below are working defaults, so the dashboard opens with
 * a complete picture. He replaces them with his own.
 *
 * Field kinds:
 *   currency percent years   a number, with a unit
 *   choice                   a row of buttons. One answer.
 *   percentRows              one percent for each early year. The count of the
 *                            rows gives the length of the waiting period.
 *   note                     a computed line. It holds no value of its own.
 *
 * A note has an `id` and no `path`, because the user cannot type into it.
 */

export const BENEFIT_MODE_OPTIONS = [
  {
    value: 'fullFace',
    label: 'The full amount',
    help: 'A level policy. It pays the whole grown amount from day one.',
  },
  {
    value: 'percentOfFace',
    label: 'A part of it',
    help: 'A graded policy. It pays a percent of the amount in the early years.',
  },
  {
    value: 'returnOfPremium',
    label: 'The money back, with interest',
    help: 'A guaranteed-issue policy. In the early years it returns the premiums paid, with interest.',
  },
  {
    value: 'faceLessUnpaid',
    label: 'The full amount, less the premiums not yet paid',
    help: 'DOUBTFUL. No carrier document confirms this shape.',
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
 * The values that another answer already gives. He never types these.
 *
 * 1. He pays in full, so the single premium is the price he charges. The
 *    contract price is also the face amount at issue, so the two are one
 *    number. Two fields for one number can disagree. One cannot.
 * 2. He pays in full, so there is no pay period to wait for. The growth
 *    starts at the start.
 * 3. A graded policy lists one percent for each early year. The count of
 *    those years is the waiting period. He gives it once.
 *
 * The function writes into the object it is given and returns it.
 */
export function deriveValues(values) {
  const ins = values.insurance;
  if (ins.payments === 1) {
    ins.annualPremium = values.price;
    ins.growthStartsAtPaidUp = false;
  }
  if (ins.benefitMode === 'percentOfFace') {
    ins.waitingYears = ins.waitingSchedule.length;
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* The panels                                                          */
/* ------------------------------------------------------------------ */

const paidInFull = (v) => v.insurance.payments === 1;
const multiPay = (v) => v.insurance.payments > 1;
const graded = (v) => v.insurance.benefitMode === 'percentOfFace';
const moneyBack = (v) => v.insurance.benefitMode === 'returnOfPremium';

/**
 * Three panels, so he never sees all of the fields at once.
 *
 * Each field:
 *   path     dotted path into the input object
 *   id       a note has this in the place of a path
 *   kind     currency | percent | years | choice | toggle | percentRows | note
 *   value    the starting value, in model units (a percent is a fraction)
 *   source   where he gets the real number
 *   group    an optional heading above the field
 *   showWhen optional test against the current input object
 */
export const PANELS = [
  {
    id: 'contract',
    title: 'The contract',
    lede: 'The price you guaranteed, and how fast funeral prices rise.',
    fields: [
      {
        path: 'price',
        label: 'Contract price',
        kind: 'currency',
        value: 9170,
        step: 100,
        min: 0,
        source:
          'The guaranteed price on your general price list. It is the whole bill '
          + 'at death, and it is also the face amount at issue.',
      },
      {
        path: 'inflation',
        label: 'Funeral inflation rate',
        kind: 'percent',
        value: 0.046,
        step: 0.1,
        min: -20,
        max: 30,
        source: 'Your own price history, or the BLS funeral services index.',
      },
    ],
  },
  {
    id: 'trust',
    title: 'The trust option',
    lede:
      'The whole price goes to the bank within five business days. You keep '
      + 'nothing at the sale, and you are paid no commission.',
    fields: [
      {
        path: 'trust.grossReturn',
        label: 'Trust gross rate of return',
        kind: 'percent',
        value: 0.055,
        step: 0.1,
        min: -20,
        max: 30,
        source: 'The trustee statement. Ask for the written investment policy and ten years of actual return.',
      },
      {
        path: 'trust.fees',
        label: 'Trust fees',
        kind: 'percent',
        value: 0.0075,
        step: 0.05,
        min: 0,
        max: 10,
        source: 'The trustee statement. All-in: the trustee fee plus administration.',
      },
      {
        path: 'trust.taxRate',
        label: 'Trust effective tax rate',
        kind: 'percent',
        value: 0.15,
        step: 1,
        min: 0,
        max: 60,
        source: 'The trustee: tax paid divided by income earned. Enter zero for a grantor trust.',
      },
    ],
  },
  {
    id: 'insurance',
    title: 'The insurance option',
    lede: 'Answer the two questions. The page then asks only what the policy you picked needs.',
    fields: [
      /* ---- the policy ---- */
      {
        path: 'insurance.payments',
        label: 'How does he pay?',
        kind: 'choice',
        value: 1,
        options: PAY_PLAN_OPTIONS,
        group: 'The policy',
        source: 'The contract.',
      },
      {
        id: 'single-premium',
        kind: 'note',
        showWhen: paidInFull,
        source: 'He pays the price once, so the premium is the price. There is nothing to type.',
      },
      {
        path: 'insurance.annualPremium',
        label: 'Premium each year',
        kind: 'currency',
        value: 9170,
        step: 100,
        min: 0,
        showWhen: multiPay,
        source:
          'The carrier illustration. On a multi-pay plan the premiums total more '
          + 'than the price. Do not divide the price.',
      },
      {
        id: 'premium-check',
        kind: 'note',
        showWhen: multiPay,
      },
      {
        path: 'insurance.growthRate',
        label: 'The amount grows, each year',
        kind: 'percent',
        value: 0.02,
        step: 0.1,
        min: -10,
        max: 20,
        source: 'The carrier product sheet.',
      },
      {
        path: 'insurance.growthStartsAtPaidUp',
        label: 'The growth starts',
        kind: 'choice',
        value: false,
        options: GROWTH_START_OPTIONS,
        showWhen: multiPay,
        source:
          'Ask the carrier: does the amount grow during the pay period, or only '
          + 'after the policy is paid up? On a 10-year plan this removes ten years of growth.',
      },
      {
        path: 'insurance.benefitMode',
        label: 'If he dies in the first years, the policy pays',
        kind: 'choice',
        value: 'fullFace',
        options: BENEFIT_MODE_OPTIONS,
        source: 'The carrier product sheet. One shape only. The four cannot be mixed.',
      },
      {
        path: 'insurance.waitingSchedule',
        label: 'What it pays in each early year',
        kind: 'percentRows',
        value: [0.4, 0.7],
        showWhen: graded,
        source:
          'The carrier product sheet. Add one year for each year the policy pays a part. '
          + '40 and 70 is folklore until a carrier document confirms it.',
      },
      {
        path: 'insurance.waitingYears',
        label: 'The money-back period lasts',
        kind: 'years',
        value: 2,
        step: 1,
        min: 0,
        max: 10,
        showWhen: moneyBack,
        source: 'The carrier product sheet.',
      },
      {
        path: 'insurance.ropInterest',
        label: 'Interest added to the money paid back',
        kind: 'percent',
        value: 0.07,
        step: 0.5,
        min: 0,
        max: 30,
        showWhen: moneyBack,
        source: 'The carrier product sheet. Often 5% to 10%. The interest is applied once.',
      },
      {
        id: 'full-amount-from',
        kind: 'note',
        showWhen: (v) => graded(v) || moneyBack(v),
      },
      /* ---- what you keep ---- */
      {
        path: 'insurance.firstYearCommission',
        label: 'You get, on the first payment',
        kind: 'percent',
        value: 0.12,
        step: 0.5,
        min: 0,
        max: 100,
        group: 'What you keep',
        source: 'Your carrier commission schedule.',
      },
      {
        path: 'insurance.renewalCommission',
        label: 'You get, on the later payments',
        kind: 'percent',
        value: 0.03,
        step: 0.5,
        min: 0,
        max: 100,
        showWhen: multiPay,
        source:
          'Your carrier commission schedule. Set this equal to the first-year rate '
          + 'for an as-earned schedule. Set it low for a heaped schedule.',
      },
      {
        path: 'insurance.businessTaxRate',
        label: 'Your business income tax rate',
        kind: 'percent',
        value: 0.3,
        step: 1,
        min: 0,
        max: 60,
        source: 'Your accountant. The rate depends on how the business is organised.',
      },
      {
        id: 'commission-growth',
        kind: 'note',
      },
    ],
  },
];

/** Every field, in panel order. */
export const FIELDS = PANELS.flatMap((panel) =>
  panel.fields.map((field) => ({ ...field, panel: panel.id })));

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

/** A fresh copy of the starting values. A note holds no value. */
export function defaults() {
  const out = {};
  FIELDS.filter((field) => field.path).forEach((field) => {
    setPath(out, field.path, Array.isArray(field.value) ? field.value.slice() : field.value);
  });
  return out;
}

/** The fields a given input object should show. */
export function visibleFields(values) {
  return FIELDS.filter((field) => !field.showWhen || field.showWhen(values));
}
