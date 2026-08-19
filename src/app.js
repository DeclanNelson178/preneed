/**
 * The dashboard. It holds the input state, calls the model, and draws.
 * All of the arithmetic lives in src/model.js. All of the field definitions
 * live in src/inputs.js. All of the drawing lives in src/chart.js.
 */

import {
  HORIZON, project, growthYears, waitingPercent, commissionPayment,
} from './model.js';
import {
  PANELS, MAX_WAITING_ROWS, defaults, deriveValues, getPath, setPath,
} from './inputs.js';
import { lineChart, yearRail } from './chart.js';

const STORE_KEY = 'preneed.inputs.v1';
const THEME_KEY = 'preneed.theme.v1';
const MINUS = '−';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const compactFmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});

const money = (n) => (Number.isFinite(n)
  ? (n < 0 ? MINUS + moneyFmt.format(-n) : moneyFmt.format(n))
  : '—');

const moneyTick = (n) => (n < 0 ? MINUS + compactFmt.format(-n) : compactFmt.format(n));

/** Percent fields are held as fractions and shown as percents. */
const toPercentInput = (fraction) => Math.round(fraction * 1e6) / 1e4;
const fromPercentInput = (value) => value / 100;

/** A rate, for the reader: 0.03925 becomes 3.925%. */
const pct = (fraction) => `${toPercentInput(fraction)}%`;

/** A growth factor, for the reader. Four places, so nothing hides. */
const times = (factor) => (Number.isFinite(factor) ? `× ${factor.toFixed(4)}` : '—');

const years = (n) => (n === 1 ? '1 year' : `${n} years`);

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const ratioOf = (v) => (v.price > 0 ? v.insurance.annualPremium / v.price : 1);

let values = deriveValues(load());
let selectedYear = 10;

/**
 * The premium on a multi-pay illustration is not a function of the price, but
 * it does move with it. We hold the ratio of the last premium you typed, and
 * we keep that ratio when the price changes. You see that it moved.
 */
let premiumRatio = ratioOf(values);
let premiumMoved = false;

/** Every built field, by path, or by id for a note. */
const items = new Map();

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      // Overlay the saved values field by field, so a new field keeps its default.
      PANELS.flatMap((panel) => panel.fields)
        .filter((field) => field.path)
        .forEach((field) => {
          const saved_ = getPath(saved, field.path);
          if (saved_ !== undefined) setPath(base, field.path, saved_);
        });
    }
  } catch {
    // A broken store is not worth an error message. Start from the defaults.
  }
  return base;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(values));
  } catch {
    // Private browsing. The dashboard still works, it just forgets.
  }
}

/* ------------------------------------------------------------------ */
/* Building the input panels                                           */
/* ------------------------------------------------------------------ */

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.setAttribute('style', value);
    else if (key === 'text') node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
};

/** The lines the page computes for you. You type none of these. */
const NOTES = {
  'single-premium': (result) => ({
    text: `Single premium ${money(result.inputs.insurance.annualPremium)}. `
      + 'It goes to the carrier once.',
  }),

  'premium-check': (result) => {
    const ins = result.inputs.insurance;
    const total = ins.annualPremium * ins.payments;
    const ratio = result.inputs.price > 0 ? total / result.inputs.price : 0;
    return {
      text: `${ins.payments} payments of ${money(ins.annualPremium)} come to `
        + `${money(total)}. That is ${ratio.toFixed(2)} times the price.`
        + (premiumMoved ? ' The premium moved with the price. Check the illustration.' : ''),
      flag: ratio <= 1,
    };
  },

  'full-amount-from': (result) => ({
    text: `The full amount is paid from year ${result.inputs.insurance.waitingYears + 1}.`,
  }),

  'commission-growth': (result) => ({
    text: `What is left grows at ${pct(result.netTrustRate)} each year. `
      + 'This is the same net rate as the trust.',
  }),
};

