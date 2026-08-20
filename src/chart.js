/**
 * Drawing. Hand-written SVG. No library, no build step.
 *
 * Three shapes:
 *   yearRail(host, spec)      the year-of-death control, with a surplus/loss
 *                             band for each option
 *   lineChart(host, spec)     a line chart with a zero line, an optional
 *                             threshold, a red loss region, a crosshair and a
 *                             marker at the selected year
 *   winnerChart(host, spec)   who wins each year, and by how much: a run strip
 *                             over a bar of the lead over the runner-up
 *
 * Colours arrive as CSS custom property names, so light and dark mode swap in
 * one place. They are applied through `style`, because a `var()` in an SVG
 * presentation attribute does not resolve.
 */

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function svgEl(name, attrs = {}, styles = {}) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
  Object.entries(styles).forEach(([key, value]) => { node.style[key] = value; });
  return node;
}

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

/** Cut a label to fit a width, in the rough 6.2px per character of the UI face. */
function fit(label, width) {
  const max = Math.floor(width / 6.2);
  if (max < 2) return '';
  return label.length <= max ? label : `${label.slice(0, Math.max(1, max - 1))}…`;
}

/** Round a y-axis span out to readable ticks. */
function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) { min -= 1; max += 1; }
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) || magnitude * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { lo, hi, ticks };
}

/**
 * The pixel span of a run of years, held inside the plot.
 *
 * The x scale puts year 1 exactly on the left edge and the last year exactly
 * on the right, so a band drawn half a cell either side of its run would hang
 * outside the plot and over the axis labels. Clamping the edge, not the
 * centre, keeps the run flush with the axis it belongs to.
 */
function runSpan(x, cell, from, to, left, right, gap = 2) {
  const a = Math.max(left, x(from) - cell / 2);
  const b = Math.min(right, x(to) + cell / 2);
  return { x: a, width: Math.max(2, b - a - gap) };
}

/** A rectangle with two rounded corners at the top. Bars sit on the baseline. */
function topRoundedPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, Math.max(0, height));
  if (height <= 0) return `M${x},${y}h${width}`;
  return `M${x},${y + height}V${y + r}a${r},${r} 0 0 1 ${r},${-r}h${width - 2 * r}`
    + `a${r},${r} 0 0 1 ${r},${r}V${y + height}Z`;
}

/* ================================================================== */
/* The year rail                                                       */
/* ================================================================== */

/**
 * spec = {
 *   horizon, selected, onSelect,
 *   bands: [{ key, label, colorVar, signs: [true|false per year] }]
 * }
 *
 * One band per option, so a list of seven options is seven rows of eight
 * pixels rather than seven captioned blocks. The name sits in a gutter on the
 * left, which is what lets the rail hold a whole comparison.
 */
