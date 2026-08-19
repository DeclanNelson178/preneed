/**
 * The dashboard. It holds the input state, calls the model, and draws.
 * All of the arithmetic lives in src/model.js. All of the field definitions
 * live in src/inputs.js. All of the drawing lives in src/chart.js.
 */

import { HORIZON, project } from './model.js';
import {
  PANELS, STATUS, defaults, getPath, setPath,
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

const percent = (fraction, places = 2) => (Number.isFinite(fraction)
  ? `${(fraction * 100).toFixed(places)}%`
  : '—');

/** Percent fields are held as fractions and shown as percents. */
const toPercentInput = (fraction) => Math.round(fraction * 1e6) / 1e4;
const fromPercentInput = (value) => value / 100;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let values = load();
let selectedYear = 10;
const fieldNodes = new Map();

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      // Overlay the saved values field by field, so a new field keeps its default.
      PANELS.flatMap((panel) => panel.fields).forEach((field) => {
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

function chipFor(field) {
  const status = STATUS[field.status];
  return el('span', {
    class: `chip chip--${field.status}`,
    text: status.label,
    title: status.note,
  });
}

function inputValueFor(field) {
  const raw = getPath(values, field.path);
  switch (field.kind) {
    case 'percent': return toPercentInput(raw);
    case 'percentList': return raw.map((p) => toPercentInput(p)).join(', ');
    default: return raw;
  }
}

function buildField(field) {
  const id = `f-${field.path.replace(/\./g, '-')}`;
  const wrapper = el('div', { class: 'field' });
  const head = el('div', { class: 'field-head' });
  let input;

  if (field.kind === 'toggle') {
    input = el('input', { type: 'checkbox', id });
    const label = el('label', { class: 'switch', htmlFor: id }, [
      input, el('span', { text: field.label }),
    ]);
    head.appendChild(label);
    head.appendChild(chipFor(field));
    wrapper.appendChild(head);
  } else {
    head.appendChild(el('label', { htmlFor: id, text: field.label }));
    head.appendChild(chipFor(field));
    wrapper.appendChild(head);

    const control = el('div', { class: 'control' });

    if (field.kind === 'select') {
      input = el('select', { id });
      field.options.forEach((option) => {
        input.appendChild(el('option', { value: String(option.value), text: option.label }));
      });
      control.appendChild(input);
    } else if (field.kind === 'percentList') {
      input = el('input', { type: 'text', id, inputMode: 'decimal', placeholder: '40, 70' });
      control.appendChild(input);
      control.appendChild(el('span', { class: 'affix', text: '% each' }));
    } else {
      if (field.kind === 'currency') control.appendChild(el('span', { class: 'affix', text: '$' }));
      input = el('input', {
        type: 'number', id, inputMode: 'decimal',
        step: String(field.step ?? 1),
      });
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      control.appendChild(input);
      if (field.kind === 'percent') control.appendChild(el('span', { class: 'affix', text: '%' }));
      if (field.kind === 'years') control.appendChild(el('span', { class: 'affix', text: 'years' }));
    }
    wrapper.appendChild(control);
  }

  wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));
  input.dataset.path = field.path;
  input.dataset.kind = field.kind;
  fieldNodes.set(field.path, { wrapper, input, field });
  return wrapper;
}

function buildPanels() {
  const form = document.getElementById('panels');
  const wide = window.matchMedia('(min-width: 1060px)').matches;

  PANELS.forEach((panel, index) => {
    const details = el('details', { class: 'panel', open: wide || index === 0 });
    const summary = el('summary', {}, [
      el('h2', { text: panel.title }),
      el('p', { text: panel.lede }),
    ]);
    details.appendChild(summary);
    const body = el('div', { class: 'panel-body' });
    panel.fields.forEach((field) => body.appendChild(buildField(field)));
    details.appendChild(body);
    form.appendChild(details);
  });

  const key = document.getElementById('status-key');
  key.appendChild(document.createTextNode('Every field is marked: '));
  Object.entries(STATUS).forEach(([id, status]) => {
    key.appendChild(el('span', {
      class: `chip chip--${id}`, text: status.label, title: status.note,
    }));
  });
}

/** Write the state into the controls. Called on load and on reset. */
function writeControls() {
  fieldNodes.forEach(({ input, field }) => {
    const value = inputValueFor(field);
    if (field.kind === 'toggle') input.checked = Boolean(value);
    else input.value = String(value);
  });
}

/** Show only the fields that the current settings make relevant. */
function updateVisibility() {
  fieldNodes.forEach(({ wrapper, field }) => {
    wrapper.hidden = Boolean(field.showWhen) && !field.showWhen(values);
  });
}

function readControl(input) {
  const { path, kind } = input.dataset;
  switch (kind) {
    case 'toggle':
      return input.checked;
    case 'select': {
      const field = fieldNodes.get(path).field;
      const option = field.options.find((o) => String(o.value) === input.value);
      return option ? option.value : field.value;
    }
    case 'percent': {
      const n = parseFloat(input.value);
      return fromPercentInput(Number.isFinite(n) ? n : 0);
    }
    case 'percentList':
      return input.value
        .split(',')
        .map((part) => parseFloat(part.trim()))
        .filter((n) => Number.isFinite(n))
        .map((n) => fromPercentInput(n));
    default: {
      const n = parseFloat(input.value);
      return Number.isFinite(n) ? n : 0;
    }
  }
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
    rate: lineChart(hostOf('fig-rate'), {
      ...shared,
      series: rateSeries(result),
      threshold: { label: 'inflation', values: result.rows.map(() => result.inputs.inflation) },
      format: (n) => percent(n),
      formatTick: (n) => percent(n, 1),
      ariaLabel: 'Effective annual rate earned on the guaranteed price, against funeral inflation.',
    }),
  };

  renderLegend(legendOf('fig-margin'), seriesLegend);
  renderLegend(legendOf('fig-money'), [...seriesLegend, { label: 'Cost of the funeral', kind: 'rule' }]);
  renderLegend(legendOf('fig-rate'), [...seriesLegend, { label: 'Funeral inflation', kind: 'rule' }]);
}

