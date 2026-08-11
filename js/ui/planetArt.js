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
  // město v oblacích: oranžová koule, pásy mraků a plošina nad nimi
  clouds: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#e08a3c' }));
    svg.appendChild(svgEl('rect', { x: 26, y: 45, width: 32, height: 7, rx: 3.5, fill: '#ffe0b8' }));
    svg.appendChild(svgEl('rect', { x: 44, y: 60, width: 30, height: 7, rx: 3.5, fill: '#ffd3a0' }));
    svg.appendChild(svgEl('rect', { x: 46, y: 20, width: 8, height: 14, fill: '#f7c887' }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 34, rx: 15, ry: 4, fill: '#b56526' }));
  },
  // oceán: tyrkysová koule, vlny a déšť
  ocean: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#2f9fa8' }));
    svg.appendChild(svgEl('path', { d: 'M 27 54 q 7 -6 14 0 q 7 6 14 0 q 7 -6 14 0', fill: 'none', stroke: '#c6f3f0', 'stroke-width': 3 }));
    svg.appendChild(svgEl('path', { d: 'M 30 65 q 7 -6 14 0 q 7 6 14 0', fill: 'none', stroke: '#8ddcd8', 'stroke-width': 3 }));
    for (const x of [30, 42, 54, 66]) {
      svg.appendChild(svgEl('line', { x1: x, y1: 8, x2: x - 5, y2: 26, stroke: '#a8e6ff', 'stroke-width': 2 }));
    }
  },
  // láva: rozžhavená koule s ohnivými řekami a sopkou
  // Původní téměř černý povrch (#4a2b28) měl proti kartě kontrast 1.32:1 -
  // planeta na mapě nebyla vidět. Temnotu nese sopka a stíny, ne těleso.
  lava: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#a85d4e' }));
    svg.appendChild(svgEl('path', { d: 'M 26 52 q 12 7 24 -1 q 12 -8 24 1', fill: 'none', stroke: '#ff8f2b', 'stroke-width': 4 }));
    svg.appendChild(svgEl('path', { d: 'M 30 65 q 10 6 20 -2', fill: 'none', stroke: '#ffd23f', 'stroke-width': 3 }));
    svg.appendChild(svgEl('polygon', { points: '42,42 50,26 58,42', fill: '#5a2f28' }));
    svg.appendChild(svgEl('circle', { cx: 50, cy: 26, r: 4, fill: '#ffd23f' }));
  },
  // lesní měsíc: svěží zelená koule s jehličnany, nad ní růžová mateřská planeta
  // Světlejší a studenější zeleň než bažinatý Dagobah (#4d7c4d): dvě zelené
  // koule vedle sebe se od sebe musí poznat i bez čtení jména. K odstínu se
  // přidává jiná silueta (špičaté jehličnany vs. kulaté koruny) a růžová
  // mateřská planeta, kterou jinde na mapě nic nemá.
  forest: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#63ab74' }));
    for (const [x, base] of [[36, 62], [50, 52], [64, 64]]) {
      svg.appendChild(svgEl('polygon', { points: `${x},${base - 18} ${x - 7},${base} ${x + 7},${base}`, fill: '#2c5c37' }));
      svg.appendChild(svgEl('rect', { x: x - 1.5, y: base, width: 3, height: 5, fill: '#4a3524' }));
    }
    svg.appendChild(svgEl('circle', { cx: 78, cy: 20, r: 10, fill: '#f2a0c4' }));
    svg.appendChild(svgEl('ellipse', { cx: 78, cy: 20, rx: 15, ry: 4, fill: 'none', stroke: '#ffd0e4', 'stroke-width': 2 }));
  },
  // kaňony: rezavá koule s roklinami a úlovitou věží
  canyon: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#b5713a' }));
    svg.appendChild(svgEl('path', { d: 'M 30 40 l 8 13 l -6 11', fill: 'none', stroke: '#7c4620', 'stroke-width': 4 }));
    svg.appendChild(svgEl('path', { d: 'M 58 34 l 7 15 l -5 13', fill: 'none', stroke: '#7c4620', 'stroke-width': 4 }));
    svg.appendChild(svgEl('polygon', { points: '46,58 50,34 54,58', fill: '#8f5527' }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 70, rx: 18, ry: 4, fill: '#d09257' }));
  },
  // temná planeta: šedofialová koule, rudá mlha, trny a rudé oči
  // Původní téměř černá koule (#241f2e) měla proti kartě kontrast 1.03:1 -
  // Dathomir na mapě prakticky nebyl. Temnotu teď nesou detaily (mlha, trny,
  // oči), ne neviditelné těleso.
  dark: (svg) => {
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 26, fill: '#786b98' }));
    svg.appendChild(svgEl('ellipse', { cx: 50, cy: 62, rx: 23, ry: 7, fill: '#5e2036' }));
    for (const [x, base] of [[36, 58], [50, 50], [63, 60]]) {
      svg.appendChild(svgEl('polygon', { points: `${x},${base - 16} ${x - 4},${base} ${x + 4},${base}`, fill: '#33253c' }));
    }
    svg.appendChild(svgEl('circle', { cx: 43, cy: 44, r: 2.5, fill: '#5c0a1e' }));
    svg.appendChild(svgEl('circle', { cx: 57, cy: 44, r: 2.5, fill: '#5c0a1e' }));
  },
};

/**
 * Má druh planety vlastní ilustraci? Neznámý druh se tiše kreslí jako poušť,
 * takže bez téhle kontroly by nová planeta bez artu prošla i revizí.
 */
export function hasPlanetArt(artKind) {
  return Object.hasOwn(ART, artKind);
}

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
