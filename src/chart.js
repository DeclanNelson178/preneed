/**
 * Drawing. Hand-written SVG. No library, no build step.
 *
 * Two shapes:
 *   yearRail(host, spec)   the year-of-death control, with a surplus/loss band
 *                          for each option
 *   lineChart(host, spec)  a line chart with a zero line, an optional
 *                          threshold, a red loss region, a crosshair and a
 *                          marker at the selected year
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

/* ================================================================== */
/* The year rail                                                       */
/* ================================================================== */

/**
 * spec = {
 *   horizon, selected, onSelect,
 *   bands: [{ key, label, colorVar, signs: [true|false per year] }]
 * }
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

  const padOf = (width) => ({ left: width < 480 ? 12 : 16, right: width < 480 ? 12 : 16 });

  function draw() {
    const width = Math.max(240, host.clientWidth);
    const pad = padOf(width);
    const bandHeight = 10;
    const gap = 22;          // room for the note under each band
    const top = 22;
    const bandsBottom = top + spec.bands.length * (bandHeight + gap) - gap + bandHeight;
    const height = top + spec.bands.length * (bandHeight + gap) + 4;

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
        x: x(year), y: top - 12, 'text-anchor': year === 1 ? 'start' : (year === 30 ? 'end' : 'middle'),
        class: 'rail-tick',
      });
      label.textContent = year;
      svg.appendChild(label);
    });

    // One band per option. Contiguous runs of the same sign draw as one rounded bar.
    spec.bands.forEach((band, index) => {
      const y = top + index * (bandHeight + gap);
      const runs = [];
      band.signs.forEach((positive, i) => {
        const last = runs[runs.length - 1];
        if (last && last.positive === positive) last.end = i + 1;
        else runs.push({ positive, start: i + 1, end: i + 1 });
      });

      runs.forEach((run) => {
        const left = x(run.start) - cell / 2;
        const right = x(run.end) + cell / 2;
        svg.appendChild(svgEl('rect', {
          x: clamp(left, pad.left - cell / 2, width),
          y,
          width: Math.max(2, right - left - 2), // a 2px gap between runs
          height: bandHeight,
          rx: 4,
        }, { fill: run.positive ? `var(${band.colorVar})` : `url(#${id}-hatch)` }));
      });

      const first = runs.find((run) => !run.positive);
      const note = svgEl('text', { x: pad.left, y: y + bandHeight + 13, class: 'rail-note' });  // 13px below the band
      note.textContent = first
        ? `${band.label} — loss from year ${first.start}`
        : `${band.label} — surplus in every year`;
      svg.appendChild(note);
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
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  host.appendChild(svg);
  host.appendChild(tip);

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

    const lines = [`<span class="viz-tip-year">Year ${year}</span>`];
    spec.series.forEach((s) => {
      const value = s.values[year - 1];
      plot.hoverLayer.appendChild(svgEl('circle', {
        cx, cy: plot.y(value), r: 5, 'stroke-width': 2,
      }, { fill: `var(${s.colorVar})`, stroke: 'var(--surface)' }));
      lines.push(
        `<span class="viz-tip-row"><i style="background:var(${s.colorVar})"></i>`
        + `${s.label}<b>${spec.format(value)}</b></span>`,
      );
    });
    if (spec.threshold) {
      lines.push(
        `<span class="viz-tip-row viz-tip-rule">${spec.threshold.label}`
        + `<b>${spec.format(spec.threshold.values[year - 1])}</b></span>`,
      );
    }
    tip.innerHTML = lines.join('');
    tip.hidden = false;

    const hostBox = host.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = clamp(cx - width / 2, 4, hostBox.width - width - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${clamp((event ? event.clientY - hostBox.top : plot.top) - 12, 0, hostBox.height)}px`;
  }

  function draw() {
    const width = Math.max(260, host.clientWidth);
    const compact = width < 520;
    const height = spec.height || (compact ? 220 : 280);
    const pad = {
      top: 14,
      right: compact ? 14 : 92,   // room for the direct labels
      bottom: compact ? 30 : 44,  // room for the ticks and the axis title
      left: compact ? 48 : 64,
    };

    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', spec.ariaLabel || '');
    clear(svg);

    const innerWidth = width - pad.left - pad.right;
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

    // The series.
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
      for (let i = 1; i < marks.length; i += 1) {
        if (marks[i].y - marks[i - 1].y < 15) marks[i].y = marks[i - 1].y + 15;
      }
      marks.forEach((mark) => {
        const textX = pad.left + innerWidth + (mark.colorVar ? 14 : 6);
        if (mark.colorVar) {
          svg.appendChild(svgEl('circle', {
            cx: pad.left + innerWidth + 6, cy: mark.y - 4, r: 4,
          }, { fill: `var(${mark.colorVar})` }));
        }
        const text = svgEl('text', { x: textX, y: mark.y, class: 'viz-direct-label' });
        text.textContent = mark.label;
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
