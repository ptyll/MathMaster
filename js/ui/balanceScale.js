/**
 * Animovaná rovnoramenná váha (UCV-LEARN-001, DEC-005).
 * Misky nesou pytlíky 'x' a kostky (konstanta). Při kroku se váha
 * krátce zhoupne a znovu ustálí - rovnováha zůstává vždy.
 */

import { parseSide } from './visualParse.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Věta, kterou dítě dostane místo váhy, když jednu stranu neumíme přečíst.
 * Schválně bez pokynu, co má dítě udělat: totéž znění čte i prohlížeč řešení,
 * kde se rovnice upravovat nedá. Radu, když nějaká platí, přidává krokový
 * režim vlastním popiskem pod rámem (stepInput.js).
 */
const UNREADABLE_NOTE =
  'Tenhle tvar rovnice ti na váze neukážu - radši nekreslím nic než misky, které by s rovnicí nesouhlasily.';

/**
 * Přečetl parser stranu? Prázdný výsledek (xTerm i constantText null) NENÍ
 * prázdná strana, ale „o téhle straně nic nevíme“ - a to jsou dvě různé věci.
 * SKUTEČNÁ nula přijde jako constantText '0' a prázdnou misku kreslit má.
 *
 * Nepřečtené je všechno mimo gramatiku parseSide, a to NEJSOU jen tvary se
 * záporným znaménkem. Dvě rodiny, na které se dá narazit:
 *  - záporný zlomkový koeficient ('5 - x/3', '5 - (2/3)x') - ty vyjmenovává
 *    round-trip test v test/solver.test.js jako známou díru,
 *  - zlomkový činitel před závorkou ('1/2(x + 6)'), kde není záporné číslo
 *    ani jedno; gramatika chce před závorkou celé číslo.
 * Gramatika parseSide se kvůli nim rozšiřovat NEMÁ (byl by to druhý zdroj
 * pravdy o skladbě strany vedle equationParse), tak se místo obrázku řekne
 * pravda slovy.
 */
