/**
 * Blocky SVG ilustrace dílů z dílny a hotového droida (vlastní grafika,
 * DEC-006). Každý díl v PARTS má svůj obrázek - hráč (často předškolák,
 * který ještě váhá se čtením) musí poznat, co staví, i bez názvu.
 *
 * Bez fallbacku: nový díl bez ilustrace se pozná hned (kreslí se výrazný
 * otazník s třídou .part-art-missing) a navíc na to sedne datový test
 * hasPartArt() nad PARTS - fallback typu 'nakresli něco jiného' by chybu
 * schoval až do ruky hráče (viz createPlanetArt a poušť).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/** Barvy podle skupiny - stejná paleta jako v CSS akcentech skupin. */
const METAL = '#9aa3c7';
const METAL_DARK = '#5b6488';
const SABER = '#6fd3ff';
const HULL = '#c3cbe8';
const DROID = '#e2e6f5';
const DROID_ACCENT = '#4da3ff';
const ARMOR = '#ffd94d';
const ARMOR_DARK = '#b58a1e';

/** Kresby dílů do viewBoxu 0 0 40 40. */
const PART_ART = {
  'sword-hilt': (svg) => {
    svg.appendChild(svgEl('rect', { x: 16, y: 8, width: 8, height: 24, rx: 3, fill: METAL }));
    svg.appendChild(svgEl('rect', { x: 14, y: 16, width: 12, height: 3, fill: METAL_DARK }));
    svg.appendChild(svgEl('rect', { x: 14, y: 24, width: 12, height: 3, fill: METAL_DARK }));
  },
  'sword-emitter': (svg) => {
    svg.appendChild(svgEl('rect', { x: 15, y: 18, width: 10, height: 14, rx: 3, fill: METAL }));
    svg.appendChild(svgEl('rect', { x: 13, y: 13, width: 14, height: 6, rx: 2, fill: METAL_DARK }));
    svg.appendChild(svgEl('circle', { cx: 20, cy: 12, r: 3, fill: SABER }));
  },
  'sword-blade': (svg) => {
    svg.appendChild(svgEl('rect', { x: 17, y: 4, width: 6, height: 22, rx: 3, fill: SABER }));
    svg.appendChild(svgEl('rect', { x: 16, y: 26, width: 8, height: 10, rx: 3, fill: METAL }));
  },
  'sword-heart': (svg) => {
    svg.appendChild(svgEl('polygon', { points: '20,6 30,16 26,34 14,34 10,16', fill: '#d5a6ff' }));
    svg.appendChild(svgEl('polygon', { points: '20,6 20,34 26,34 30,16', fill: '#8b56c9' }));
  },
  'ship-hull': (svg) => {
    svg.appendChild(svgEl('polygon', { points: '20,4 32,30 8,30', fill: HULL }));
    svg.appendChild(svgEl('rect', { x: 8, y: 30, width: 24, height: 6, rx: 2, fill: METAL_DARK }));
  },
  'ship-engine': (svg) => {
    svg.appendChild(svgEl('rect', { x: 12, y: 6, width: 16, height: 18, rx: 3, fill: HULL }));
    svg.appendChild(svgEl('polygon', { points: '12,24 28,24 24,32 16,32', fill: METAL_DARK }));
    svg.appendChild(svgEl('polygon', { points: '16,32 24,32 20,38', fill: '#ff8f2b' }));
  },
  'ship-cockpit': (svg) => {
    svg.appendChild(svgEl('path', { d: 'M 8 28 a 12 12 0 0 1 24 0 z', fill: HULL }));
    svg.appendChild(svgEl('path', { d: 'M 13 27 a 7 7 0 0 1 14 0 z', fill: SABER }));
    svg.appendChild(svgEl('rect', { x: 6, y: 28, width: 28, height: 5, rx: 2, fill: METAL_DARK }));
  },
  'ship-wings': (svg) => {
    svg.appendChild(svgEl('polygon', { points: '18,8 18,32 4,32', fill: HULL }));
    svg.appendChild(svgEl('polygon', { points: '22,8 22,32 36,32', fill: METAL }));
  },
  // Kopule s anténou a okem - bez antény a tmavého kroužku splývala ikona
  // hlavy droida s kokpitem lodi (obojí kopule s modrým sklem).
  'droid-head': (svg) => {
    svg.appendChild(svgEl('line', { x1: 20, y1: 12, x2: 20, y2: 4, stroke: METAL, 'stroke-width': 2 }));
    svg.appendChild(svgEl('circle', { cx: 20, cy: 4, r: 2.5, fill: '#ff8f2b' }));
    svg.appendChild(svgEl('path', { d: 'M 8 28 a 12 12 0 0 1 24 0 z', fill: DROID }));
    svg.appendChild(svgEl('circle', { cx: 20, cy: 21, r: 5, fill: METAL_DARK }));
    svg.appendChild(svgEl('circle', { cx: 20, cy: 21, r: 3, fill: DROID_ACCENT }));
    svg.appendChild(svgEl('rect', { x: 6, y: 28, width: 28, height: 6, rx: 2, fill: METAL_DARK }));
  },
  'droid-body': (svg) => {
    svg.appendChild(svgEl('rect', { x: 10, y: 6, width: 20, height: 28, rx: 5, fill: DROID }));
    svg.appendChild(svgEl('rect', { x: 14, y: 12, width: 12, height: 8, rx: 2, fill: METAL_DARK }));
    svg.appendChild(svgEl('circle', { cx: 17, cy: 26, r: 2.5, fill: DROID_ACCENT }));
    svg.appendChild(svgEl('circle', { cx: 24, cy: 26, r: 2.5, fill: '#ff8f2b' }));
  },
  'droid-legs': (svg) => {
    svg.appendChild(svgEl('rect', { x: 11, y: 8, width: 6, height: 22, rx: 2, fill: DROID }));
    svg.appendChild(svgEl('rect', { x: 23, y: 8, width: 6, height: 22, rx: 2, fill: DROID }));
    svg.appendChild(svgEl('rect', { x: 8, y: 30, width: 12, height: 6, rx: 2, fill: METAL_DARK }));
    svg.appendChild(svgEl('rect', { x: 20, y: 30, width: 12, height: 6, rx: 2, fill: METAL_DARK }));
  },
  'armor-helmet': (svg) => {
    svg.appendChild(svgEl('path', { d: 'M 8 30 a 12 13 0 0 1 24 0 z', fill: ARMOR }));
    svg.appendChild(svgEl('rect', { x: 11, y: 20, width: 18, height: 6, rx: 3, fill: '#2b3252' }));
    svg.appendChild(svgEl('rect', { x: 8, y: 30, width: 24, height: 5, rx: 2, fill: ARMOR_DARK }));
  },
  'armor-cloak': (svg) => {
    svg.appendChild(svgEl('polygon', { points: '20,4 30,10 34,36 6,36 10,10', fill: ARMOR }));
    svg.appendChild(svgEl('polygon', { points: '20,4 20,36 34,36 30,10', fill: ARMOR_DARK }));
    svg.appendChild(svgEl('rect', { x: 16, y: 4, width: 8, height: 4, rx: 2, fill: '#2b3252' }));
  },
  'armor-gloves': (svg) => {
    svg.appendChild(svgEl('rect', { x: 6, y: 12, width: 12, height: 18, rx: 4, fill: ARMOR }));
    svg.appendChild(svgEl('rect', { x: 22, y: 12, width: 12, height: 18, rx: 4, fill: ARMOR }));
    svg.appendChild(svgEl('rect', { x: 6, y: 24, width: 12, height: 4, fill: ARMOR_DARK }));
    svg.appendChild(svgEl('rect', { x: 22, y: 24, width: 12, height: 4, fill: ARMOR_DARK }));
  },
};