function buildNote(field, wrapper) {
  const line = el('p', { class: 'readout' });
  wrapper.appendChild(line);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));
  return {
    update: (result) => {
      const note = NOTES[field.id](result);
      line.textContent = note.text;
      line.dataset.flag = note.flag ? 'check' : '';
    },
  };
}

/** A row of buttons. One answer. An unconfirmed shape hides behind "Other". */
function buildChoice(field, wrapper, id) {
  const group = el('fieldset', { class: 'choice' }, [el('legend', { text: field.label })]);
  const row = el('div', { class: 'choice-row' });
  group.appendChild(row);

  const plain = field.options.filter((option) => !option.advanced);
  const advanced = field.options.filter((option) => option.advanced);
  let more = null;

  const button = (option) => {
    const optionId = `${id}-${String(option.value)}`;
    const input = el('input', {
      type: 'radio', name: id, id: optionId, value: String(option.value),
    });
    const label = el('label', { class: 'opt', htmlFor: optionId }, [
      input, el('span', { text: option.label }),
    ]);
    if (option.help) label.title = option.help;
    return label;
  };

  plain.forEach((option) => row.appendChild(button(option)));

  if (advanced.length) {
    more = el('details', { class: 'choice-more' }, [el('summary', { text: 'Other shapes' })]);
    advanced.forEach((option) => {
      more.appendChild(el('div', { class: 'choice-row' }, [button(option)]));
      if (option.help) more.appendChild(el('p', { class: 'field-source', text: option.help }));
    });
    group.appendChild(more);
  }

  wrapper.appendChild(group);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));

  const optionFor = (raw) => field.options.find((option) => String(option.value) === raw);

  return {
    read: () => {
      const checked = group.querySelector('input:checked');
      const option = checked ? optionFor(checked.value) : null;
      return option ? option.value : field.value;
    },
    write: () => {
      const current = String(getPath(values, field.path));
      group.querySelectorAll('input').forEach((input) => {
        input.checked = input.value === current;
      });
      // Open the other shapes only when one of them is the answer.
      if (more) more.open = Boolean(optionFor(current)?.advanced);
    },
  };
}

/**
 * One percent for each early year. The count of the rows is the length of the
 * waiting period, so you give that length once, by adding or removing a year.
 */
function buildPercentRows(field, wrapper, id, onChange) {
  wrapper.appendChild(el('div', { class: 'field-head' }, [
    el('label', { htmlFor: `${id}-1`, text: field.label }),
  ]));
  const list = el('div', { class: 'rows' });
  const buttons = el('div', { class: 'row-buttons' });
  wrapper.appendChild(list);
  wrapper.appendChild(buttons);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));

  const schedule = () => getPath(values, field.path);

  const rebuild = () => {
    const rows = schedule().map((percent, index) => el('div', { class: 'row' }, [
      el('span', { class: 'row-year', text: `Year ${index + 1}` }),
      el('div', { class: 'control' }, [
        el('input', {
          type: 'number',
          id: `${id}-${index + 1}`,
          inputMode: 'decimal',
          step: '1',
          min: '0',
          max: '100',
          value: String(toPercentInput(percent)),
        }),
        el('span', { class: 'affix', text: '%' }),
      ]),
    ]));
    list.replaceChildren(...rows);

    const count = rows.length;
    const controls = [];
    if (count < MAX_WAITING_ROWS) {
      controls.push(el('button', { type: 'button', class: 'row-button', text: `Add year ${count + 1}` }));
      controls[controls.length - 1].addEventListener('click', () => {
        const next = schedule().slice();
        next.push(next.length ? next[next.length - 1] : 0.4);
        setPath(values, field.path, next);
        rebuild();
        onChange(field.path);
      });
    }
    if (count > 1) {
      controls.push(el('button', { type: 'button', class: 'row-button', text: `Remove year ${count}` }));
      controls[controls.length - 1].addEventListener('click', () => {
        setPath(values, field.path, schedule().slice(0, -1));
        rebuild();
        onChange(field.path);
      });
    }
    buttons.replaceChildren(...controls);
  };

  return {
    read: () => [...list.querySelectorAll('input')].map((input) => {
      const n = parseFloat(input.value);
      return fromPercentInput(Number.isFinite(n) ? n : 0);
    }),
    write: rebuild,
  };
}

