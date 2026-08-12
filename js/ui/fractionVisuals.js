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

const BAR_WIDTH = 200;
const BAR_HEIGHT = 26;
/** Mezera mezi přihrádkami, odečtená od šířky každého dílku. */
const BAR_GAP = 2;
const BAR_FILL = '#7ee08c';
const BAR_TRACK = '#232b57';
const BAR_STROKE = '#3d4668';

/**
 * Do kolika dílků se pás ještě dělí. Nad tím se kreslí POMĚROVĚ.
 *
 * Pás je široký 200 px a mezi dílky nechává 2 px, takže dílek je široký
 * 200/d - 2: při d = 24 je to 6,3 px, při d = 36 už 3,6 px, při d = 50 přesně
 * tolik co mezera (2 px) a od d = 100 ZÁPORNĚ - to je neplatné SVG a dítě
 * místo hustého pásu uvidí prázdno. Přihrádka, kterou si má dítě spočítat,
 * musí být zřetelně širší než mezera, která ji odděluje; 24 je poslední
 * jmenovatel, kde je aspoň trojnásobná, a zároveň přesně to nejvíc, co hra
 * kreslila přihrádkově na stupních 1-3 (expand cílí nejvýš na 24). Nižší
 * práh by ubral přihrádky obsahu, který je dnes čitelný, vyšší by nechal
 * kreslit vlásky, které nikdo nespočítá.
 *
 * Nad prahem se místo přihrádek kreslí jeden pás vyplněný v poměru n/d.
 * Dotkne se to i staršího obsahu (add/subtract d3 se jmenovatelem 60,
 * equivalent 72, compare až 132) - je to vědomá změna vzhledu: nad ~40 dílky
 * se stejně nedají spočítat, kdežto délka sloupce zůstává čitelná a u
 * rozšiřování je právě ona ta myšlenka (7/8 a 77/88 vyjdou stejně dlouhé).
 */
const MAX_BAR_SEGMENTS = 24;

/**
 * Zlomkový pás pro {n, d}. Nepravý zlomek (n > d) se vykreslí jako
 * víc pásů pod sebou - a to i v poměrovém režimu: 73/60 je jeden CELÝ pás
 * a k tomu 13/60. Celek a zbytek je učební bod aritmetických stupňů 5 a 6,
 * takže ho poměrové kreslení nesmí spolknout do jednoho delšího sloupce.
 */
export function createFractionBar({ n, d }, labelText = null) {
  const wrap = document.createElement('div');
  wrap.className = 'fraction-bar-viz';

  const whole = Math.max(1, Math.ceil(Math.abs(n) / d));
  const width = BAR_WIDTH;
  const height = BAR_HEIGHT;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${whole * (height + 6)}`, class: 'fraction-bar-svg' });

  let remaining = Math.abs(n);
  for (let w = 0; w < whole; w++) {
    const y = w * (height + 6);
    const filledParts = Math.min(remaining, d);
    remaining -= filledParts;

    if (d <= MAX_BAR_SEGMENTS) {
      const partWidth = width / d;
      for (let i = 0; i < d; i++) {
        svg.appendChild(
          svgEl('rect', {
            x: i * partWidth,
            y,
            width: partWidth - BAR_GAP,
            height,
            rx: 3,
            fill: i < filledParts ? BAR_FILL : BAR_TRACK,
            stroke: BAR_STROKE,
          })
        );
      }
      continue;
    }

    // Poměrový režim: prázdný pás a přes něj vyplněná část n/d.
    const trackWidth = width - BAR_GAP;
    svg.appendChild(
      svgEl('rect', { x: 0, y, width: trackWidth, height, rx: 3, fill: BAR_TRACK, stroke: BAR_STROKE })
    );
    if (filledParts > 0) {
      svg.appendChild(
        svgEl('rect', {
          x: 0,
          y,
          width: (trackWidth * filledParts) / d,
          height,
          rx: 3,
          fill: BAR_FILL,
          stroke: BAR_STROKE,
        })
      );
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
