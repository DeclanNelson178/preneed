/**
 * The dashboard. It holds the input state, calls the model, and draws.
 * All of the arithmetic lives in src/model.js. All of the field definitions
 * live in src/inputs.js. All of the drawing lives in src/chart.js.
 *
 * The comparison holds one trust and any number of insurance contracts, up to
 * MAX_CONTRACTS. Nothing below is written for two options: every card, line,
 * column and row comes from the option list the model returns.
 */

import {
  HORIZON, MAX_CONTRACTS, TRUST_KEY,
  project, growthYears, waitingPercent, commissionPayment,
} from './model.js';
import {
  BASE_PANELS, CONTRACT_PRESETS, MAX_WAITING_ROWS,
  defaults, deriveValues, getPath, setPath, makeContract,
  nextContractId, nextContractName, panelsFor,
} from './inputs.js';
import { lineChart, winnerChart, yearRail } from './chart.js';

const STORE_KEY = 'preneed.inputs.v2';
const LEGACY_STORE_KEY = 'preneed.inputs.v1';
const THEME_KEY = 'preneed.theme.v1';
const VIEW_KEY = 'preneed.tableview.v1';
const MINUS = '−';

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/**
 * The trust takes slot 1. A contract takes a slot from its id, not from its
 * place in the list, so removing the second of three contracts never repaints
 * the two that remain.
 *
 * The seven slots are the validated categorical order in index.html. There is
 * no eighth: MAX_CONTRACTS stops the list before a colour would repeat.
 */
const TRUST_COLOR = '--s1';
const CONTRACT_COLORS = ['--s2', '--s3', '--s4', '--s5', '--s6', '--s7'];

function contractColor(id) {
  const match = /^c(\d+)$/.exec(id);
  const n = match ? Number(match[1]) - 1 : 0;
  return CONTRACT_COLORS[n % CONTRACT_COLORS.length];
}

const colorOf = (option) => (option.key === TRUST_KEY ? TRUST_COLOR : contractColor(option.key));

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
const rate = (fraction) => (Number.isFinite(fraction) ? `${(fraction * 100).toFixed(2)}%` : '—');

/** A growth factor, for the reader. Four places, so nothing hides. */
const times = (factor) => (Number.isFinite(factor) ? `× ${factor.toFixed(4)}` : '—');

const years = (n) => (n === 1 ? '1 year' : `${n} years`);

const yearSpan = (from, to) => (from === to ? `year ${from}` : `years ${from}–${to}`);

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let values = deriveValues(load());
let selectedYear = 10;
let tableView = loadView();

/**
 * The premium on a multi-pay illustration is not a function of the price, but
 * it does move with it. We hold the ratio of the last premium you typed, for
 * each contract, and we keep that ratio when the price changes. You see that
 * it moved.
 */
const premiumRatios = new Map();
let premiumMoved = new Set();

const ratioOf = (contract) => (values.price > 0 ? contract.annualPremium / values.price : 1);
const rememberRatios = () => {
  premiumRatios.clear();
  values.contracts.forEach((c) => premiumRatios.set(c.id, ratioOf(c)));
};

/** Every built field, by path, or by id for a note. */
const items = new Map();

/** The panels a reader has closed stay closed across a rebuild. */
const closedPanels = new Set();

function migrate(saved) {
  // v1 held one policy, under `insurance`. It becomes the first contract.
  if (saved && !Array.isArray(saved.contracts) && saved.insurance) {
    return {
      ...saved,
      contracts: [{ ...makeContract('c1', 'Single pay, level'), ...saved.insurance }],
    };
  }
  return saved;
}

function readStore() {
  try {
    const current = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (current && typeof current === 'object') return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) || 'null');
    if (legacy && typeof legacy === 'object') return migrate(legacy);
  } catch {
    // A broken store is not worth an error message. Start from the defaults.
  }
  return null;
}