/** A number, with a unit. */
function buildNumber(field, wrapper, id) {
  wrapper.appendChild(el('div', { class: 'field-head' }, [
    el('label', { htmlFor: id, text: field.label }),
  ]));

  const control = el('div', { class: 'control' });
  if (field.kind === 'currency') control.appendChild(el('span', { class: 'affix', text: '$' }));
  const input = el('input', {
    type: 'number', id, inputMode: 'decimal', step: String(field.step ?? 1),
  });
  if (field.min !== undefined) input.min = String(field.min);
  if (field.max !== undefined) input.max = String(field.max);
  control.appendChild(input);
  if (field.kind === 'percent') control.appendChild(el('span', { class: 'affix', text: '%' }));
  if (field.kind === 'years') control.appendChild(el('span', { class: 'affix', text: 'years' }));
  wrapper.appendChild(control);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));

  return {
    read: () => {
      const n = parseFloat(input.value);
      const value = Number.isFinite(n) ? n : 0;
      return field.kind === 'percent' ? fromPercentInput(value) : value;
    },
    write: () => {
      const raw = getPath(values, field.path);
      input.value = String(field.kind === 'percent' ? toPercentInput(raw) : raw);
    },
  };
}

function buildField(field, onChange) {
  const key = field.path || field.id;
  const id = `f-${key.replace(/\./g, '-')}`;
  const wrapper = el('div', { class: field.kind === 'note' ? 'field field--note' : 'field' });
  wrapper.dataset.field = key;

  let parts;
  if (field.kind === 'note') parts = buildNote(field, wrapper);
  else if (field.kind === 'choice') parts = buildChoice(field, wrapper, id);
  else if (field.kind === 'percentRows') parts = buildPercentRows(field, wrapper, id, onChange);
  else parts = buildNumber(field, wrapper, id);

  items.set(key, { field, wrapper, ...parts });
  return wrapper;
}

function buildPanels(onChange) {
  const form = document.getElementById('panels');
  const wide = window.matchMedia('(min-width: 1060px)').matches;

  PANELS.forEach((panel, index) => {
    const details = el('details', { class: 'panel', open: wide || index === 0 });
    details.appendChild(el('summary', {}, [
      el('h2', { text: panel.title }),
      el('p', { text: panel.lede }),
    ]));

    const body = el('div', { class: 'panel-body' });
    let group = null;
    panel.fields.forEach((field) => {
      if (field.group && field.group !== group) {
        group = field.group;
        body.appendChild(el('p', { class: 'group-head', text: group }));
      }
      body.appendChild(buildField(field, onChange));
    });
    details.appendChild(body);
    form.appendChild(details);
  });
}

/** Write the state into the controls. Called on load and on reset. */
function writeControls() {
  items.forEach((item) => { if (item.write) item.write(); });
}

/** Show only the fields the current answers make relevant, and fill the notes. */
function updateFields(result) {
  items.forEach((item) => {
    item.wrapper.hidden = Boolean(item.field.showWhen) && !item.field.showWhen(values);
    if (item.update) item.update(result);
  });
}

/** Move to the field behind a number, and open whatever hides it. */
const smooth = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

