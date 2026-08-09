/**
 * Animovaná rovnoramenná váha (UCV-LEARN-001, DEC-005).
 * Misky nesou pytlíky 'x' a kostky (konstanta). Při kroku se váha
 * krátce zhoupne a znovu ustálí - rovnováha zůstává vždy.
 */

import { parseSide } from './visualParse.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/** Pytlík s popiskem (neznámá). */
function bag(x, y, label) {
  const g = svgEl('g');
  g.appendChild(svgEl('rect', { x, y, width: 34, height: 30, rx: 6, fill: '#8b6f4e', stroke: '#5d4630', 'stroke-width': 2 }));
  const text = svgEl('text', { x: x + 17, y: y + 21, 'text-anchor': 'middle', fill: '#fff', 'font-size': 15, 'font-weight': 700 });
  text.textContent = label;
  g.appendChild(text);
  return g;
}

/** Kostka (jednotka). */
function cube(x, y) {
  return svgEl('rect', { x, y, width: 14, height: 14, rx: 2, fill: '#4da3ff', stroke: '#2b6cb0', 'stroke-width': 1.5 });
}

/** Obsah misky: pytlíky + kostky podle parsované strany. */
function panContents(panX, baseY, side) {
  const g = svgEl('g');
  if (!side.xTerm && !side.constantText) {
    const t = svgEl('text', { x: panX + 45, y: baseY - 12, 'text-anchor': 'middle', fill: '#9aa3c7', 'font-size': 16 });
    t.textContent = '0';
    g.appendChild(t);
    return g;
  }
  if (side.xTerm) {
    // Miska je široká 90 - vejdou se nanejvýš dva pytlíky vedle sebe.
    // Víc než dvě x kreslíme jako jeden pytlík s koeficientem, jinak
    // by pytlíky přetekly přes misku až na sloup váhy.
    const asSingleBag = side.xTerm.count > 2 || side.xTerm.label.includes('/');
    if (asSingleBag) {
      g.appendChild(bag(panX + 28, baseY - 34, side.xTerm.label));
    } else {
      let cx = panX + 8;
      for (let i = 0; i < side.xTerm.count; i++) {
        g.appendChild(bag(cx, baseY - 34, 'x'));
        cx += 40;
      }
    }
  }
  if (side.constantText && side.constantText !== '0') {
    const value = parseInt(side.constantText.split('/')[0], 10);
    const cubes = Math.min(Math.abs(value), 9); // max 9 kostek, víc se ukáže číslem
    let cubeX = panX + 8;
    let cubeY = baseY - 18;
    for (let i = 0; i < cubes; i++) {
      g.appendChild(cube(cubeX, cubeY));
      cubeX += 18;
      if (cubeX > panX + 80) {
        cubeX = panX + 8;
        cubeY -= 18;
      }
    }
    const t = svgEl('text', { x: panX + 45, y: baseY - 52, 'text-anchor': 'middle', fill: '#9fd4ff', 'font-size': 14, 'font-weight': 700 });
    t.textContent = side.constantText;
    g.appendChild(t);
  }
  return g;
}

/**
 * Vytvoří váhu.
 * @returns {{ element: HTMLElement, show: (leftText: string, rightText: string) => void }}
 */
export function createBalanceScale() {
  const wrap = document.createElement('div');
  wrap.className = 'balance';

  const svg = svgEl('svg', { viewBox: '0 0 320 190', class: 'balance-svg', role: 'img', 'aria-label': 'Rovnoramenná váha' });

  const beamGroup = svgEl('g', { class: 'balance-beam' });
  // nosník
  beamGroup.appendChild(svgEl('rect', { x: 40, y: 58, width: 240, height: 8, rx: 4, fill: '#8b6f4e' }));
  // závěsy + misky
  for (const panX of [60, 230]) {
    beamGroup.appendChild(svgEl('line', { x1: panX + 15, y1: 66, x2: panX + 15, y2: 96, stroke: '#6b7280', 'stroke-width': 3 }));
  }
  const leftPan = svgEl('g', { class: 'balance-pan' });
  const rightPan = svgEl('g', { class: 'balance-pan' });
  beamGroup.append(leftPan, rightPan);
  svg.appendChild(beamGroup);

  // sloup a podstavec (nekývají se)
  svg.appendChild(svgEl('rect', { x: 154, y: 66, width: 12, height: 90, fill: '#6b7280' }));
  svg.appendChild(svgEl('rect', { x: 120, y: 156, width: 80, height: 10, rx: 4, fill: '#4b5563' }));

  wrap.appendChild(svg);

  function drawPan(pan, panX, side) {
    pan.innerHTML = '';
    // miska
    pan.appendChild(svgEl('path', { d: `M ${panX} 96 h 90 l -12 26 h -66 z`, fill: '#3d4668', stroke: '#5d4630', 'stroke-width': 2 }));
    pan.appendChild(panContents(panX, 96, side));
  }

  return {
    element: wrap,
    /** Zobrazí nový stav (levá/pravá strana jako text) s krátkým zhoupnutím. */
    show(leftText, rightText) {
      drawPan(leftPan, 60, parseSide(leftText));
      drawPan(rightPan, 230 - 45, parseSide(rightText));
      beamGroup.classList.remove('balance-sway');
      void wrap.offsetWidth; // restart animace
      beamGroup.classList.add('balance-sway');
    },
  };
}