const marginSeries = (result) => [
  { key: 'trust', label: 'Trust', colorVar: '--trust', values: result.rows.map((r) => r.trust.margin) },
  { key: 'ins', label: 'Insurance', colorVar: '--ins', values: result.rows.map((r) => r.insurance.margin) },
];

const moneySeries = (result) => [
  { key: 'trust', label: 'Trust', colorVar: '--trust', values: result.rows.map((r) => r.trust.total) },
  { key: 'ins', label: 'Insurance', colorVar: '--ins', values: result.rows.map((r) => r.insurance.total) },
];

const rateSeries = (result) => [
  { key: 'trust', label: 'Trust', colorVar: '--trust', values: result.rows.map((r) => r.trust.effectiveRate) },
  { key: 'ins', label: 'Insurance', colorVar: '--ins', values: result.rows.map((r) => r.insurance.effectiveRate) },
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
    setText(`${prefix}-ear`, percent(side.effectiveRate));
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
/* One pass                                                            */
/* ------------------------------------------------------------------ */

function render() {
  const result = project(values);
  const row = result.rows[selectedYear - 1];

  updateVisibility();
  renderPlanChip(result);
  renderCards(row);
  renderVerdict(result, row);
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
    charts.rate.update({
      selected: selectedYear,
      series: rateSeries(result),
      threshold: { label: 'inflation', values: result.rows.map(() => result.inputs.inflation) },
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

  renderTable(tableOf('fig-rate'), result.rows, [
    yearColumn,
    { label: 'Trust rate', get: (r) => percent(r.trust.effectiveRate) },
    { label: 'Insurance rate', get: (r) => percent(r.insurance.effectiveRate) },
    { label: 'Funeral inflation', get: () => percent(result.inputs.inflation), rule: true },
  ]);

  renderTable(document.querySelector('#full-table .table-wrap'), result.rows, [
    yearColumn,
    { label: 'Cost', get: (r) => money(r.cost) },
    { label: 'Trust total', get: (r) => money(r.trust.total), rule: true },
    { label: 'Trust margin', get: (r) => money(r.trust.margin), sign: lossSign((r) => r.trust.margin) },
    { label: 'Trust rate', get: (r) => percent(r.trust.effectiveRate) },
    { label: 'Benefit', get: (r) => money(r.insurance.funds), rule: true },
    { label: 'Commission', get: (r) => money(r.insurance.commission) },
    { label: 'Insurance total', get: (r) => money(r.insurance.total) },
    { label: 'Insurance margin', get: (r) => money(r.insurance.margin), sign: lossSign((r) => r.insurance.margin) },
    { label: 'Insurance rate', get: (r) => percent(r.insurance.effectiveRate) },
  ]);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  const form = document.getElementById('panels');

  form.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset || !input.dataset.path) return;
    setPath(values, input.dataset.path, readControl(input));
    save();
    render();
  });

  form.addEventListener('submit', (event) => event.preventDefault());

  document.getElementById('reset').addEventListener('click', () => {
    values = defaults();
    save();
    writeControls();
    render();
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

buildPanels();
writeControls();
wire();
render();
