/**
 * The whole model. Section 2 of plan.md.
 *
 * Massachusetts cost-protected pre-need funeral contract.
 * Funeral establishment charges only. One trust option, and any number of
 * insurance contracts, all measured against the same funeral bill.
 *
 * This file holds no DOM code and no defaults. It imports unchanged into the
 * browser and into `node --test`. Starting values live in `src/inputs.js`.
 *
 * Symbols, as in plan.md section 2:
 *   P  price            i  inflation        net trust net return
 *   Tb business tax rate
 *   n  payments         Q  annual premium   g  policy growth rate
 *   w  waiting years    c1 first-year commission   c2 renewal commission
 *   t  year of death
 *
 * Every policy function takes the contract it is about as its last argument.
 * It defaults to the first contract, so a single-contract call reads the same
 * as it always did.
 */

/** Years of death the model reports, 1 to HORIZON. */
export const HORIZON = 30;

/** The four early-death benefit shapes. One setting. Mutually exclusive. */
export const BENEFIT_MODES = [
  'fullFace',
  'percentOfFace',
  'returnOfPremium',
  'faceLessUnpaid',
];

/** The pay plans in scope. */
export const PAY_PLANS = [1, 3, 5, 10];

/**
 * How many insurance contracts the comparison holds at once.
 *
 * This is a colour limit, not an arithmetic one. The chart palette has one
 * validated slot for the trust and six for contracts. A seventh contract would
 * need a hue that no longer separates under colour-blind simulation, so the
 * comparison stops here rather than repeating a colour.
 */
export const MAX_CONTRACTS = 6;

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const text = (v, fallback) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || fallback;
};

/** One insurance contract, coerced into numbers. */
function normalizeContract(raw = {}, index = 0) {
  return {
    id: text(raw.id, `c${index + 1}`),
    name: text(raw.name, `Contract ${index + 1}`),
    businessTaxRate: num(raw.businessTaxRate),
    payments: Math.max(1, Math.round(num(raw.payments, 1))),
    annualPremium: num(raw.annualPremium),
    growthRate: num(raw.growthRate),
    growthStartsAtPaidUp: Boolean(raw.growthStartsAtPaidUp),
    benefitMode: BENEFIT_MODES.includes(raw.benefitMode) ? raw.benefitMode : 'fullFace',
    waitingYears: Math.max(0, Math.round(num(raw.waitingYears))),
    waitingSchedule: Array.isArray(raw.waitingSchedule)
      ? raw.waitingSchedule.map((p) => num(p))
      : [],
    ropInterest: num(raw.ropInterest),
    firstYearCommission: num(raw.firstYearCommission),
    renewalCommission: num(raw.renewalCommission),
  };
}

/**
 * Coerce a raw input object into numbers. It does not supply starting values.
 * A missing field becomes 0, false, or an empty list.
 *
 * `contracts` is the list. `insurance` is the first contract, by reference, so
 * a caller that knows about one policy still reads and writes the same object.
 */
export function normalize(raw = {}) {
  const trust = raw.trust || {};
  const list = Array.isArray(raw.contracts) && raw.contracts.length
    ? raw.contracts.slice(0, MAX_CONTRACTS)
    : [raw.insurance || {}];
  const contracts = list.map(normalizeContract);

  return {
    price: num(raw.price),
    inflation: num(raw.inflation),
    deliveryPercent: raw.deliveryPercent === undefined ? 1 : num(raw.deliveryPercent),
    trust: {
      netReturn: num(trust.netReturn),
    },
    contracts,
    insurance: contracts[0],
  };
}

/* ------------------------------------------------------------------ */
/* 2.2 The trust                                                       */
/* ------------------------------------------------------------------ */

/**
 * The trust uses one rate: how fast the account balance itself grows.
 *
 * The model asks for the net rate directly and does not build it from a gross
 * return, a fee and a tax rate. A tax rate needs a base, and the two obvious
 * bases disagree: tax divided by income earned and tax divided by total return
 * give the same answer for a bond account and differ by about three times for
 * an equity account. The balance has no such ambiguity. It is also what the
 * funeral establishment receives under 239 CMR 4.09(2), and the trustee can
 * read it off a statement.
 */
export function netTrustRate(inputs) {
  return inputs.trust.netReturn;
}

/** funds(t) = P * (1 + net)^t */
export function trustFunds(t, inputs) {
  return inputs.price * Math.pow(1 + netTrustRate(inputs), t);
}