function load() {
  const base = defaults();
  const saved = readStore();
  if (!saved) return base;

  BASE_PANELS.flatMap((panel) => panel.fields)
    .filter((field) => field.path)
    .forEach((field) => {
      const value = getPath(saved, field.path);
      if (value !== undefined) setPath(base, field.path, value);
    });

  if (Array.isArray(saved.contracts) && saved.contracts.length) {
    const seen = new Set();
    base.contracts = saved.contracts.slice(0, MAX_CONTRACTS).map((raw, index) => {
      // A saved contract is overlaid on a fresh one, so a field added after
      // the save keeps its starting value rather than becoming undefined.
      let id = typeof raw.id === 'string' && /^c\d+$/.test(raw.id) ? raw.id : `c${index + 1}`;
      while (seen.has(id)) id = `c${Number(id.slice(1)) + MAX_CONTRACTS}`;
      seen.add(id);
      const fresh = makeContract(id, `Contract ${index + 1}`);
      Object.keys(fresh).forEach((key) => {
        if (raw[key] !== undefined) fresh[key] = raw[key];
      });
      fresh.id = id;
      return fresh;
    });
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

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return ['margin', 'total', 'detail'].includes(saved) ? saved : 'margin';
  } catch {
    return 'margin';
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

const swatch = (colorVar) => el('span', {
  class: 'swatch', 'aria-hidden': 'true', style: `background:var(${colorVar})`,
});

/**
 * The lines the page computes for you. You type none of these.
 * A contract note is given the contract it belongs to.
 */
const NOTES = {
  'single-premium': (result, ins) => ({
    text: `Single premium ${money(ins.annualPremium)}. It goes to the carrier once.`,
  }),

  'premium-check': (result, ins) => {
    const total = ins.annualPremium * ins.payments;
    const ratio = result.inputs.price > 0 ? total / result.inputs.price : 0;
    return {
      text: `${ins.payments} payments of ${money(ins.annualPremium)} come to `
        + `${money(total)}. That is ${ratio.toFixed(2)} times the price.`
        + (premiumMoved.has(ins.id) ? ' The premium moved with the price. Check the illustration.' : ''),
      flag: ratio <= 1,
    };
  },

  'full-amount-from': (result, ins) => ({
    text: `The full amount is paid from year ${ins.waitingYears + 1}.`,
  }),

  'commission-growth': (result) => ({
    text: 'Your commission, after tax, is invested. It grows at '
      + `${pct(result.netTrustRate)} each year, the same net rate as the trust.`,
  }),
};

function buildNote(field, wrapper) {
  const line = el('p', { class: 'readout' });
  wrapper.appendChild(line);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));
  // A stamped-out note carries its contract index in the id: "premium-check-2".
  const base = field.contractIndex === undefined
    ? field.id
    : field.id.slice(0, field.id.lastIndexOf('-'));
  return {
    update: (result) => {
      const ins = field.contractIndex === undefined
        ? null
        : result.inputs.contracts[field.contractIndex];
      if (field.contractIndex !== undefined && !ins) return;
      const note = NOTES[base](result, ins);
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

/** A line of words. The contract name. */
function buildText(field, wrapper, id) {
  wrapper.appendChild(el('div', { class: 'field-head' }, [
    el('label', { htmlFor: id, text: field.label }),
  ]));
  const control = el('div', { class: 'control' });
  const input = el('input', { type: 'text', id, maxLength: field.maxLength || 40 });
  control.appendChild(input);
  wrapper.appendChild(control);
  if (field.source) wrapper.appendChild(el('p', { class: 'field-source', text: field.source }));

  return {
    read: () => input.value,
    write: () => { input.value = String(getPath(values, field.path) ?? ''); },
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
  const wrapper = el('div', { class: 'field' });
  wrapper.dataset.field = key;

  let parts;
  if (field.kind === 'note') parts = buildNote(field, wrapper);
  else if (field.kind === 'choice') parts = buildChoice(field, wrapper, id);
  else if (field.kind === 'percentRows') parts = buildPercentRows(field, wrapper, id, onChange);
  else if (field.kind === 'text') parts = buildText(field, wrapper, id);
  else parts = buildNumber(field, wrapper, id);

  items.set(key, { field, wrapper, ...parts });
  return wrapper;
}

/** The head of a contract panel: its colour, its name, and what you can do to it. */
function contractSummary(panel) {
  const contract = values.contracts[panel.index];
  const colorVar = contractColor(contract.id);

  const head = el('h2', {}, [
    swatch(colorVar),
    el('span', { class: 'panel-name', text: contract.name }),
  ]);

  const tools = el('div', { class: 'panel-tools' });
  const tool = (label, title, run) => {
    const button = el('button', {
      type: 'button', class: 'panel-tool', text: label, title,
    });
    // The tools live inside a <summary>. A click there would open the panel.
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      run();
    });
    return button;
  };

  if (values.contracts.length < MAX_CONTRACTS) {
    tools.appendChild(tool('Duplicate', `Copy ${contract.name} into a new contract`,
      () => duplicateContract(panel.index)));
  }
  if (values.contracts.length > 1) {
    tools.appendChild(tool('Remove', `Remove ${contract.name} from the comparison`,
      () => removeContract(panel.index)));
  }

  const summary = el('summary', {}, [head, el('p', { text: panel.lede })]);
  if (tools.childElementCount) head.insertBefore(tools, head.querySelector('.panel-name').nextSibling);
  return summary;
}

/** The row that adds a contract. One click for each shape worth comparing. */
function addContractRow() {
  const block = el('div', { class: 'add-contract' });
  if (values.contracts.length >= MAX_CONTRACTS) {
    block.appendChild(el('p', {
      class: 'field-source',
      text: `Six contracts is the limit. Each one needs a colour the charts can `
        + 'keep apart, and there are six left after the trust takes one.',
    }));
    return block;
  }

  block.appendChild(el('p', { class: 'cite', text: 'Add a contract' }));
  const row = el('div', { class: 'row-buttons' });
  CONTRACT_PRESETS.forEach((preset) => {
    const button = el('button', {
      type: 'button', class: 'row-button', text: preset.label, title: preset.blurb,
    });
    button.addEventListener('click', () => addContract(preset));
    row.appendChild(button);
  });
  block.appendChild(row);
  block.appendChild(el('p', {
    class: 'field-source',
    text: 'A starting shape, not an answer. Open the panel it makes and put the '
      + 'carrier\'s own numbers in it.',
  }));
  return block;
}

function buildPanels(onChange) {
  const form = document.getElementById('panels');
  form.querySelectorAll('.panel, .add-contract').forEach((node) => node.remove());
  items.clear();

  const wide = window.matchMedia('(min-width: 1060px)').matches;

  panelsFor(values).forEach((panel, index) => {
    const open = closedPanels.has(panel.id) ? false : (wide || index === 0);
    const details = el('details', { class: 'panel', open });
    details.dataset.panel = panel.id;

    details.appendChild(panel.index === undefined
      ? el('summary', {}, [el('h2', { text: panel.title }), el('p', { text: panel.lede })])
      : contractSummary(panel));

    details.addEventListener('toggle', () => {
      if (details.open) closedPanels.delete(panel.id);
      else closedPanels.add(panel.id);
    });

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

  form.appendChild(addContractRow());
}

/** Write the state into the controls. Called on load, on reset and on rebuild. */
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
/* Adding and removing a contract                                      */
/* ------------------------------------------------------------------ */

/** A structural change rebuilds the panels. Nothing else does. */
function afterStructuralChange() {
  deriveValues(values);
  rememberRatios();
  premiumMoved = new Set();
  save();
  buildPanels(onFieldChange);
  writeControls();
  render();
}

function addContract(preset) {
  if (values.contracts.length >= MAX_CONTRACTS) return;
  const id = nextContractId(values.contracts);
  const name = nextContractName(values.contracts, preset.label);
  const contract = makeContract(id, name, preset.patch);
  if (contract.payments === 1) contract.annualPremium = values.price;
  values.contracts.push(contract);
  closedPanels.delete(`contract-${values.contracts.length - 1}`);
  afterStructuralChange();
}

function duplicateContract(index) {
  if (values.contracts.length >= MAX_CONTRACTS) return;
  const source = values.contracts[index];
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = nextContractId(values.contracts);
  copy.name = nextContractName(values.contracts, source.name);
  values.contracts.splice(index + 1, 0, copy);
  afterStructuralChange();
}

function removeContract(index) {
  if (values.contracts.length <= 1) return;
  values.contracts.splice(index, 1);
  // A panel id is positional, so a stale closed-state would follow the gap.
  closedPanels.clear();
  afterStructuralChange();
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/**
 * groups  = [{ label, colorVar, columns }] — an optional band above the header
 * columns = [{ label, get(row) -> string, sign(row) -> 'loss'|'gain'|null,
 *              rule: boolean, strong: boolean }]
 */
function renderTable(host, rows, groups) {
  const columns = groups.flatMap((group) => group.columns);
  const banded = groups.some((group) => group.label);

  const table = el('table', { class: banded ? '' : 'no-band' });
  const thead = el('thead');

  if (banded) {
    const bandRow = el('tr', { class: 'band-row' });
    groups.forEach((group) => {
      const th = el('th', {
        scope: 'colgroup', colSpan: group.columns.length, class: group.label ? 'band' : 'band band--blank',
      });
      if (group.label) {
        if (group.colorVar) th.appendChild(swatch(group.colorVar));
        th.appendChild(document.createTextNode(group.label));
      }
      if (group.columns[0] && group.columns[0].rule) th.classList.add('rule-col');
      bandRow.appendChild(th);
    });
    thead.appendChild(bandRow);
  }

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
      const td = el('td', { text: column.get(row) });
      if (column.rule) td.classList.add('rule-col');
      if (column.strong) td.classList.add('strong-col');
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

/** The cell for one option in one row. */
const cellOf = (row, key) => row.options.find((o) => o.key === key);

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

/** The option list of the selected result, in draw order, with its colours. */
const optionsOf = (result) => result.summary.options.map((option) => ({
  ...option, colorVar: colorOf(option),
}));

const seriesFrom = (result, pickValue) => optionsOf(result).map((option) => ({
  key: option.key,
  label: option.name,
  colorVar: option.colorVar,
  values: result.rows.map((row) => pickValue(cellOf(row, option.key))),
}));

const marginSeries = (result) => seriesFrom(result, (cell) => cell.margin);
const moneySeries = (result) => seriesFrom(result, (cell) => cell.total);

const railBands = (result) => optionsOf(result).map((option) => ({
  key: option.key,
  label: option.name,
  colorVar: option.colorVar,
  signs: result.rows.map((row) => cellOf(row, option.key).margin >= 0),
}));

const winnerYears = (result) => result.rows.map((row) => ({
  year: row.year,
  key: row.winner.key,
  name: row.winner.name,
  colorVar: row.winner.tie ? '--rule-strong' : colorOf(row.winner),
  lead: row.winner.lead,
  tie: row.winner.tie,
  runnerUp: row.winner.runnerUp
    ? { name: row.winner.runnerUp.name, total: row.winner.runnerUp.total }
    : null,
  rows: [{ label: 'Cost of the funeral', value: money(row.cost), colorVar: null }],
}));

const winnerRunSpecs = (result) => result.summary.runs.map((run) => ({
  ...run, colorVar: run.tie ? '--rule-strong' : contractOrTrustColor(run.key),
}));

const contractOrTrustColor = (key) => (key === TRUST_KEY ? TRUST_COLOR : contractColor(key));

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
      ariaLabel: 'Margin by year of death, one line for the trust and one for each insurance contract.',
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
    winner: winnerChart(hostOf('fig-winner'), {
      ...shared,
      years: winnerYears(result),
      runs: winnerRunSpecs(result),
      format: money,
      formatTick: moneyTick,
      ariaLabel: 'Which option leaves the most money in each year of death, and how far ahead it is.',
    }),
  };
}

function renderLegends(result) {
  const entries = optionsOf(result).map((option) => ({
    label: option.name, colorVar: option.colorVar,
  }));
  renderLegend(legendOf('fig-margin'), entries);
  renderLegend(legendOf('fig-money'), [...entries, { label: 'Cost of the funeral', kind: 'rule' }]);
  renderLegend(legendOf('fig-winner'), entries);
}

/* ------------------------------------------------------------------ */
/* The cards, the verdict and the notes                                */
/* ------------------------------------------------------------------ */

const setText = (id, text) => { document.getElementById(id).textContent = text; };

/** One card per option, in draw order. The leader is marked. */
function renderCards(result, row) {
  const cards = optionsOf(result).map((option) => {
    const cell = cellOf(row, option.key);
    const leads = row.winner.tied.includes(option.key);

    const head = el('div', { class: 'card-head' }, [
      swatch(option.colorVar),
      el('h3', { text: option.name }),
    ]);
    if (option.kind === 'trust') {
      head.appendChild(el('span', {
        class: 'chip chip--choice', title: 'A trust sale pays you no commission.', text: 'no commission',
      }));
    } else {
      const ins = result.inputs.contracts.find((c) => c.id === option.key);
      head.appendChild(el('span', {
        class: 'chip chip--choice',
        text: ins.payments === 1 ? 'paid in full' : `${ins.payments}-year plan`,
      }));
    }
    if (leads) {
      head.appendChild(el('span', {
        class: 'chip chip--lead',
        text: row.winner.tie ? 'level' : 'ahead',
        title: row.winner.tie
          ? 'Two options land on the same total this year.'
          : `Ahead of ${row.winner.runnerUp ? row.winner.runnerUp.name : 'the field'} `
            + `by ${money(row.winner.lead)}.`,
      }));
    }

    const marginValue = el('span', { class: 'big-value', text: money(cell.margin) });
    marginValue.dataset.sign = cell.margin < 0 ? 'loss' : 'gain';

    // The bill is the same on every card, so it is stated once, above them.
    const lines = [
      ['Total to you', money(cell.total)],
      ...(option.kind === 'trust' ? [] : [
        ['Death benefit', money(cell.funds)],
        ['Commission fund, after tax', money(cell.commission)],
      ]),
      ['Effective rate on the price', rate(cell.effectiveRate)],
    ];

    const card = el('article', { class: 'card' }, [
      head,
      el('div', { class: 'big' }, [
        marginValue,
        el('span', { class: 'big-label' }, [
          el('b', { text: cell.margin < 0 ? 'loss' : 'surplus' }),
          document.createTextNode(` in year ${row.year}`),
        ]),
      ]),
      el('dl', {}, lines.map(([term, value]) => el('div', {}, [
        el('dt', { text: term }), el('dd', { text: value }),
      ]))),
    ]);
    card.dataset.option = option.kind;
    card.dataset.lead = leads ? 'true' : 'false';
    card.style.setProperty('--card-accent', `var(${option.colorVar})`);
    return card;
  });

  document.getElementById('cards').replaceChildren(...cards);
}

function renderVerdict(result, row) {
  const winner = row.winner;
  const over = winner.runnerUp
    ? `, ${money(winner.lead)} ahead of ${winner.runnerUp.name}.`
    : '.';
  const first = winner.tie
    ? `In year ${row.year} ${winner.name} are level, at ${money(winner.total)} each${over}`
    : `In year ${row.year} ${winner.name} leads${over}`;

  const runs = result.summary.runs;
  const second = runs.length === 1
    ? `${runs[0].name} leads in every year to ${result.horizon}.`
    : `The lead changes hands ${runs.length - 1 === 1 ? 'once' : `${runs.length - 1} times`}: `
      + `${runs.map((run) => `${run.name} in ${yearSpan(run.from, run.to)}`).join(', ')}.`;

  const covered = result.summary.options.filter(
    (option) => result.summary.byOption[option.key].firstLossYear === null,
  );
  const third = covered.length === 0
    ? `No option covers the bill in every year to ${result.horizon}.`
    : covered.length === result.summary.options.length
      ? `Every option covers the bill in every year to ${result.horizon}.`
      : `${covered.map((o) => o.name).join(', ')} `
        + `${covered.length === 1 ? 'is the only option that covers' : 'are the only options that cover'} `
        + `the bill in every year to ${result.horizon}.`;

  document.getElementById('verdict').replaceChildren(
    el('p', { class: 'verdict-lead', text: first }),
    el('p', { class: 'verdict-sub', text: `The funeral costs ${money(row.cost)} in year ${row.year}. ${third}` }),
    el('p', { class: 'verdict-sub', text: second }),
  );
}

function renderWarnings(result) {
  const host = document.getElementById('warnings');
  host.replaceChildren(...result.warnings.map((line) => el('li', { class: 'note', text: line })));
}

/* ------------------------------------------------------------------ */
/* The standings: every option, ranked, for the selected year          */
/* ------------------------------------------------------------------ */

function renderStandings(result, row) {
  const ranked = optionsOf(result)
    .map((option) => ({ option, cell: cellOf(row, option.key), stat: result.summary.byOption[option.key] }))
    .sort((a, b) => b.cell.total - a.cell.total);

  const best = ranked[0].cell.total;

  const head = el('tr', {}, [
    el('th', { scope: 'col', text: 'Option' }),
    el('th', { scope: 'col', text: 'Total' }),
    el('th', { scope: 'col', text: 'Behind' }),
    el('th', { scope: 'col', text: 'Margin' }),
    el('th', { scope: 'col', text: 'Effective rate' }),
    el('th', { scope: 'col', text: 'Years ahead' }),
    el('th', { scope: 'col', text: 'First loss' }),
    el('th', { scope: 'col', text: 'Loss years' }),
  ]);

  const body = ranked.map(({ option, cell, stat }, index) => {
    const behind = best - cell.total;
    const tr = el('tr', {}, [
      el('td', { class: 'name-cell' }, [
        el('span', { class: 'rank', text: String(index + 1) }),
        swatch(option.colorVar),
        document.createTextNode(option.name),
      ]),
      el('td', { text: money(cell.total) }),
      el('td', { text: behind <= 0.005 ? '—' : MINUS + money(behind) }),
      el('td', { text: money(cell.margin) }),
      el('td', { text: rate(cell.effectiveRate) }),
      el('td', { text: `${stat.winYears} of ${result.horizon}` }),
      el('td', { text: stat.firstLossYear === null ? 'never' : String(stat.firstLossYear) }),
      el('td', { text: String(stat.lossYears) }),
    ]);
    tr.children[3].dataset.sign = cell.margin < 0 ? 'loss' : 'gain';
    tr.children[4].dataset.sign = cell.effectiveRate < result.inputs.inflation ? 'loss' : 'gain';
    tr.children[6].dataset.sign = stat.firstLossYear === null ? 'gain' : 'loss';
    tr.dataset.rank = String(index + 1);
    return tr;
  });

  const table = el('table', { class: 'standings-table no-band' }, [
    el('thead', {}, [head]),
    el('tbody', {}, body),
  ]);
  document.querySelector('#standings .table-wrap').replaceChildren(table);

  setText('standings-year', `Year ${row.year}`);
  setText('standings-note',
    `The effective rate is what each option earned on the ${money(result.inputs.price)} you `
    + `guaranteed, as a yearly rate to year ${row.year}. Funeral inflation is `
    + `${pct(result.inputs.inflation)}: a rate under that loses ground to the bill.`);
}

/** The yearly-winner sentence under the strip. */
function renderWinnerSummary(result) {
  const runs = result.summary.runs;
  const host = document.getElementById('winner-runs');
  host.replaceChildren(...runs.map((run) => el('li', { class: 'run' }, [
    swatch(run.tie ? '--rule-strong' : contractOrTrustColor(run.key)),
    el('b', { text: run.name }),
    el('span', { text: `${yearSpan(run.from, run.to)} · best lead ${money(run.bestLead)}` }),
  ])));
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

/** The path to one field of contract `index`. */
const at = (index, key) => `contracts.${index}.${key}`;

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
function benefitSteps(result, row, index) {
  const { price } = result.inputs;
  const ins = result.inputs.contracts[index];
  const cell = row.contracts[index];
  const t = row.year;
  const early = t <= ins.waitingYears;
  const grew = growthYears(t, result.inputs, ins);

  const growthStep = () => (grew === 0
    ? step(['It does not grow until it is paid up'], times(1))
    : step([
      'It grows ', link(at(index, 'growthRate'), pct(ins.growthRate)), ` each year, for ${years(grew)}`,
      ...(grew < t ? [', after it is paid up'] : []),
    ], times(Math.pow(1 + ins.growthRate, grew))));

  if (ins.benefitMode === 'percentOfFace' && early) {
    return [
      step([link('price', 'The amount at issue')], money(price)),
      step(['In year ', String(t), ' it pays ',
        link(at(index, 'waitingSchedule'), pct(waitingPercent(t, result.inputs, ins))),
        ' of that amount'], money(cell.funds)),
      step(['The policy pays'], money(cell.funds), 'sub'),
    ];
  }

  if (ins.benefitMode === 'returnOfPremium' && early) {
    const paid = cell.premiumsPaid;
    return [
      step([`Premiums paid by year ${t}`], money(paid)),
      step(['Interest, at ', link(at(index, 'ropInterest'), pct(ins.ropInterest)), ', applied once'],
        `+ ${money(paid * ins.ropInterest)}`),
      step(['The policy pays'], money(cell.funds), 'sub'),
    ];
  }

  if (ins.benefitMode === 'faceLessUnpaid') {
    return [
      step([link('price', 'The amount at issue')], money(price)),
      growthStep(),
      step(['The amount in year ' + t], money(cell.grownFace)),
      step(['Less the premiums not yet paid'], MINUS + money(cell.unpaid)),
      step(['The policy pays'], money(cell.funds), 'sub'),
    ];
  }

  return [
    step([link('price', 'The amount at issue')], money(price)),
    growthStep(),
    step(['The policy pays'], money(cell.funds), 'sub'),
  ];
}

function commissionSteps(result, row, index) {
  const ins = result.inputs.contracts[index];
  const cell = row.contracts[index];
  const net = result.netTrustRate;
  const t = row.year;
  const first = ins.firstYearCommission * ins.annualPremium;
  const out = [];

  if (ins.payments === 1) {
    out.push(step([link(at(index, 'firstYearCommission'), pct(ins.firstYearCommission)), ' of the premium'],
      money(first)));
    out.push(step(['Less business tax, at ',
      link(at(index, 'businessTaxRate'), pct(ins.businessTaxRate))],
    MINUS + money(first * ins.businessTaxRate)));
    out.push(step(['You keep, in year 1'], money(commissionPayment(1, result.inputs, ins)), 'sub'));
    if (t > 1) {
      out.push(step([`It grows at ${pct(net)} for ${years(t - 1)}`],
        times(Math.pow(1 + net, t - 1))));
    }
  } else {
    const later = ins.renewalCommission * ins.annualPremium;
    const paid = Math.min(t, ins.payments);
    const gross = first + later * (paid - 1);
    out.push(step([link(at(index, 'firstYearCommission'), pct(ins.firstYearCommission)),
      ' of the first premium'], money(first)));
    if (paid === 2) {
      out.push(step([link(at(index, 'renewalCommission'), pct(ins.renewalCommission)),
        ' of the other premium'], money(later)));
    } else if (paid > 2) {
      out.push(step([link(at(index, 'renewalCommission'), pct(ins.renewalCommission)),
        ` of each of the other ${paid - 1} premiums`], `${money(later)} each`));
    }
    out.push(step(['Less business tax, at ',
      link(at(index, 'businessTaxRate'), pct(ins.businessTaxRate)), ', on each one'],
    MINUS + money(gross * ins.businessTaxRate)));
    out.push(step([`You keep, by year ${t}`], money(gross * (1 - ins.businessTaxRate)), 'sub'));
    out.push(step([`Each amount grows at ${pct(net)}, to year ${t}`], ''));
  }

  out.push(step(['Commission fund'], money(cell.commission), 'sub'));
  return out;
}

function insuranceSteps(result, row, index) {
  const cell = row.contracts[index];
  return [
    ...benefitSteps(result, row, index),
    ...commissionSteps(result, row, index),
    step(['Total to you'], money(cell.total), 'total'),
    step(['Less the bill'], MINUS + money(row.cost)),
    step(['Margin'], money(cell.margin), 'margin'),
  ];
}

/** One line for each premium, so the compounding is not a black box. */
function paymentRows(result, row, index) {
  const ins = result.inputs.contracts[index];
  const net = result.netTrustRate;
  const last = Math.min(row.year, ins.payments);
  const rows = [];
  for (let k = 1; k <= last; k += 1) {
    const kept = commissionPayment(k, result.inputs, ins);
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

function premiumDetails(result, row, index) {
  const rows = paymentRows(result, row, index);
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
  return el('details', { class: 'numbers' }, [
    el('summary', { text: 'Show each premium' }),
    el('div', { class: 'table-wrap' }, [table]),
  ]);
}

function renderExplain(result, row) {
  const columns = [
    { title: 'The bill', colorVar: null, steps: billSteps(result, row) },
    { title: 'Trust', colorVar: TRUST_COLOR, steps: trustSteps(result, row) },
    ...result.inputs.contracts.map((ins, index) => ({
      title: ins.name,
      colorVar: contractColor(ins.id),
      index,
      steps: insuranceSteps(result, row, index),
    })),
  ];

  const nodes = columns.map((column) => {
    const heading = el('h3', {});
    if (column.colorVar) heading.appendChild(swatch(column.colorVar));
    heading.appendChild(document.createTextNode(column.title));

    const node = el('div', { class: 'xcol' }, [
      heading,
      el('div', { class: 'xrows' }, renderSteps(column.steps)),
    ]);
    if (column.index !== undefined && result.inputs.contracts[column.index].payments > 1) {
      node.appendChild(premiumDetails(result, row, column.index));
    }
    return node;
  });

  document.getElementById('explain-cols').replaceChildren(...nodes);
  setText('explain-year', `Year ${row.year}`);
}

/* ------------------------------------------------------------------ */
/* The full table                                                      */
/* ------------------------------------------------------------------ */

const TABLE_VIEWS = [
  { value: 'margin', label: 'Margins' },
  { value: 'total', label: 'Totals' },
  { value: 'detail', label: 'Everything' },
];

/**
 * One column band per option, so a row of eight numbers still says which
 * option each number belongs to. The winner column names the year's leader,
 * which is the same fact the strip above draws.
 */
function fullTableGroups(result) {
  const options = optionsOf(result);

  const groups = [{
    label: '',
    columns: [
      yearColumn,
      { label: 'Cost of the funeral', get: (row) => money(row.cost) },
    ],
  }];

  options.forEach((option) => {
    const cell = (row) => cellOf(row, option.key);
    const columns = [];
    if (tableView === 'detail' && option.kind === 'insurance') {
      columns.push({ label: 'Benefit', get: (row) => money(cell(row).funds) });
      columns.push({ label: 'Commission', get: (row) => money(cell(row).commission) });
    }
    if (tableView !== 'margin') {
      columns.push({ label: 'Total', get: (row) => money(cell(row).total) });
    }
    if (tableView !== 'total') {
      columns.push({
        label: 'Margin',
        get: (row) => money(cell(row).margin),
        sign: lossSign((row) => cell(row).margin),
      });
    }
    // A rule on the first column of each band separates one option from the next.
    columns[0].rule = true;
    groups.push({ label: option.name, colorVar: option.colorVar, columns });
  });

  groups.push({
    label: 'Ahead',
    columns: [
      {
        label: 'Winner',
        get: (row) => (row.winner.tie ? `${row.winner.name} (level)` : row.winner.name),
        rule: true,
        strong: true,
      },
      { label: 'By', get: (row) => money(row.winner.lead) },
    ],
  });

  return groups;
}

function renderViewSwitch() {
  const host = document.getElementById('table-view');
  if (host.childElementCount) {
    host.querySelectorAll('button').forEach((button) => {
      button.dataset.on = button.dataset.view === tableView ? 'true' : 'false';
    });
    return;
  }
  host.replaceChildren(...TABLE_VIEWS.map((view) => {
    const button = el('button', { type: 'button', class: 'row-button', text: view.label });
    button.dataset.view = view.value;
    button.dataset.on = view.value === tableView ? 'true' : 'false';
    button.addEventListener('click', () => {
      tableView = view.value;
      try { localStorage.setItem(VIEW_KEY, tableView); } catch { /* ignore */ }
      renderViewSwitch();
      render();
    });
    return button;
  }));
}

/* ------------------------------------------------------------------ */
/* One pass                                                            */
/* ------------------------------------------------------------------ */

function render() {
  deriveValues(values);
  const result = project(values);
  const row = result.rows[selectedYear - 1];

  updateFields(result);
  renderCards(result, row);
  renderVerdict(result, row);
  renderStandings(result, row);
  renderWinnerSummary(result);
  renderExplain(result, row);
  renderWarnings(result);
  renderViewSwitch();
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
    charts.winner.update({
      selected: selectedYear,
      years: winnerYears(result),
      runs: winnerRunSpecs(result),
    });
  }
  renderLegends(result);

  const options = optionsOf(result);

  renderTable(tableOf('fig-margin'), result.rows, [
    { label: '', columns: [yearColumn, { label: 'Cost of the funeral', get: (r) => money(r.cost) }] },
    ...options.map((option) => ({
      label: option.name,
      colorVar: option.colorVar,
      columns: [{
        label: 'Margin',
        rule: true,
        get: (r) => money(cellOf(r, option.key).margin),
        sign: lossSign((r) => cellOf(r, option.key).margin),
      }],
    })),
  ]);

  renderTable(tableOf('fig-money'), result.rows, [
    { label: '', columns: [yearColumn, { label: 'Cost of the funeral', get: (r) => money(r.cost) }] },
    ...options.map((option) => ({
      label: option.name,
      colorVar: option.colorVar,
      columns: [{ label: 'Total', rule: true, get: (r) => money(cellOf(r, option.key).total) }],
    })),
  ]);

  renderTable(tableOf('fig-winner'), result.rows, [
    {
      label: '',
      columns: [
        yearColumn,
        {
          label: 'Winner',
          get: (r) => (r.winner.tie ? `${r.winner.name} (level)` : r.winner.name),
          strong: true,
        },
        { label: 'Ahead by', get: (r) => money(r.winner.lead) },
        { label: 'Runner-up', get: (r) => (r.winner.runnerUp ? r.winner.runnerUp.name : '—') },
        {
          label: 'Winner margin',
          get: (r) => money(r.winner.margin),
          sign: lossSign((r) => r.winner.margin),
        },
      ],
    },
  ]);

  renderTable(document.querySelector('#full-table .table-wrap'), result.rows, fullTableGroups(result));
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

/** Each multi-pay premium follows the price, at the ratio you last typed. */
function movePremiumsWithPrice() {
  values.contracts.forEach((contract) => {
    if (contract.payments === 1) return;
    const ratio = premiumRatios.has(contract.id) ? premiumRatios.get(contract.id) : 1;
    contract.annualPremium = Math.round(values.price * ratio);
    premiumMoved.add(contract.id);
    const item = items.get(at(values.contracts.indexOf(contract), 'annualPremium'));
    if (item) item.write();
  });
}

/** The contract a field path belongs to, or null for a shared field. */
function contractOf(path) {
  const match = /^contracts\.(\d+)\./.exec(path);
  return match ? values.contracts[Number(match[1])] : null;
}

function onFieldChange(path) {
  const contract = contractOf(path);

  if (path.endsWith('.annualPremium') && contract) {
    premiumRatios.set(contract.id, ratioOf(contract));
  }
  if (path.endsWith('.name') && contract) {
    // The name is on the panel head, the cards, the charts and the tables.
    const head = document.querySelector(`[data-panel="contract-${values.contracts.indexOf(contract)}"] .panel-name`);
    if (head) head.textContent = contract.name || 'Contract';
  }

  premiumMoved = new Set();
  if (path === 'price') movePremiumsWithPrice();
  if (path.endsWith('.payments') && contract && contract.payments > 1) {
    const ratio = premiumRatios.has(contract.id) ? premiumRatios.get(contract.id) : 1;
    contract.annualPremium = Math.round(values.price * ratio);
    const item = items.get(at(values.contracts.indexOf(contract), 'annualPremium'));
    if (item) item.write();
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
    closedPanels.clear();
    afterStructuralChange();
  });

  // A click on a number in the explanation moves to the field behind it.
  document.getElementById('explain-cols').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-goto]');
    if (button) focusField(button.dataset.goto);
  });

  // A click on any table row moves the year, like the rail.
  document.getElementById('results').addEventListener('click', (event) => {
    if (!event.target.closest('.table-wrap')) return;
    const tr = event.target.closest('tr[data-year]');
    if (tr) pickYear(Number(tr.dataset.year));
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

rememberRatios();
buildPanels(onFieldChange);
writeControls();
wire();
render();
