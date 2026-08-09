/**
 * Zlomkový pás a číselná osa - alternativní vizualizace (UCV-LEARN-001).
 * Zlomky: obdélník dělený na d dílů, n vybarvených ("koláč" jako pás).
 * Záporná čísla: číselná osa s tečkou na hodnotě.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/**
 * Zlomkový pás pro {n, d}. Nepravý zlomek (n > d) se vykreslí jako
 * víc pásů pod sebou.
 */
export function createFractionBar({ n, d }, labelText = null) {
  const wrap = document.createElement('div');
  wrap.className = 'fraction-bar-viz';

  const whole = Math.max(1, Math.ceil(Math.abs(n) / d));
  const width = 200;
  const height = 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${whole * (height + 6)}`, class: 'fraction-bar-svg' });

  let remaining = Math.abs(n);
  for (let w = 0; w < whole; w++) {
    const y = w * (height + 6);
    const partWidth = width / d;
    for (let i = 0; i < d; i++) {
      const filled = remaining > 0;
      svg.appendChild(
        svgEl('rect', {
          x: i * partWidth,
          y,
          width: partWidth - 2,
          height,
          rx: 3,
          fill: filled ? '#7ee08c' : '#232b57',
          stroke: '#3d4668',
        })
      );
      if (filled) {
        remaining--;
      }
    }
  }

  const label = document.createElement('span');
  label.className = 'fraction-bar-label';
  label.textContent = labelText ?? `${n}/${d}`;

  wrap.append(svg, label);
  return wrap;
}

/**
 * Číselná osa s vyznačenou hodnotou (pro rovnice se zápornými čísly).
 * @param {number} value hodnota (tečka)
 * @param {number} [range] rozsah osy -range..range
 */
export function createNumberLine(value, range = 10) {
  const lo = Math.min(-range, Math.floor(value) - 2);
  const hi = Math.max(range, Math.ceil(value) + 2);
  const width = 280;
  const height = 60;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'numberline-svg', role: 'img', 'aria-label': `Číselná osa, hodnota ${value}` });

  const toX = (v) => ((v - lo) / (hi - lo)) * (width - 20) + 10;

  svg.appendChild(svgEl('line', { x1: 5, y1: 30, x2: width - 5, y2: 30, stroke: '#9aa3c7', 'stroke-width': 2 }));
  for (let v = lo; v <= hi; v++) {
    const x = toX(v);
    svg.appendChild(svgEl('line', { x1: x, y1: 24, x2: x, y2: 36, stroke: '#9aa3c7', 'stroke-width': v === 0 ? 3 : 1.5 }));
    if (v % 2 === 0 || hi - lo <= 12) {
      const t = svgEl('text', { x, y: 52, 'text-anchor': 'middle', fill: '#9aa3c7', 'font-size': 11 });
      t.textContent = String(v);
      svg.appendChild(t);
    }
  }
  // tečka na hodnotě
  svg.appendChild(svgEl('circle', { cx: toX(value), cy: 30, r: 7, fill: '#ffd94d', stroke: '#b8860b', 'stroke-width': 2 }));
  const label = svgEl('text', { x: toX(value), y: 14, 'text-anchor': 'middle', fill: '#ffd94d', 'font-size': 13, 'font-weight': 700 });
  label.textContent = Number.isInteger(value) ? String(value) : value.toFixed(1);
  svg.appendChild(label);

  const wrap = document.createElement('div');
  wrap.className = 'numberline';
  wrap.appendChild(svg);
  return wrap;
}
