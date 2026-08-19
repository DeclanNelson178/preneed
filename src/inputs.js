/**
 * The field list: labels, starting values, status marks and where each number
 * comes from. Section 3 of plan.md. Every mark here is shown on screen.
 *
 * This file holds no DOM code. `test/golden.test.js` imports it.
 *
 * Rule for this project: no number enters the code without a line in
 * `docs/SOURCES.md`. The starting values below are working defaults so the
 * dashboard opens with a complete picture. Every one of them is marked. He
 * replaces them with his own.
 */

export const STATUS = {
  sourced: {
    label: 'SOURCED',
    note: 'A primary source was read and cited.',
  },
  weak: {
    label: 'WEAK',
    note: 'Only a trade or secondary source. Use it to start, then replace it.',
  },
  unsourced: {
    label: 'UNSOURCED',
    note: 'No source found. Get it from the carrier product sheet.',
  },
  hisData: {
    label: 'YOUR DATA',
    note: 'Only your statement, your price list or your accountant gives this.',
  },
  choice: {
    label: 'CHOICE',
    note: 'A setting on the contract, not a measurement.',
  },
};

export const BENEFIT_MODE_OPTIONS = [
  {
    value: 'fullFace',
    label: 'Full face',
    help: 'The policy pays the grown face amount from day one. This is the level-benefit product.',
  },
  {
    value: 'percentOfFace',
    label: 'Percent of face',
    help: 'During the waiting period the policy pays a percent of the face amount.',
  },
  {
    value: 'returnOfPremium',
    label: 'Return of premium plus interest',
    help: 'During the waiting period the policy returns the premiums paid, with interest.',
  },
  {
    value: 'faceLessUnpaid',
    label: 'Face less unpaid premiums',
    help: 'The policy deducts the remaining scheduled premiums. DOUBTFUL. No carrier has confirmed it.',
  },
];

export const PAY_PLAN_OPTIONS = [
  { value: 1, label: 'Paid in full' },
  { value: 3, label: '3 years' },
  { value: 5, label: '5 years' },
  { value: 10, label: '10 years' },
];

/**
 * Three panels, so he never sees all of the fields at once.
 *
 * Each field:
 *   path     dotted path into the input object
 *   kind     currency | percent | years | select | toggle | percentList
 *   value    the starting value, in model units (a percent is a fraction)
 *   status   a key of STATUS
 *   source   where he gets the real number
 *   showWhen optional test against the current input object
 */