export function yearRail(host, initial) {
  let spec = initial;
  const id = `rail${uid += 1}`;
  host.classList.add('rail');

  const svg = svgEl('svg', {
    class: 'rail-svg',
    role: 'slider',
    tabindex: '0',
    'aria-label': 'Year of death',
    'aria-valuemin': '1',
  });
  host.appendChild(svg);

  const padOf = (width) => ({
    left: width < 560 ? 76 : 116,   // the gutter that holds each option name
    right: width < 480 ? 12 : 16,
  });

  const pick = (clientX) => {
    const box = svg.getBoundingClientRect();
    const pad = padOf(box.width);
    const inner = Math.max(1, box.width - pad.left - pad.right);
    const ratio = clamp((clientX - box.left - pad.left) / inner, 0, 1);
    return Math.round(1 + ratio * (spec.horizon - 1));
  };

  let dragging = false;
  const send = (year) => { if (spec.onSelect) spec.onSelect(clamp(year, 1, spec.horizon)); };

  svg.addEventListener('pointerdown', (event) => {
    dragging = true;
    svg.setPointerCapture(event.pointerId);
    send(pick(event.clientX));
  });
  svg.addEventListener('pointermove', (event) => { if (dragging) send(pick(event.clientX)); });
  svg.addEventListener('pointerup', (event) => {
    dragging = false;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  });
  svg.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 5 : 1;
    const moves = {
      ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step,
      Home: -spec.horizon, End: spec.horizon,
      PageDown: -5, PageUp: 5,
    };
    if (moves[event.key] === undefined) return;
    event.preventDefault();
    send(spec.selected + moves[event.key]);
  });

  function draw() {
    const width = Math.max(240, host.clientWidth);
    const pad = padOf(width);
    const bandHeight = 9;
    const gap = 5;
    const top = 22;
    const bandsBottom = top + spec.bands.length * (bandHeight + gap) - gap;
    const height = bandsBottom + 6;

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-valuemax', String(spec.horizon));
    svg.setAttribute('aria-valuenow', String(spec.selected));
    svg.setAttribute('aria-valuetext', `Year ${spec.selected}`);
    clear(svg);

    const inner = width - pad.left - pad.right;
    const x = (year) => pad.left + ((year - 1) / (spec.horizon - 1)) * inner;
    const cell = inner / (spec.horizon - 1);

    const defs = svgEl('defs');
    const hatch = svgEl('pattern', {
      id: `${id}-hatch`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
    });
    hatch.appendChild(svgEl('rect', { width: 6, height: 6 }, { fill: 'var(--loss-wash-strong)' }));
    hatch.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, 'stroke-width': 2.5 }, { stroke: 'var(--loss)' }));
    defs.appendChild(hatch);
    svg.appendChild(defs);

    // Year ticks along the top.
    [1, 5, 10, 15, 20, 25, 30].filter((y) => y <= spec.horizon).forEach((year) => {
      svg.appendChild(svgEl('line', {
        x1: x(year), y1: top - 8, x2: x(year), y2: top - 4, 'stroke-width': 1,
      }, { stroke: 'var(--rule-strong)' }));
      const label = svgEl('text', {
        x: x(year), y: top - 12, 'text-anchor': year === 1 ? 'start' : (year === spec.horizon ? 'end' : 'middle'),
        class: 'rail-tick',
      });
      label.textContent = year;
      svg.appendChild(label);
    });

    // One band per option. Contiguous runs of the same sign draw as one rounded bar.
    spec.bands.forEach((band, index) => {
      const y = top + index * (bandHeight + gap);

      const name = svgEl('text', {
        x: pad.left - 8, y: y + bandHeight - 1, 'text-anchor': 'end', class: 'rail-name',
      });
      name.textContent = fit(band.label, pad.left - 12);
      const title = svgEl('title');
      title.textContent = band.label;
      name.appendChild(title);
      svg.appendChild(name);

      const runs = [];
      band.signs.forEach((positive, i) => {
        const last = runs[runs.length - 1];
        if (last && last.positive === positive) last.end = i + 1;
        else runs.push({ positive, start: i + 1, end: i + 1 });
      });

      runs.forEach((run) => {
        const span = runSpan(x, cell, run.start, run.end, pad.left, width - pad.right);
        const rect = svgEl('rect', {
          x: span.x,
          y,
          width: span.width,   // a 2px gap between runs
          height: bandHeight,
          rx: 4,
        }, { fill: run.positive ? `var(${band.colorVar})` : `url(#${id}-hatch)` });
        const runTitle = svgEl('title');
        runTitle.textContent = `${band.label} — ${run.positive ? 'surplus' : 'loss'} `
          + `in year${run.start === run.end ? ` ${run.start}` : `s ${run.start} to ${run.end}`}`;
        rect.appendChild(runTitle);
        svg.appendChild(rect);
      });
    });

    // The handle.
    const hx = x(spec.selected);
    svg.appendChild(svgEl('line', {
      x1: hx, y1: top - 4, x2: hx, y2: bandsBottom, 'stroke-width': 2,
    }, { stroke: 'var(--ink)' }));
    svg.appendChild(svgEl('circle', {
      cx: hx, cy: top - 6, r: 5, 'stroke-width': 2,
    }, { fill: 'var(--ink)', stroke: 'var(--surface)' }));
  }

  const observer = new ResizeObserver(draw);
  observer.observe(host);
  draw();

  return {
    update(next) { spec = { ...spec, ...next }; draw(); },
    focus() { svg.focus(); },
  };
}

/* ================================================================== */
/* A shared tooltip                                                    */
/* ================================================================== */

function makeTip(host) {
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  host.appendChild(tip);
  return tip;
}

const tipRow = (label, value, colorVar, extra = '') => {
  const mark = colorVar ? `<i style="background:var(${colorVar})"></i>` : '';
  return `<span class="viz-tip-row ${extra}">${mark}${escapeHtml(label)}`
    + `<b>${escapeHtml(value)}</b></span>`;
};

/* ================================================================== */
/* The line chart                                                      */
/* ================================================================== */