/* ------------------------------------------------------------------ */
/* 2.1 The bill                                                        */
/* ------------------------------------------------------------------ */

/**
 * cost(t) = P * (1 + i)^t * deliveryPercent
 *
 * deliveryPercent of 1 gives the funding gap view: does the money cover the
 * bill? A lower value gives the profit view: what do you keep?
 */
export function funeralCost(t, inputs) {
  return inputs.price * Math.pow(1 + inputs.inflation, t) * inputs.deliveryPercent;
}

/* ------------------------------------------------------------------ */
/* 2.3 The insurance policy                                            */
/* ------------------------------------------------------------------ */

/** premiumsPaid(t) = Q * min(t, n) */
export function premiumsPaid(t, inputs, ins = inputs.insurance) {
  return ins.annualPremium * Math.min(t, ins.payments);
}

/** unpaid(t) = Q * max(0, n - t) */
export function unpaidPremiums(t, inputs, ins = inputs.insurance) {
  return ins.annualPremium * Math.max(0, ins.payments - t);
}

/** growthYears(t) = growthStartsAtPaidUp ? max(0, t - n) : t */
export function growthYears(t, inputs, ins = inputs.insurance) {
  return ins.growthStartsAtPaidUp ? Math.max(0, t - ins.payments) : t;
}

/** grownFace(t) = P * (1 + g)^growthYears(t) */
export function grownFace(t, inputs, ins = inputs.insurance) {
  return inputs.price * Math.pow(1 + ins.growthRate, growthYears(t, inputs, ins));
}

/**
 * The percent of face the policy pays in year t of the waiting period.
 * The schedule lists year 1 first. A year past the end of the schedule holds
 * the last listed percent. An empty schedule pays nothing.
 */
export function waitingPercent(t, inputs, ins = inputs.insurance) {
  const schedule = ins.waitingSchedule;
  if (schedule.length === 0) return 0;
  const index = Math.min(Math.max(t, 1), schedule.length) - 1;
  return schedule[index];
}

/**
 * The death benefit in year t. One setting, four modes.
 * The modes are mutually exclusive, so early death is never penalised twice.
 *
 * The result is held at or above zero. A policy does not pay a negative amount.
 */
export function deathBenefit(t, inputs, ins = inputs.insurance) {
  const face = grownFace(t, inputs, ins);
  let benefit;

  switch (ins.benefitMode) {
    case 'percentOfFace':
      benefit = t <= ins.waitingYears
        ? inputs.price * waitingPercent(t, inputs, ins)
        : face;
      break;
    case 'returnOfPremium':
      // The plan applies the interest once. It is not compounded.
      benefit = t <= ins.waitingYears
        ? premiumsPaid(t, inputs, ins) * (1 + ins.ropInterest)
        : face;
      break;
    case 'faceLessUnpaid':
      // No branch is necessary: unpaid(t) is already zero after the policy is paid up.
      benefit = face - unpaidPremiums(t, inputs, ins);
      break;
    case 'fullFace':
    default:
      benefit = face;
      break;
  }

  return Math.max(0, benefit);
}

/**
 * Commission is paid on each premium as it arrives, taxed as business income
 * in the year of receipt, then compounded at the net trust rate.
 *
 *   payment(1)   = c1 * Q * (1 - Tb)
 *   payment(k>1) = c2 * Q * (1 - Tb)   for k = 2 .. n
 *   fund(t)      = sum over k = 1 .. min(t, n) of payment(k) * (1 + net)^(t - k)
 *
 * Set c1 = c2 for an as-earned schedule. Set c1 high and c2 low for a heaped
 * schedule. There is no special case in the code.
 */
export function commissionPayment(k, inputs, ins = inputs.insurance) {
  if (k < 1 || k > ins.payments) return 0;
  const rate = k === 1 ? ins.firstYearCommission : ins.renewalCommission;
  return rate * ins.annualPremium * (1 - ins.businessTaxRate);
}

export function commissionFund(t, inputs, ins = inputs.insurance) {
  const net = netTrustRate(inputs);
  const last = Math.min(t, ins.payments);
  let fund = 0;
  for (let k = 1; k <= last; k += 1) {
    fund += commissionPayment(k, inputs, ins) * Math.pow(1 + net, t - k);
  }
  return fund;
}

/* ------------------------------------------------------------------ */
/* 2.4 The result                                                      */
/* ------------------------------------------------------------------ */

/**
 * The honest comparison against funeral inflation.
 * Every option uses P as the base, because P is what you guaranteed.
 */