function focusField(path) {
  const item = items.get(path);
  if (!item) return;
  item.wrapper.closest('details.panel')?.setAttribute('open', '');
  item.wrapper.closest('details.choice-more')?.setAttribute('open', '');
  item.wrapper.scrollIntoView({ block: 'center', behavior: smooth });
  item.wrapper.querySelector('input, select')?.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/**
 * columns = [{ label, get(row) -> string, sign(row) -> 'loss'|null, rule: boolean }]
 */
function renderTable(host, rows, columns) {
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach((column) => {
    headRow.appendChild(el('th', {
      scope: 'col', text: column.label, class: column.rule ? 'rule-col' : '',
    }));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.forEach((row) => {
    const tr = el('tr');
    tr.dataset.year = String(row.year);
    if (row.year === selectedYear) tr.dataset.selected = 'true';
    columns.forEach((column) => {
      const td = el('td', { text: column.get(row), class: column.rule ? 'rule-col' : '' });
      const sign = column.sign ? column.sign(row) : null;
      if (sign) td.dataset.sign = sign;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  host.replaceChildren(table);
}

const yearColumn = { label: 'Year', get: (row) => String(row.year) };
const lossSign = (pick) => (row) => (pick(row) < 0 ? 'loss' : null);

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

const hostOf = (id) => document.getElementById(id).querySelector('.viz-host');
const legendOf = (id) => document.getElementById(id).querySelector('.legend');
const tableOf = (id) => document.getElementById(id).querySelector('.table-wrap');

function renderLegend(host, entries) {
  host.replaceChildren(...entries.map((entry) => el('span', {}, [
    el('i', entry.kind === 'rule'
      ? { 'data-kind': 'rule' }
      : { style: `background:var(${entry.colorVar})` }),
    document.createTextNode(entry.label),
  ])));
}

const seriesLegend = [
  { label: 'Trust', colorVar: '--trust' },
  { label: 'Insurance', colorVar: '--ins' },
];

let charts = null;
let rail = null;

function pickYear(year) {
  selectedYear = Math.min(HORIZON, Math.max(1, year));
  render();
}

function buildCharts(result) {
  const shared = { horizon: result.horizon, selected: selectedYear, onPickYear: pickYear };

  rail = yearRail(document.getElementById('rail'), {
    horizon: result.horizon,
    selected: selectedYear,
    onSelect: pickYear,
    bands: railBands(result),
  });

  charts = {
    margin: lineChart(hostOf('fig-margin'), {
      ...shared,
      series: marginSeries(result),
      lossBelowZero: true,
      format: money,
      formatTick: moneyTick,
      ariaLabel: 'Margin by year of death, for the trust option and the insurance option.',
    }),
    money: lineChart(hostOf('fig-money'), {
      ...shared,
      series: moneySeries(result),
      threshold: { label: 'the bill', values: result.rows.map((row) => row.cost) },
      baselineZero: true,
      format: money,
      formatTick: moneyTick,
      ariaLabel: 'Money to the funeral home at death against the cost of the funeral, by year of death.',
    }),
  };

  renderLegend(legendOf('fig-margin'), seriesLegend);
  renderLegend(legendOf('fig-money'), [...seriesLegend, { label: 'Cost of the funeral', kind: 'rule' }]);
}

const marginSeries = (result) => [
  { key: 'trust', label: 'Trust', colorVar: '--trust', values: result.rows.map((r) => r.trust.margin) },
  { key: 'ins', label: 'Insurance', colorVar: '--ins', values: result.rows.map((r) => r.insurance.margin) },
];

const moneySeries = (result) => [
  { key: 'trust', label: 'Trust', colorVar: '--trust', values: result.rows.map((r) => r.trust.total) },
  { key: 'ins', label: 'Insurance', colorVar: '--ins', values: result.rows.map((r) => r.insurance.total) },
];

const railBands = (result) => [
  {
    key: 'trust', label: 'Trust', colorVar: '--trust',
    signs: result.rows.map((row) => row.trust.margin >= 0),
  },
  {
    key: 'insurance', label: 'Insurance', colorVar: '--ins',
    signs: result.rows.map((row) => row.insurance.margin >= 0),
  },
];

/* ------------------------------------------------------------------ */
/* The cards, the verdict and the notes                                */
/* ------------------------------------------------------------------ */

const setText = (id, text) => { document.getElementById(id).textContent = text; };

function renderCards(row) {
  [['trust', row.trust], ['ins', row.insurance]].forEach(([prefix, side]) => {
    const marginNode = document.getElementById(`${prefix}-margin`);
    marginNode.textContent = money(side.margin);
    marginNode.dataset.sign = side.margin < 0 ? 'loss' : 'gain';
    setText(`${prefix}-margin-word`, side.margin < 0 ? 'loss' : 'surplus');
    setText(`${prefix}-margin-year`, String(row.year));
    setText(`${prefix}-total`, money(side.total));
    setText(`${prefix}-cost`, money(row.cost));
  });
  setText('ins-benefit', money(row.insurance.funds));
  setText('ins-commission', money(row.insurance.commission));
}

function renderVerdict(result, row) {
  const lead = row.insurance.total - row.trust.total;
  const first = lead === 0
    ? `In year ${row.year} the two options are level.`
    : lead > 0
      ? `In year ${row.year} insurance leaves you ${money(lead)} more than the trust.`
      : `In year ${row.year} the trust leaves you ${money(-lead)} more than insurance.`;

  const shortfall = (name, year) => (year === null
    ? `${name} covers the bill in every year to ${result.horizon}`
    : `${name} falls short from year ${year}`);

  const second = `${shortfall('The trust', result.summary.trustFirstLossYear)}, `
    + `and ${shortfall('insurance', result.summary.insuranceFirstLossYear).toLowerCase()}.`;

  document.getElementById('verdict').replaceChildren(
    el('p', { class: 'verdict-lead', text: first }),
    el('p', { class: 'verdict-sub', text: second.charAt(0).toUpperCase() + second.slice(1) }),
  );
}

function renderWarnings(result) {
  const host = document.getElementById('warnings');
  host.replaceChildren(...result.warnings.map((line) => el('li', { class: 'note', text: line })));
}

function renderPlanChip(result) {
  const n = result.inputs.insurance.payments;
  setText('ins-plan', n === 1 ? 'paid in full' : `${n}-year plan`);
}

/* ------------------------------------------------------------------ */
/* How we made these numbers                                           */
/* ------------------------------------------------------------------ */

/**
 * Every step of the arithmetic for the selected year, in your own numbers.
 * A step is { parts, value, kind }. A part is a string, or { path, text } for
 * a number you can change. Nothing here computes a result: each value comes
 * from the model, or from one multiplication the reader can check by eye.
 */
const step = (parts, value, kind = 'step') => ({ parts, value, kind });
const link = (path, text) => ({ path, text });

function billSteps(result, row) {
  const { price, inflation } = result.inputs;
  return [
    step([link('price', 'Contract price')], money(price)),
    step(['It grows ', link('inflation', pct(inflation)), ` each year, for ${years(row.year)}`],
      times(Math.pow(1 + inflation, row.year))),
    step(['The bill in year ' + row.year], money(row.cost), 'total'),
  ];
}

function trustSteps(result, row) {
  const { price } = result.inputs;
  const net = result.netTrustRate;
  return [
    step([link('price', 'Money in at the start')], money(price)),
    step([link('trust.netReturn', 'Net rate, after fees and tax')], pct(net), 'sub'),
    step([`It grows for ${years(row.year)}`], times(Math.pow(1 + net, row.year))),
    step(['Commission on a trust sale, by 239 CMR 4.08'], money(0)),
    step(['Total to you'], money(row.trust.total), 'total'),
    step(['Less the bill'], MINUS + money(row.cost)),
    step(['Margin'], money(row.trust.margin), 'margin'),
  ];
}

/** The benefit, in the shape you picked. Only the shape you picked. */
function benefitSteps(result, row) {
  const { price, insurance: ins } = result.inputs;
  const t = row.year;
  const early = t <= ins.waitingYears;
  const grew = growthYears(t, result.inputs);

  const growthStep = () => (grew === 0
    ? step(['It does not grow until it is paid up'], times(1))
    : step([
      'It grows ', link('insurance.growthRate', pct(ins.growthRate)), ` each year, for ${years(grew)}`,
      ...(grew < t ? [', after it is paid up'] : []),
    ], times(Math.pow(1 + ins.growthRate, grew))));

  if (ins.benefitMode === 'percentOfFace' && early) {
    return [
      step([link('price', 'The amount at issue')], money(price)),
      step(['In year ', String(t), ' it pays ',
        link('insurance.waitingSchedule', pct(waitingPercent(t, result.inputs))),
        ' of that amount'], money(row.insurance.funds)),
      step(['The policy pays'], money(row.insurance.funds), 'sub'),
    ];
  }

  if (ins.benefitMode === 'returnOfPremium' && early) {
    const paid = row.insurance.premiumsPaid;
    return [
      step([`Premiums paid by year ${t}`], money(paid)),
      step(['Interest, at ', link('insurance.ropInterest', pct(ins.ropInterest)), ', applied once'],
        `+ ${money(paid * ins.ropInterest)}`),
      step(['The policy pays'], money(row.insurance.funds), 'sub'),
    ];
  }

  if (ins.benefitMode === 'faceLessUnpaid') {
    return [
      step([link('price', 'The amount at issue')], money(price)),
      growthStep(),
      step(['The amount in year ' + t], money(row.insurance.grownFace)),
      step(['Less the premiums not yet paid'], MINUS + money(row.insurance.unpaid)),
      step(['The policy pays'], money(row.insurance.funds), 'sub'),
    ];
  }

  return [
    step([link('price', 'The amount at issue')], money(price)),
    growthStep(),
    step(['The policy pays'], money(row.insurance.funds), 'sub'),
  ];
}

function commissionSteps(result, row) {
  const ins = result.inputs.insurance;
  const net = result.netTrustRate;
  const t = row.year;
  const first = ins.firstYearCommission * ins.annualPremium;
  const out = [];

  if (ins.payments === 1) {
    out.push(step([link('insurance.firstYearCommission', pct(ins.firstYearCommission)), ' of the premium'],
      money(first)));
    out.push(step(['Less business tax, at ',
      link('insurance.businessTaxRate', pct(ins.businessTaxRate))],
    MINUS + money(first * ins.businessTaxRate)));
    out.push(step(['You keep, in year 1'], money(commissionPayment(1, result.inputs)), 'sub'));
    if (t > 1) {
      out.push(step([`It grows at ${pct(net)} for ${years(t - 1)}`],
        times(Math.pow(1 + net, t - 1))));
    }
  } else {
    const later = ins.renewalCommission * ins.annualPremium;
    const paid = Math.min(t, ins.payments);
    const gross = first + later * (paid - 1);
    out.push(step([link('insurance.firstYearCommission', pct(ins.firstYearCommission)),
      ' of the first premium'], money(first)));
    if (paid === 2) {
      out.push(step([link('insurance.renewalCommission', pct(ins.renewalCommission)),
        ' of the other premium'], money(later)));
    } else if (paid > 2) {
      out.push(step([link('insurance.renewalCommission', pct(ins.renewalCommission)),
        ` of each of the other ${paid - 1} premiums`], `${money(later)} each`));
    }
    out.push(step(['Less business tax, at ',
      link('insurance.businessTaxRate', pct(ins.businessTaxRate)), ', on each one'],
    MINUS + money(gross * ins.businessTaxRate)));
    out.push(step([`You keep, by year ${t}`], money(gross * (1 - ins.businessTaxRate)), 'sub'));
    out.push(step([`Each amount grows at ${pct(net)}, to year ${t}`], ''));
  }

  out.push(step(['Commission fund'], money(row.insurance.commission), 'sub'));
  return out;
}

function insuranceSteps(result, row) {
  return [
    ...benefitSteps(result, row),
    ...commissionSteps(result, row),
    step(['Total to you'], money(row.insurance.total), 'total'),
    step(['Less the bill'], MINUS + money(row.cost)),
    step(['Margin'], money(row.insurance.margin), 'margin'),
  ];
}

/** One line for each premium, so the compounding is not a black box. */
function paymentRows(result, row) {
  const ins = result.inputs.insurance;
  const net = result.netTrustRate;
  const last = Math.min(row.year, ins.payments);
  const rows = [];
  for (let k = 1; k <= last; k += 1) {
    const kept = commissionPayment(k, result.inputs);
    rows.push({
      year: k,
      rate: k === 1 ? ins.firstYearCommission : ins.renewalCommission,
      kept,
      grown: kept * Math.pow(1 + net, row.year - k),
    });
  }
  return rows;
}

function renderSteps(steps) {
  return steps.map((entry) => {
    const line = el('div', { class: 'xrow' });
    line.dataset.kind = entry.kind;
    const label = el('span', { class: 'xlabel' });
    entry.parts.forEach((part) => {
      if (typeof part === 'string') {
        label.appendChild(document.createTextNode(part));
      } else {
        const button = el('button', { type: 'button', class: 'xlink', text: part.text });
        button.dataset.goto = part.path;
        label.appendChild(button);
      }
    });
    line.appendChild(label);
    const value = el('span', { class: 'xval num', text: entry.value });
    if (entry.kind === 'margin') value.dataset.sign = entry.value.startsWith(MINUS) ? 'loss' : 'gain';
    line.appendChild(value);
    return line;
  });
}

function renderExplain(result, row) {
  const columns = [
    { title: 'The bill', steps: billSteps(result, row) },
    { title: 'The trust', steps: trustSteps(result, row) },
    { title: 'Insurance', steps: insuranceSteps(result, row) },
  ];

  const nodes = columns.map((column) => el('div', { class: 'xcol' }, [
    el('h3', { text: column.title }),
    el('div', { class: 'xrows' }, renderSteps(column.steps)),
  ]));

  if (result.inputs.insurance.payments > 1) {
    const rows = paymentRows(result, row);
    const table = el('table');
    table.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', { scope: 'col', text: 'Premium' }),
      el('th', { scope: 'col', text: 'Rate' }),
      el('th', { scope: 'col', text: 'You keep' }),
      el('th', { scope: 'col', text: `Grown to year ${row.year}` }),
    ])]));
    table.appendChild(el('tbody', {}, rows.map((entry) => el('tr', {}, [
      el('td', { text: `Year ${entry.year}` }),
      el('td', { text: pct(entry.rate) }),
      el('td', { text: money(entry.kept) }),
      el('td', { text: money(entry.grown) }),
    ]))));
    nodes[2].appendChild(el('details', { class: 'numbers' }, [
      el('summary', { text: 'Show each premium' }),
      el('div', { class: 'table-wrap' }, [table]),
    ]));
  }

  document.getElementById('explain-cols').replaceChildren(...nodes);
  setText('explain-year', `Year ${row.year}`);
}

/* ------------------------------------------------------------------ */
/* One pass                                                            */
/* ------------------------------------------------------------------ */

function render() {
  deriveValues(values);
  const result = project(values);
  const row = result.rows[selectedYear - 1];

  updateFields(result);
  renderPlanChip(result);
  renderCards(row);
  renderVerdict(result, row);
  renderExplain(result, row);
  renderWarnings(result);
  setText('year-read', `Year ${selectedYear}`);

  if (!charts) buildCharts(result);
  else {
    rail.update({ selected: selectedYear, bands: railBands(result) });
    charts.margin.update({ selected: selectedYear, series: marginSeries(result) });
    charts.money.update({
      selected: selectedYear,
      series: moneySeries(result),
      threshold: { label: 'the bill', values: result.rows.map((r) => r.cost) },
    });
  }

  renderTable(tableOf('fig-margin'), result.rows, [
    yearColumn,
    { label: 'Cost of the funeral', get: (r) => money(r.cost) },
    { label: 'Trust margin', get: (r) => money(r.trust.margin), sign: lossSign((r) => r.trust.margin), rule: true },
    { label: 'Insurance margin', get: (r) => money(r.insurance.margin), sign: lossSign((r) => r.insurance.margin) },
  ]);

  renderTable(tableOf('fig-money'), result.rows, [
    yearColumn,
    { label: 'Trust total', get: (r) => money(r.trust.total) },
    { label: 'Insurance total', get: (r) => money(r.insurance.total) },
    { label: 'Cost of the funeral', get: (r) => money(r.cost), rule: true },
  ]);

  renderTable(document.querySelector('#full-table .table-wrap'), result.rows, [
    yearColumn,
    { label: 'Cost', get: (r) => money(r.cost) },
    { label: 'Trust total', get: (r) => money(r.trust.total), rule: true },
    { label: 'Trust margin', get: (r) => money(r.trust.margin), sign: lossSign((r) => r.trust.margin) },
    { label: 'Benefit', get: (r) => money(r.insurance.funds), rule: true },
    { label: 'Commission', get: (r) => money(r.insurance.commission) },
    { label: 'Insurance total', get: (r) => money(r.insurance.total) },
    { label: 'Insurance margin', get: (r) => money(r.insurance.margin), sign: lossSign((r) => r.insurance.margin) },
  ]);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

/** The premium follows the price, at the ratio you last typed. */
function movePremiumWithPrice() {
  values.insurance.annualPremium = Math.round(values.price * premiumRatio);
  const item = items.get('insurance.annualPremium');
  if (item) item.write();
}

function onFieldChange(path) {
  const ins = values.insurance;
  if (path === 'insurance.annualPremium') premiumRatio = ratioOf(values);
  premiumMoved = false;

  if (ins.payments > 1 && (path === 'price' || path === 'insurance.payments')) {
    movePremiumWithPrice();
    premiumMoved = path === 'price';
  }

  deriveValues(values);
  save();
  render();
}

function wire() {
  const form = document.getElementById('panels');

  form.addEventListener('input', (event) => {
    const host = event.target.closest('[data-field]');
    if (!host) return;
    const item = items.get(host.dataset.field);
    if (!item || !item.read) return;
    setPath(values, item.field.path, item.read());
    onFieldChange(item.field.path);
  });

  form.addEventListener('submit', (event) => event.preventDefault());

  document.getElementById('reset').addEventListener('click', () => {
    values = deriveValues(defaults());
    premiumRatio = ratioOf(values);
    premiumMoved = false;
    save();
    writeControls();
    render();
  });

  // A click on a number in the explanation moves to the field behind it.
  document.getElementById('explain-cols').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-goto]');
    if (button) focusField(button.dataset.goto);
  });

  // A click on any table row moves the year, like the rail.
  document.querySelectorAll('.table-wrap').forEach((wrap) => {
    wrap.addEventListener('click', (event) => {
      const tr = event.target.closest('tr[data-year]');
      if (tr) pickYear(Number(tr.dataset.year));
    });
  });

  wireTheme();
}

function wireTheme() {
  const button = document.getElementById('theme-toggle');
  const order = ['auto', 'light', 'dark'];
  let theme = localStorage.getItem(THEME_KEY) || 'auto';

  const apply = () => {
    document.documentElement.dataset.theme = theme;
    button.textContent = `Theme: ${theme}`;
  };

  button.addEventListener('click', () => {
    theme = order[(order.indexOf(theme) + 1) % order.length];
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    apply();
  });

  apply();
}

buildPanels(onFieldChange);
writeControls();
wire();
render();