/** Má díl vlastní ilustraci? Datový test nad PARTS se ptá právě tímhle. */
export function hasPartArt(partId) {
  return Object.hasOwn(PART_ART, partId);
}

/** Ikona dílu do dílny. Neznámý díl nakreslí otazník - je vidět i v testu. */
export function createPartArt(partId) {
  const svg = svgEl('svg', {
    viewBox: '0 0 40 40',
    class: `part-art part-art-${partId}`,
    'aria-hidden': 'true',
  });
  if (!hasPartArt(partId)) {
    svg.classList.add('part-art-missing');
    svg.appendChild(svgEl('rect', { x: 6, y: 6, width: 28, height: 28, rx: 4, fill: '#ff4d4d' }));
    const mark = svgEl('text', { x: 20, y: 29, 'text-anchor': 'middle', 'font-size': 22, fill: '#0b1026' });
    mark.textContent = '?';
    svg.appendChild(mark);
    return svg;
  }
  PART_ART[partId](svg);
  return svg;
}

/**
 * Hotový droid, který doprovází padawana na misi (UCV-REWARD-003).
 * Dekorativní - o postaveném droidovi říká text v dílně, tady je to
 * odměna pro oko, ne informace.
 */
export function createDroidCompanion() {
  const el = document.createElement('div');
  el.className = 'droid-companion';
  el.setAttribute('aria-hidden', 'true');
  const svg = svgEl('svg', { viewBox: '0 0 40 64', width: 48, height: 76, class: 'droid-art' });
  // hlava (kopule s fotoreceptorem)
  svg.appendChild(svgEl('path', { d: 'M 9 18 a 11 11 0 0 1 22 0 z', fill: DROID }));
  svg.appendChild(svgEl('circle', { cx: 20, cy: 12, r: 3.5, fill: DROID_ACCENT, class: 'droid-eye' }));
  svg.appendChild(svgEl('rect', { x: 7, y: 18, width: 26, height: 4, rx: 2, fill: METAL_DARK }));
  // trup s panelem
  svg.appendChild(svgEl('rect', { x: 10, y: 22, width: 20, height: 26, rx: 5, fill: DROID }));
  svg.appendChild(svgEl('rect', { x: 14, y: 27, width: 12, height: 7, rx: 2, fill: METAL_DARK }));
  svg.appendChild(svgEl('circle', { cx: 17, cy: 41, r: 2.5, fill: DROID_ACCENT }));
  svg.appendChild(svgEl('circle', { cx: 24, cy: 41, r: 2.5, fill: '#ff8f2b' }));
  // nohy
  svg.appendChild(svgEl('rect', { x: 12, y: 48, width: 6, height: 10, rx: 2, fill: METAL }));
  svg.appendChild(svgEl('rect', { x: 22, y: 48, width: 6, height: 10, rx: 2, fill: METAL }));
  svg.appendChild(svgEl('rect', { x: 9, y: 58, width: 12, height: 5, rx: 2, fill: METAL_DARK }));
  svg.appendChild(svgEl('rect', { x: 19, y: 58, width: 12, height: 5, rx: 2, fill: METAL_DARK }));
  el.appendChild(svg);
  return el;
}