export function effectiveAnnualRate(total, price, t) {
  if (!(price > 0) || t < 1) return NaN;
  return Math.pow(total / price, 1 / t) - 1;
}

/** The trust key. It is not a contract id, so a contract can never collide. */
export const TRUST_KEY = 'trust';

/** One contract's result in year t. */
function contractYear(t, inputs, ins, cost) {
  const benefit = deathBenefit(t, inputs, ins);
  const commission = commissionFund(t, inputs, ins);
  const total = benefit + commission;
  return {
    key: ins.id,
    kind: 'insurance',
    name: ins.name,
    funds: benefit,
    commission,
    total,
    margin: total - cost,
    effectiveRate: effectiveAnnualRate(total, inputs.price, t),
    grownFace: grownFace(t, inputs, ins),
    premiumsPaid: premiumsPaid(t, inputs, ins),
    unpaid: unpaidPremiums(t, inputs, ins),
  };
}

/**
 * The winner of a single year: the option that leaves the most money in your
 * hand. Every option faces the same bill in a given year, so ranking on the
 * total and ranking on the margin give the same order.
 *
 * `lead` is the distance to the runner-up. A tie has a lead of zero and names
 * every option that shares the top. A lead under a cent is a tie: two shapes
 * that happen to land on the same number are not a winner and a loser.
 */
const TIE_EPSILON = 0.005;