function isReadable(side) {
  return side.xTerm !== null || side.constantText !== null;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/** Pytlík s popiskem (neznámá). Šířka se přizpůsobí, aby se popisek vešel. */
function bag(x, y, label, width = 34) {
  const g = svgEl('g');
  g.appendChild(svgEl('rect', { x, y, width, height: 30, rx: 6, fill: '#8b6f4e', stroke: '#5d4630', 'stroke-width': 2 }));
  // Písmo podle šířky pytlíku i délky popisku - 'x + 10' se do 26px
  // nevejde na patnáctce, ale na devítce ano.
  const fontSize = Math.max(8, Math.min(15, Math.floor((width - 6) / Math.max(1, label.length) * 1.7)));
  const text = svgEl('text', { x: x + width / 2, y: y + 20, 'text-anchor': 'middle', fill: '#fff', 'font-size': fontSize, 'font-weight': 700 });
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
  // Sem chodí jen strany, které parser PŘEČETL - o nepřečtené se stará show()
  // tím, že váhu vůbec neukáže. Prázdná miska je tvrzení „na téhle straně nic
  // není“ a to smí platit jedině o skutečné nule (constantText '0').
  const hasConstant = !!side.constantText && side.constantText !== '0';

  if (side.xTerm && side.xTerm.grouped) {
    // Závorka: tolik stejných pytlíků, kolik je činitel, a v každém obsah
    // závorky. Právě tohle dělá z '2(x + 10)' názornou věc.
    const count = side.xTerm.count;
    if (count <= 3) {
      const gap = 3;
      const width = Math.floor((84 - (count - 1) * gap) / count);
      let cx = panX + 4;
      for (let i = 0; i < count; i++) {
        g.appendChild(bag(cx, baseY - 34, side.xTerm.label, width));
        cx += width + gap;
      }
    } else {
      // Víc než tři skupiny se do misky nevejdou čitelně.
      g.appendChild(bag(panX + 4, baseY - 34, `${count}(${side.xTerm.label})`, 84));
    }
  } else if (side.xTerm) {
    // Miska je široká 90. Když na ní leží i kostky, zbude na pytlíky jen
    // levá polovina - proto se víc než jedno x kreslí jako jeden pytlík
    // s koeficientem. Jinak by pytlíky přetekly přes misku na sloup váhy.
    const asSingleBag =
      hasConstant || side.xTerm.count > 2 || side.xTerm.label.includes('/');
    if (asSingleBag) {
      g.appendChild(bag(panX + 4, baseY - 34, side.xTerm.label));
    } else {
      let cx = panX + 8;
      for (let i = 0; i < side.xTerm.count; i++) {
        g.appendChild(bag(cx, baseY - 34, 'x'));
        cx += 40;
      }
    }
  }
  if (hasConstant) {
    const value = parseInt(side.constantText.split('/')[0], 10);
    // Vedle pytlíku je místo jen na řádek kostek; přesnou hodnotu stejně
    // nese popisek nad miskou, kostky jsou jen názorná představa.
    // Dvě řady jsou strop - třetí by vylezla nad rameno váhy.
    const perRow = side.xTerm ? 3 : 4;
    const maxCubes = side.xTerm ? 3 : 8;
    const startX = side.xTerm ? panX + 46 : panX + 8;
    const cubes = Math.min(Math.abs(value), maxCubes);
    let cubeX = startX;
    let cubeY = baseY - 15;
    let inRow = 0;
    for (let i = 0; i < cubes; i++) {
      g.appendChild(cube(cubeX, cubeY));
      cubeX += 15;
      if (++inRow === perRow) {
        inRow = 0;
        cubeX = startX;
        cubeY -= 17;
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
 * @returns {{ element: HTMLElement, show: (leftText: string, rightText: string) => boolean }}
 *   show vrací `false`, když stranu nepřečetl a místo váhy nechal v rámu větu -
 *   volající tím pozná, že vizualizace na obrazovce NENÍ (a nesmí o ní psát).
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

  // Náhrada za váhu, když jednu stranu neumíme přečíst. V rámu je vždycky
  // buď váha, nebo tahle věta - nikdy obojí, aby dítě nečetlo omluvu k obrázku,
  // který vedle ní stojí.
  const note = document.createElement('p');
  note.className = 'balance-note';
  note.textContent = UNREADABLE_NOTE;

  function drawPan(pan, panX, side) {
    pan.innerHTML = '';
    // miska
    pan.appendChild(svgEl('path', { d: `M ${panX} 96 h 90 l -12 26 h -66 z`, fill: '#3d4668', stroke: '#5d4630', 'stroke-width': 2 }));
    pan.appendChild(panContents(panX, 96, side));
  }

  return {
    element: wrap,
    /**
     * Zobrazí nový stav (levá/pravá strana jako text) s krátkým zhoupnutím.
     * Když jednu ze stran parser nepřečte, váha se místo kreslení SCHOVÁ
     * a rám nese větu proč: prázdná miska by dítěti tvrdila, že na té straně
     * nic není, a od skutečné nuly by se to nedalo rozeznat. Totéž dělá
     * stepInput.js u nesečtené strany.
     *
     * @returns {boolean} nakreslila se váha? (`false` = místo ní stojí věta)
     */
    show(leftText, rightText) {
      const left = parseSide(leftText);
      const right = parseSide(rightText);
      if (!isReadable(left) || !isReadable(right)) {
        svg.remove();
        if (!note.parentNode) {
          wrap.appendChild(note);
        }
        return false;
      }
      note.remove();
      if (!svg.parentNode) {
        wrap.appendChild(svg);
      }
      drawPan(leftPan, 60, left);
      drawPan(rightPan, 230 - 45, right);
      beamGroup.classList.remove('balance-sway');
      void wrap.offsetWidth; // restart animace
      beamGroup.classList.add('balance-sway');
      return true;
    },
  };
}
