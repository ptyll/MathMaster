/**
 * Blocky SVG ilustrace planet (vlastní grafika, DEC-006).
 * Jednoduché geometrické tvary v barvách planety.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

const ART = {
  // poušť: oranžová koule + krátery + dvě slunce
  desert: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 10, cy: 12, r: 6, fill: '#ffd94d' }));
    svg.appendChild(svgEl('circle', { cx: 26, cy: 8, r: 4, fill: '#ffb84d' }));
    svg.appendChild(svgEl('circle', { cx: 50, cy: 56, r: 26, fill: '#e0a050' }));
    svg.appendChild(svgEl('circle', { cx: 42, cy: 48, r: 5, fill: '#c17f3a' }));
    svg.appendChild(svgEl('circle', { cx: 58, cy: 62, r: 4, fill: '#c17f3a' }));
    svg.appendChild(svgEl('rect', { x: 38, y: 66, width: 24, height: 5, rx: 2, fill: '#c17f3a' }));
  },
  // led: bílo-modrá koule + ledové kry
  ice: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#bfe3ff' }));
    svg.appendChild(svgEl('rect', { x: 30, y: 40, width: 14, height: 10, rx: 2, fill: '#ffffff', transform: 'rotate(-12 37 45)' }));
    svg.appendChild(svgEl('rect', { x: 52, y: 56, width: 18, height: 8, rx: 2, fill: '#ffffff', transform: 'rotate(8 61 60)' }));
    svg.appendChild(svgEl('rect', { x: 42, y: 66, width: 10, height: 6, rx: 2, fill: '#8fc7f0' }));
  },
  // bažina: zelená koule + stromy
  swamp: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#4d7c4d' }));
    svg.appendChild(svgEl('rect', { x: 36, y: 36, width: 5, height: 16, fill: '#3a5f3a' }));
    svg.appendChild(svgEl('rect', { x: 31, y: 30, width: 15, height: 8, rx: 3, fill: '#2f5230' }));
    svg.appendChild(svgEl('rect', { x: 58, y: 44, width: 5, height: 14, fill: '#3a5f3a' }));
    svg.appendChild(svgEl('rect', { x: 53, y: 38, width: 15, height: 8, rx: 3, fill: '#2f5230' }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 72, rx: 16, ry: 4, fill: '#39594d' }));
  },
  // stanice: šedá koule + příkop + anténa
  station: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#8a90a8' }));
    svg.appendChild(svgEl('rect', { x: 24, y: 49, width: 52, height: 5, fill: '#6b7186' }));
    svg.appendChild(svgEl('circle', { cx: 62, cy: 40, r: 6, fill: '#6b7186' }));
    svg.appendChild(svgEl('circle', { cx: 62, cy: 40, r: 3, fill: '#454a5e' }));
    svg.appendChild(svgEl('rect', { x: 36, y: 60, width: 8, height: 6, fill: '#6b7186' }));
  },
  // město: fialová koule + mrakodrapy
  city: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#7a5c9e' }));
    for (const [x, h] of [[32, 18], [42, 26], [54, 22], [64, 14]]) {
      svg.appendChild(svgEl('rect', { x, y: 62 - h, width: 8, height: h, fill: '#5d4680' }));
      svg.appendChild(svgEl('rect', { x: x + 2, y: 66 - h, width: 2, height: 2, fill: '#ffd94d' }));
    }
  },
};

/** Vykreslí blocky planetu (dekorativní - jméno nese tlačítko). locked = šedá + zámek. */
export function createPlanetArt(artKind, { locked = false } = {}) {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'planet-art', 'aria-hidden': 'true' });
  const draw = ART[artKind] ?? ART.desert;
  draw(svg);
  if (locked) {
    svg.classList.add('planet-locked');
    // zámek
    svg.appendChild(svgEl('rect', { x: 40, y: 44, width: 20, height: 16, rx: 3, fill: '#2b3252', stroke: '#9aa3c7', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: 'M 44 44 v -4 a 6 6 0 0 1 12 0 v 4', fill: 'none', stroke: '#9aa3c7', 'stroke-width': 3 }));
  }
  return svg;
}

/** Hvězdné pozadí (náhodné tečky, deterministické - pevné pole). */
export function createStarfield() {
  const svg = svgEl('svg', { viewBox: '0 0 400 200', class: 'starfield', 'aria-hidden': 'true' });
  let s = 42;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (let i = 0; i < 60; i++) {
    svg.appendChild(
      svgEl('circle', {
        cx: rand() * 400,
        cy: rand() * 200,
        r: rand() * 1.6 + 0.4,
        fill: '#eef1ff',
        opacity: (rand() * 0.6 + 0.3).toFixed(2),
      })
    );
  }
  return svg;
}
