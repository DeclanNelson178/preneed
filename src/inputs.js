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
 * Three panels, so you never see all of the fields at once.
 *
 * Each field:
 *   path     dotted path into the input object
 *   id       a note has this in the place of a path
 *   kind     currency | percent | years | choice | toggle | percentRows | note
 *   value    the starting value, in model units (a percent is a fraction)
 *   source   where you get the real number
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
  {
    id: 'insurance',
    title: 'The insurance option',
    lede: 'The policy terms, and the commission you keep.',
    fields: [
      /* ---- the policy ---- */
      {
        path: 'insurance.payments',
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
        path: 'insurance.annualPremium',
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
        path: 'insurance.growthRate',
        label: 'The amount grows each year',
        kind: 'percent',
        value: 0.02,
        step: 0.1,
        min: -10,
        max: 20,
        source: 'From the carrier product sheet.',
      },
      {
        path: 'insurance.growthStartsAtPaidUp',
        label: 'The growth starts',
        kind: 'choice',
        value: false,
        options: GROWTH_START_OPTIONS,
        showWhen: multiPay,
        source: 'From the carrier. On a 10-year plan, this choice can remove ten years of growth.',
      },
      {
        path: 'insurance.benefitMode',
        label: 'If the customer dies in the first years, the policy pays',
        kind: 'choice',
        value: 'fullFace',
        options: BENEFIT_MODE_OPTIONS,
        source: 'From the carrier product sheet. Pick one shape only. They cannot be mixed.',
      },
      {
        path: 'insurance.waitingSchedule',
        label: 'What it pays in each early year',
        kind: 'percentRows',
        value: [0.4, 0.7],
        showWhen: graded,
        source:
          'From the carrier product sheet. Add one row for each year that pays a '
          + 'part. The 40 and 70 values are placeholders. Replace them.',
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
        source: 'From the carrier product sheet.',
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
        source: 'From the carrier product sheet. Usually 5% to 10%. It is applied once.',
      },
      {
        id: 'full-amount-from',
        kind: 'note',
        showWhen: (v) => graded(v) || moneyBack(v),
      },
      /* ---- what you keep ---- */
      {
        path: 'insurance.firstYearCommission',
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
        path: 'insurance.renewalCommission',
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
        path: 'insurance.businessTaxRate',
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