export const PANELS = [
  {
    id: 'contract',
    title: 'The contract',
    lede: 'What you guaranteed, and what it will cost you to keep the promise.',
    fields: [
      {
        path: 'price',
        label: 'Contract price',
        kind: 'currency',
        value: 9170,
        step: 100,
        min: 0,
        status: 'weak',
        source: 'Your general price list. This is also the face amount at issue.',
      },
      {
        path: 'inflation',
        label: 'Funeral inflation rate',
        kind: 'percent',
        value: 0.046,
        step: 0.1,
        min: -20,
        max: 30,
        status: 'weak',
        source: 'Your own price history, or the BLS funeral services index.',
      },
      {
        path: 'deliveryPercent',
        label: 'Cost to deliver, as a percent of price',
        kind: 'percent',
        value: 1,
        step: 1,
        min: 0,
        max: 100,
        status: 'hisData',
        source:
          'Your accountant. Leave it at 100% to ask whether the money covers the bill. '
          + 'Lower it to ask what you keep.',
      },
    ],
  },
  {
    id: 'trust',
    title: 'The trust option',
    lede:
      '239 CMR 4.08 sends the whole price to the bank within five business days. '
      + 'You keep nothing at the sale, and you are paid no commission.',
    fields: [
      {
        path: 'trust.grossReturn',
        label: 'Trust gross rate of return',
        kind: 'percent',
        value: 0.055,
        step: 0.1,
        min: -20,
        max: 30,
        status: 'hisData',
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
        status: 'hisData',
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
        status: 'hisData',
        source: 'The trustee: tax paid divided by income earned. Enter zero for a grantor trust.',
      },
    ],
  },
  {
    id: 'insurance',
    title: 'The insurance option',
    lede:
      'The policy pays the benefit. You keep the commission, taxed as business '
      + 'income, then compounded at the same net rate as the trust.',
    fields: [
      {
        path: 'insurance.payments',
        label: 'Number of premium payments',
        kind: 'select',
        value: 1,
        options: PAY_PLAN_OPTIONS,
        status: 'choice',
        source: 'The contract.',
      },
      {
        path: 'insurance.annualPremium',
        label: 'Annual premium',
        kind: 'currency',
        value: 9170,
        step: 100,
        min: 0,
        status: 'hisData',
        source:
          'The carrier illustration. On a multi-pay plan the premiums total more '
          + 'than the face amount. Do not divide the price.',
      },
      {
        path: 'insurance.growthRate',
        label: 'Policy growth rate',
        kind: 'percent',
        value: 0.02,
        step: 0.1,
        min: -10,
        max: 20,
        status: 'unsourced',
        source: 'The carrier product sheet.',
      },
      {
        path: 'insurance.growthStartsAtPaidUp',
        label: 'Growth starts only at paid-up',
        kind: 'toggle',
        value: false,
        status: 'unsourced',
        source:
          'Ask the carrier: does the face amount grow during the pay period, or only '
          + 'after the policy is paid up? On a 10-pay plan this removes ten years of compounding.',
      },
      {
        path: 'insurance.benefitMode',
        label: 'Death benefit before the policy matures',
        kind: 'select',
        value: 'fullFace',
        options: BENEFIT_MODE_OPTIONS,
        status: 'unsourced',
        source: 'The carrier product sheet. The four modes are mutually exclusive.',
      },
      {
        path: 'insurance.waitingYears',
        label: 'Waiting period',
        kind: 'years',
        value: 2,
        step: 1,
        min: 0,
        max: 10,
        status: 'unsourced',
        source: 'The carrier product sheet.',
        showWhen: (v) => v.insurance.benefitMode === 'percentOfFace'
          || v.insurance.benefitMode === 'returnOfPremium',
      },
      {
        path: 'insurance.waitingSchedule',
        label: 'Percent of face paid in each waiting year',
        kind: 'percentList',
        value: [0.4, 0.7],
        status: 'unsourced',
        source:
          'The carrier product sheet. Year 1 first. 40 and 70 is folklore until a '
          + 'carrier document confirms it.',
        showWhen: (v) => v.insurance.benefitMode === 'percentOfFace',
      },
      {
        path: 'insurance.ropInterest',
        label: 'Interest on returned premiums',
        kind: 'percent',
        value: 0.07,
        step: 0.5,
        min: 0,
        max: 30,
        status: 'unsourced',
        source: 'The carrier product sheet. Often 5% to 10%. The interest is applied once.',
        showWhen: (v) => v.insurance.benefitMode === 'returnOfPremium',
      },
      {
        path: 'insurance.businessTaxRate',
        label: 'Business income tax rate',
        kind: 'percent',
        value: 0.3,
        step: 1,
        min: 0,
        max: 60,
        status: 'hisData',
        source: 'Your accountant. The rate depends on how the business is organised.',
      },
      {
        path: 'insurance.firstYearCommission',
        label: 'First-year commission rate',
        kind: 'percent',
        value: 0.12,
        step: 0.5,
        min: 0,
        max: 100,
        status: 'weak',
        source: 'Your carrier commission schedule. Set it equal to the renewal rate for an as-earned schedule.',
      },
      {
        path: 'insurance.renewalCommission',
        label: 'Renewal commission rate',
        kind: 'percent',
        value: 0.03,
        step: 0.5,
        min: 0,
        max: 100,
        status: 'weak',
        source: 'Your carrier commission schedule. Set it low and the first-year rate high for a heaped schedule.',
        showWhen: (v) => v.insurance.payments > 1,
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

/** A fresh copy of the starting values. */
export function defaults() {
  const out = {};
  FIELDS.forEach((field) => {
    setPath(out, field.path, Array.isArray(field.value) ? field.value.slice() : field.value);
  });
  return out;
}

/** The fields a given input object should show. */
export function visibleFields(values) {
  return FIELDS.filter((field) => !field.showWhen || field.showWhen(values));
}