/**
 * spec = {
 *   series: [{ key, label, colorVar, values: number[] }],   values start at year 1
 *   threshold: { label, values: number[] } | null,
 *   horizon, selected, onPickYear,
 *   format: (n) => string,
 *   lossBelowZero: boolean,
 *   height: number,
 *   ariaLabel: string
 * }
 */
export function lineChart(host, initial) {
  let spec = initial;
  host.classList.add('viz');

  const svg = svgEl('svg', { class: 'viz-svg', role: 'img' });
  const tip = makeTip(host);
  host.insertBefore(svg, tip);

  let plot = null; // geometry from the last draw, used by the pointer handlers

  const yearAt = (clientX) => {
    if (!plot) return spec.selected;
    const box = svg.getBoundingClientRect();
    const ratio = clamp((clientX - box.left - plot.left) / plot.innerWidth, 0, 1);
    return Math.round(1 + ratio * (spec.horizon - 1));
  };

  svg.addEventListener('pointermove', (event) => showTip(yearAt(event.clientX), event));
  svg.addEventListener('pointerleave', hideTip);
  svg.addEventListener('click', (event) => {
    if (spec.onPickYear) spec.onPickYear(yearAt(event.clientX));
  });

  function hideTip() {
    tip.hidden = true;
    if (plot) clear(plot.hoverLayer);
  }

  function showTip(year, event) {
    if (!plot) return;
    clear(plot.hoverLayer);
    const cx = plot.x(year);

    plot.hoverLayer.appendChild(svgEl('line', {
      x1: cx, y1: plot.top, x2: cx, y2: plot.bottom, 'stroke-width': 1, 'stroke-dasharray': '3 3',
    }, { stroke: 'var(--rule-strong)' }));

    // Highest first, so the tooltip reads in the same order as the lines.
    const ranked = spec.series
      .map((s) => ({ s, value: s.values[year - 1] }))
      .sort((a, b) => b.value - a.value);

    const lines = [`<span class="viz-tip-year">Year ${year}</span>`];
    ranked.forEach(({ s, value }) => {
      plot.hoverLayer.appendChild(svgEl('circle', {
        cx, cy: plot.y(value), r: 5, 'stroke-width': 2,
      }, { fill: `var(${s.colorVar})`, stroke: 'var(--surface)' }));
      lines.push(tipRow(s.label, spec.format(value), s.colorVar));
    });
    if (spec.threshold) {
      lines.push(tipRow(spec.threshold.label, spec.format(spec.threshold.values[year - 1]),
        null, 'viz-tip-rule'));
    }
    tip.innerHTML = lines.join('');
    tip.hidden = false;

    const hostBox = host.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = clamp(cx - width / 2, 4, Math.max(4, hostBox.width - width - 4));
    tip.style.left = `${left}px`;
    tip.style.top = `${clamp((event ? event.clientY - hostBox.top : plot.top) - 12, 0, hostBox.height)}px`;
  }

  function draw() {
    const width = Math.max(260, host.clientWidth);
    const compact = width < 520;
    const height = spec.height || (compact ? 220 : 300);
    const labelWidth = compact ? 0 : (spec.series.length > 4 ? 128 : 96);
    const pad = {
      top: 14,
      right: compact ? 14 : labelWidth,   // room for the direct labels
      bottom: compact ? 30 : 44,          // room for the ticks and the axis title
      left: compact ? 48 : 64,
    };

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', spec.ariaLabel || '');
    clear(svg);

    const innerWidth = Math.max(40, width - pad.left - pad.right);
    const innerHeight = height - pad.top - pad.bottom;

    const all = spec.series.flatMap((s) => s.values)
      .concat(spec.threshold ? spec.threshold.values : [])
      .filter(Number.isFinite);
    let min = Math.min(...all);
    let max = Math.max(...all);
    // The baseline is only forced to zero where zero is meaningful: a margin
    // chart needs the sign line, a money chart reads from zero. A rate chart
    // does not, so it keeps a tight domain.
    if (spec.lossBelowZero || spec.baselineZero) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    const { lo, hi, ticks } = niceTicks(min, max, compact ? 4 : 5);

    const x = (year) => pad.left + ((year - 1) / (spec.horizon - 1)) * innerWidth;
    const y = (value) => pad.top + innerHeight - ((value - lo) / (hi - lo || 1)) * innerHeight;

    // The loss region: everything under zero.
    if (lo < 0) {
      svg.appendChild(svgEl('rect', {
        x: pad.left, y: y(0), width: innerWidth, height: Math.max(0, y(lo) - y(0)),
      }, { fill: 'var(--loss-wash)' }));
      const flag = svgEl('text', { x: pad.left + 6, y: y(lo) - 6, class: 'viz-loss-flag' });
      flag.textContent = 'loss';
      svg.appendChild(flag);
    }

    // Gridlines and the y axis.
    ticks.forEach((value) => {
      const isZero = value === 0;
      svg.appendChild(svgEl('line', {
        x1: pad.left, y1: y(value), x2: pad.left + innerWidth, y2: y(value), 'stroke-width': 1,
      }, { stroke: isZero ? 'var(--rule-strong)' : 'var(--rule)' }));
      const label = svgEl('text', {
        x: pad.left - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'viz-tick',
      });
      label.textContent = spec.formatTick ? spec.formatTick(value) : spec.format(value);
      svg.appendChild(label);
    });

    // The x axis.
    const xTicks = (compact ? [1, 10, 20, 30] : [1, 5, 10, 15, 20, 25, 30]).filter((v) => v <= spec.horizon);
    xTicks.forEach((year) => {
      const label = svgEl('text', {
        x: x(year), y: pad.top + innerHeight + 18, class: 'viz-tick',
        'text-anchor': year === 1 ? 'start' : (year === spec.horizon ? 'end' : 'middle'),
      });
      label.textContent = year;
      svg.appendChild(label);
    });
    if (!compact) {
      const axisTitle = svgEl('text', {
        x: pad.left + innerWidth / 2, y: height - 4, 'text-anchor': 'middle', class: 'viz-axis-title',
      });
      axisTitle.textContent = 'year of death';
      svg.appendChild(axisTitle);
    }

    // The marker at the selected year.
    svg.appendChild(svgEl('line', {
      x1: x(spec.selected), y1: pad.top, x2: x(spec.selected), y2: pad.top + innerHeight, 'stroke-width': 1.5,
    }, { stroke: 'var(--ink)', opacity: '0.28' }));

    const path = (values) => values
      .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index + 1).toFixed(2)},${y(value).toFixed(2)}`)
      .join(' ');

    // The threshold: the bill, or funeral inflation.
    if (spec.threshold) {
      svg.appendChild(svgEl('path', {
        d: path(spec.threshold.values), fill: 'none', 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
      }, { stroke: 'var(--ink-muted)' }));
    }

    // The series. A 2px surface halo keeps two crossing lines apart.
    spec.series.forEach((s) => {
      svg.appendChild(svgEl('path', {
        d: path(s.values), fill: 'none', 'stroke-width': 4,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, { stroke: 'var(--surface)', opacity: '0.75' }));
    });
    spec.series.forEach((s) => {
      svg.appendChild(svgEl('path', {
        d: path(s.values), fill: 'none', 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, { stroke: `var(${s.colorVar})` }));
    });

    // Direct labels at the right end, on wide screens only.
    if (!compact) {
      const marks = spec.series.map((s) => ({
        label: s.label, colorVar: s.colorVar, y: y(s.values[s.values.length - 1]),
      }));
      if (spec.threshold) {
        marks.push({
          label: spec.threshold.label, colorVar: null,
          y: y(spec.threshold.values[spec.threshold.values.length - 1]),
        });
      }
      marks.sort((a, b) => a.y - b.y);
      const step = 14;
      for (let i = 1; i < marks.length; i += 1) {
        if (marks[i].y - marks[i - 1].y < step) marks[i].y = marks[i - 1].y + step;
      }
      // If the stack ran past the bottom, slide the whole run back up.
      const overflow = marks.length ? marks[marks.length - 1].y - (height - 6) : 0;
      if (overflow > 0) marks.forEach((mark) => { mark.y -= overflow; });

      marks.forEach((mark) => {
        const textX = pad.left + innerWidth + (mark.colorVar ? 14 : 6);
        if (mark.colorVar) {
          svg.appendChild(svgEl('circle', {
            cx: pad.left + innerWidth + 6, cy: mark.y - 4, r: 4,
          }, { fill: `var(${mark.colorVar})` }));
        }
        const text = svgEl('text', { x: textX, y: mark.y, class: 'viz-direct-label' });
        text.textContent = fit(mark.label, width - textX - 2);
        const title = svgEl('title');
        title.textContent = mark.label;
        text.appendChild(title);
        svg.appendChild(text);
      });
    }

    const hoverLayer = svgEl('g', { class: 'viz-hover' });
    svg.appendChild(hoverLayer);

    plot = {
      x, y, left: pad.left, top: pad.top, bottom: pad.top + innerHeight, innerWidth, hoverLayer,
    };
  }

  const observer = new ResizeObserver(() => { hideTip(); draw(); });
  observer.observe(host);
  draw();

  return {
    update(next) { spec = { ...spec, ...next }; hideTip(); draw(); },
  };
}

/* ================================================================== */
/* Who wins each year                                                  */
/* ================================================================== */

/**
 * The yearly winner, as one figure. Two encodings of the same fact, stacked:
 *
 *   the strip   which option is ahead, as a run of years in that option's
 *               colour, named where the run is wide enough to hold the name
 *   the bars    by how much it is ahead of the runner-up, in dollars
 *
 * A colour alone would say who wins and hide that the lead is eleven dollars.
 * A bar alone would say how much and hide who. Both together are the tool.
 *
 * spec = {
 *   horizon, selected, onPickYear,
 *   years: [{ year, key, name, colorVar, lead, tie, runnerUp: {name, total} | null,
 *             rows: [{label, value, colorVar}] }],
 *   runs: [{ key, name, colorVar, from, to, tie }],
 *   format, formatTick, ariaLabel
 * }
 */
export function winnerChart(host, initial) {
  let spec = initial;
  host.classList.add('viz');

  const svg = svgEl('svg', { class: 'viz-svg', role: 'img' });
  const tip = makeTip(host);
  host.insertBefore(svg, tip);

  let plot = null;

  const yearAt = (clientX) => {
    if (!plot) return spec.selected;
    const box = svg.getBoundingClientRect();
    const ratio = clamp((clientX - box.left - plot.left) / plot.innerWidth, 0, 1);
    return Math.round(1 + ratio * (spec.horizon - 1));
  };

  svg.addEventListener('pointermove', (event) => showTip(yearAt(event.clientX), event));
  svg.addEventListener('pointerleave', hideTip);
  svg.addEventListener('click', (event) => {
    if (spec.onPickYear) spec.onPickYear(yearAt(event.clientX));
  });

  function hideTip() {
    tip.hidden = true;
    if (plot) clear(plot.hoverLayer);
  }

  function showTip(year, event) {
    if (!plot) return;
    clear(plot.hoverLayer);
    const entry = spec.years[year - 1];
    if (!entry) return;

    const cx = plot.x(year);
    plot.hoverLayer.appendChild(svgEl('line', {
      x1: cx, y1: plot.top, x2: cx, y2: plot.bottom, 'stroke-width': 1, 'stroke-dasharray': '3 3',
    }, { stroke: 'var(--rule-strong)' }));

    const lines = [`<span class="viz-tip-year">Year ${year}</span>`];
    lines.push(tipRow(entry.tie ? 'Level' : `${entry.name} wins`,
      entry.tie ? '—' : spec.format(entry.lead), entry.colorVar));
    if (entry.runnerUp && !entry.tie) {
      lines.push(tipRow(`over ${entry.runnerUp.name}`, spec.format(entry.runnerUp.total),
        null, 'viz-tip-rule'));
    }
    (entry.rows || []).forEach((row) => lines.push(tipRow(row.label, row.value, row.colorVar)));

    tip.innerHTML = lines.join('');
    tip.hidden = false;

    const hostBox = host.getBoundingClientRect();
    const width = tip.offsetWidth;
    tip.style.left = `${clamp(cx - width / 2, 4, Math.max(4, hostBox.width - width - 4))}px`;
    tip.style.top = `${clamp((event ? event.clientY - hostBox.top : plot.top) - 12, 0, hostBox.height)}px`;
  }

  function draw() {
    const width = Math.max(260, host.clientWidth);
    const compact = width < 520;
    const stripHeight = 22;
    const stripGap = 12;
    const height = spec.height || (compact ? 210 : 250);
    const pad = {
      top: 14, right: compact ? 10 : 16, bottom: compact ? 30 : 44, left: compact ? 48 : 64,
    };

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', spec.ariaLabel || '');
    clear(svg);

    const innerWidth = Math.max(40, width - pad.left - pad.right);
    const plotTop = pad.top + stripHeight + stripGap;
    const innerHeight = Math.max(40, height - plotTop - pad.bottom);

    const x = (year) => pad.left + ((year - 1) / (spec.horizon - 1)) * innerWidth;
    const right = pad.left + innerWidth;
    const cell = innerWidth / (spec.horizon - 1);
    // Thin marks: a bar takes two thirds of its cell, so the surface gap
    // between one year and the next is always visible.
    const barWidth = clamp(cell * 0.66, 3, 26);

    const leads = spec.years.map((e) => e.lead).filter(Number.isFinite);
    const { hi, ticks } = niceTicks(0, Math.max(1, ...leads), compact ? 3 : 4);
    const y = (value) => plotTop + innerHeight - (value / (hi || 1)) * innerHeight;

    // --- the strip: one segment per run of years ---
    spec.runs.forEach((run) => {
      const span = runSpan(x, cell, run.from, run.to, pad.left, right);
      const rect = svgEl('rect', {
        x: span.x, y: pad.top, width: span.width, height: stripHeight, rx: 4,
      }, { fill: run.tie ? 'var(--rule-strong)' : `var(${run.colorVar})` });
      const title = svgEl('title');
      title.textContent = `${run.name} — year${run.from === run.to ? ` ${run.from}` : `s ${run.from} to ${run.to}`}`;
      rect.appendChild(title);
      svg.appendChild(rect);

      // A name cut to one or two letters names nothing. Below that width the
      // run says who it is through its colour, the legend and the run list.
      const label = fit(run.name, span.width - 10);
      if (label.replace('…', '').length >= 5) {
        const text = svgEl('text', {
          x: span.x + span.width / 2, y: pad.top + stripHeight - 7,
          'text-anchor': 'middle', class: 'viz-strip-label',
        });
        text.textContent = label;
        svg.appendChild(text);
      }
    });

    // --- gridlines and the y axis ---
    ticks.forEach((value) => {
      svg.appendChild(svgEl('line', {
        x1: pad.left, y1: y(value), x2: pad.left + innerWidth, y2: y(value), 'stroke-width': 1,
      }, { stroke: value === 0 ? 'var(--rule-strong)' : 'var(--rule)' }));
      const label = svgEl('text', {
        x: pad.left - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'viz-tick',
      });
      label.textContent = spec.formatTick ? spec.formatTick(value) : spec.format(value);
      svg.appendChild(label);
    });

    // --- the marker at the selected year ---
    svg.appendChild(svgEl('line', {
      x1: x(spec.selected), y1: pad.top, x2: x(spec.selected), y2: plotTop + innerHeight,
      'stroke-width': 1.5,
    }, { stroke: 'var(--ink)', opacity: '0.28' }));

    // --- the bars: the lead over the runner-up ---
    spec.years.forEach((entry) => {
      const barHeight = Math.max(0, y(0) - y(entry.lead));
      const barX = clamp(x(entry.year) - barWidth / 2, pad.left, right - barWidth);
      const bar = svgEl('path', {
        d: topRoundedPath(barX, y(entry.lead), barWidth, barHeight, 4),
      }, { fill: entry.tie ? 'var(--rule-strong)' : `var(${entry.colorVar})` });
      const title = svgEl('title');
      title.textContent = entry.tie
        ? `Year ${entry.year} — level`
        : `Year ${entry.year} — ${entry.name} ahead by ${spec.format(entry.lead)}`;
      bar.appendChild(title);
      svg.appendChild(bar);
    });

    // --- the x axis ---
    const xTicks = (compact ? [1, 10, 20, 30] : [1, 5, 10, 15, 20, 25, 30]).filter((v) => v <= spec.horizon);
    xTicks.forEach((year) => {
      const label = svgEl('text', {
        x: x(year), y: plotTop + innerHeight + 18, class: 'viz-tick',
        'text-anchor': year === 1 ? 'start' : (year === spec.horizon ? 'end' : 'middle'),
      });
      label.textContent = year;
      svg.appendChild(label);
    });
    if (!compact) {
      const axisTitle = svgEl('text', {
        x: pad.left + innerWidth / 2, y: height - 4, 'text-anchor': 'middle', class: 'viz-axis-title',
      });
      axisTitle.textContent = 'year of death';
      svg.appendChild(axisTitle);
    }

    const hoverLayer = svgEl('g', { class: 'viz-hover' });
    svg.appendChild(hoverLayer);

    plot = {
      x, left: pad.left, top: pad.top, bottom: plotTop + innerHeight, innerWidth, hoverLayer,
    };
  }

  const observer = new ResizeObserver(() => { hideTip(); draw(); });
  observer.observe(host);
  draw();

  return {
    update(next) { spec = { ...spec, ...next }; hideTip(); draw(); },
  };
}