/** "A", "A and B", "A, B and C". Three tied contracts is a readable sentence. */
const andList = (names) => (names.length < 3
  ? names.join(' and ')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function winnerOf(options) {
  const ranked = options.slice().sort((a, b) => b.total - a.total);
  const best = ranked[0];
  if (!best) return null;
  const tied = ranked.filter((o) => best.total - o.total <= TIE_EPSILON);
  const next = ranked.find((o) => best.total - o.total > TIE_EPSILON);
  return {
    key: tied.length > 1 ? 'tie' : best.key,
    name: tied.length > 1 ? andList(tied.map((o) => o.name)) : best.name,
    tie: tied.length > 1,
    tied: tied.map((o) => o.key),
    total: best.total,
    margin: best.margin,
    lead: next ? best.total - next.total : 0,
    runnerUp: next ? { key: next.key, name: next.name, total: next.total } : null,
  };
}

/** One row of the result table: year t. */
export function projectYear(t, inputs) {
  const cost = funeralCost(t, inputs);

  const trustFundsAtDeath = trustFunds(t, inputs);
  // 239 CMR 4.08. A trust sale pays no commission. This is the regulation.
  const trustCommission = 0;
  const trustTotal = trustFundsAtDeath + trustCommission;

  const trust = {
    key: TRUST_KEY,
    kind: 'trust',
    name: 'Trust',
    funds: trustFundsAtDeath,
    commission: trustCommission,
    total: trustTotal,
    // 239 CMR 4.08(6)(a) lets you keep a positive margin.
    // 4.08(6)(b) makes you bear a negative one. You may not bill the estate.
    margin: trustTotal - cost,
    effectiveRate: effectiveAnnualRate(trustTotal, inputs.price, t),
  };

  const contracts = inputs.contracts.map((ins) => contractYear(t, inputs, ins, cost));

  return {
    year: t,
    cost,
    trust,
    contracts,
    // The first contract, by reference. A caller that knows about one policy
    // reads the same object it always did.
    insurance: contracts[0],
    options: [trust, ...contracts],
    winner: winnerOf([trust, ...contracts]),
  };
}

/** The whole table, year 1 to the horizon, plus what the dashboard reads off it. */
export function project(raw, horizon = HORIZON) {
  const inputs = normalize(raw);
  const rows = [];
  for (let t = 1; t <= horizon; t += 1) rows.push(projectYear(t, inputs));

  return {
    inputs,
    horizon,
    netTrustRate: netTrustRate(inputs),
    rows,
    summary: summarise(rows),
    warnings: warnings(inputs),
  };
}

const firstYearWhere = (rows, test) => {
  const row = rows.find(test);
  return row ? row.year : null;
};

/** The option list, in draw order: the trust first, then the contracts. */
const optionsOf = (rows) => (rows[0] ? rows[0].options.map((o) => ({
  key: o.key, kind: o.kind, name: o.name,
})) : []);

const pick = (row, key) => row.options.find((o) => o.key === key);

/**
 * Contiguous runs of the same winner. This is the yearly-winner tool: a lead
 * that changes hands twice is two entries here, not one, and a run that never
 * ends says so with a single entry covering every year.
 */
export function winnerRuns(rows) {
  const runs = [];
  rows.forEach((row) => {
    const last = runs[runs.length - 1];
    const key = row.winner ? row.winner.key : null;
    if (last && last.key === key) {
      last.to = row.year;
      last.years += 1;
      last.bestLead = Math.max(last.bestLead, row.winner.lead);
    } else {
      runs.push({
        key,
        name: row.winner ? row.winner.name : '—',
        tie: Boolean(row.winner && row.winner.tie),
        from: row.year,
        to: row.year,
        years: 1,
        bestLead: row.winner ? row.winner.lead : 0,
      });
    }
  });
  return runs;
}

export function summarise(rows) {
  const options = optionsOf(rows);
  const lastRow = rows[rows.length - 1];

  const byOption = {};
  options.forEach((option) => {
    const cells = rows.map((row) => pick(row, option.key));
    byOption[option.key] = {
      key: option.key,
      kind: option.kind,
      name: option.name,
      firstLossYear: firstYearWhere(rows, (row) => pick(row, option.key).margin < 0),
      lossYears: cells.filter((c) => c.margin < 0).length,
      winYears: rows.filter((row) => row.winner && row.winner.tied.includes(option.key)).length,
      outrightWinYears: rows.filter((row) => row.winner && row.winner.key === option.key).length,
      firstWinYear: firstYearWhere(rows, (row) => row.winner && row.winner.key === option.key),
      bestYear: cells.reduce((best, c, i) => (c.margin > cells[best].margin ? i : best), 0) + 1,
      worstYear: cells.reduce((worst, c, i) => (c.margin < cells[worst].margin ? i : worst), 0) + 1,
    };
  });

  return {
    options,
    byOption,
    runs: winnerRuns(rows),
    // The year the better option changes hands, if it changes at all.
    leadChanges: leadChanges(rows),
    leaderAtStart: leaderOf(rows[0]),
    leaderAtEnd: leaderOf(lastRow),
    // The one-policy reading, kept so a caller that predates the contract list
    // still finds its numbers.
    trustFirstLossYear: byOption[TRUST_KEY] ? byOption[TRUST_KEY].firstLossYear : null,
    trustLossYears: byOption[TRUST_KEY] ? byOption[TRUST_KEY].lossYears : 0,
    insuranceFirstLossYear: firstYearWhere(rows, (row) => row.insurance.margin < 0),
    insuranceLossYears: rows.filter((row) => row.insurance.margin < 0).length,
  };
}

const leaderOf = (row) => {
  if (!row || !row.winner) return null;
  return row.winner.tie ? 'level' : row.winner.key;
};

function leadChanges(rows) {
  const changes = [];
  for (let k = 1; k < rows.length; k += 1) {
    const before = leaderOf(rows[k - 1]);
    const now = leaderOf(rows[k]);
    if (before !== now && now !== 'level') changes.push({ year: rows[k].year, leader: now });
  }
  return changes;
}

/**
 * Statements the dashboard must show, because the inputs make them true.
 * These are not errors. They tell you what you have assumed.
 *
 * A statement about one contract names it, so a list of six contracts still
 * says which one it is about.
 */
export function warnings(inputs) {
  const out = [];
  const many = inputs.contracts.length > 1;
  const about = (ins, line) => (many ? `${ins.name}: ${line}` : line);

  inputs.contracts.forEach((ins) => {
    if (ins.benefitMode === 'faceLessUnpaid') {
      out.push(about(ins,
        'The "full amount, less unpaid premiums" shape is not confirmed. No carrier '
        + 'document shows it. Get written confirmation before you use this result.'));
    }
    if (ins.payments > 1 && ins.annualPremium * ins.payments <= inputs.price) {
      out.push(about(ins,
        'The premiums total no more than the face amount. On a multi-pay plan they '
        + 'usually total more. Check the annual premium on the carrier illustration.'));
    }
    if (ins.benefitMode === 'percentOfFace' && ins.waitingSchedule.length < ins.waitingYears) {
      out.push(about(ins,
        'The waiting-period schedule is shorter than the waiting period. '
        + 'The last percent listed applies to the remaining years.'));
    }
  });

  if (inputs.trust.netReturn >= inputs.inflation) {
    out.push(
      'The trust net return is at or above funeral inflation, so the trust covers '
      + 'the bill in every year. Confirm that the rate is net of fees and net of '
      + 'tax, and that it is a rate the trustee actually earned.',
    );
  }
  return out;
}
