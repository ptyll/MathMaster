import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDom, createContainer } from './domStub.js';

installDom(); // musí být dřív než import obrazovek - ty sahají na document až za běhu

const { PLANETS, CORE_PLANETS } = await import('../js/content/planets.js');
const { createMapScreen } = await import('../js/ui/mapScreen.js');
const { createInventoryOverlay } = await import('../js/ui/workshopScreen.js');
const { hasPlanetArt, createPlanetArt } = await import('../js/ui/planetArt.js');
const { createDefaultState } = await import('../js/engine/state.js');

/** Stav hráče, který má dokončené (boss mise) uvedené planety. */
function stateWithCompleted(planetIds) {
  const state = createDefaultState();
  state.planets = planetIds.map((id) => {
    const planet = PLANETS.find((p) => p.id === id);
    const boss = planet.missions[planet.missions.length - 1];
    return {
      planetId: id,
      unlockedLevels: planet.missions.length,
      starsPerLevel: { [boss.id]: 1 },
      bestStreak: 0,
    };
  });
  return state;
}

function renderMap(state, onStartMission = () => {}) {
  const container = createContainer();
  const screen = createMapScreen(container, { state, onStartMission });
  return { container, screen, root: screen.element };
}

test('TDD-MAP-002-E: mapa vykreslí kartu pro každou z 11 planet', () => {
  const { root } = renderMap(createDefaultState());
  const cards = root.querySelectorAll('.planet-card');
  assert.equal(cards.length, PLANETS.length);
  PLANETS.forEach((planet, i) => {
    assert.ok(cards[i].textContent.includes(planet.name), `chybí jméno ${planet.name}`);
  });
  // Nový hráč: odemčený jen Tatooine, zbytek se zámkem.
  assert.equal(cards[0].classList.contains('locked'), false);
  assert.ok(cards[5].classList.contains('locked'), 'Bespin má být zamčený');
  assert.ok(cards[10].textContent.includes('🔒'), 'zamčená karta má ukázat zámek');
});

test('TDD-MAP-002-F: starý save s dokončeným Coruscantem má Bespin odemčený i na mapě', () => {
  const started = [];
  const { root } = renderMap(stateWithCompleted(['coruscant']), (id) => started.push(id));
  const cards = root.querySelectorAll('.planet-card');
  const bespin = cards[PLANETS.findIndex((p) => p.id === 'bespin')];
  const kamino = cards[PLANETS.findIndex((p) => p.id === 'kamino')];
  assert.equal(bespin.classList.contains('locked'), false);
  assert.ok(kamino.classList.contains('locked'));

  bespin.click();
  const detail = root.querySelector('.planet-detail');
  assert.equal(detail.hidden, false, 'detail planety se má zobrazit');
  assert.ok(detail.textContent.includes('Bespin'));
  const missionButtons = detail.querySelectorAll('.mission-btn');
  assert.equal(missionButtons.length, 4, 'Bespin má 3 mise + bosse');
  // Dostupná je jen první mise, klik na ni spustí misi.
  assert.equal(missionButtons[0].disabled, false);
  assert.equal(missionButtons[1].disabled, true);
  missionButtons[0].click();
  assert.deepEqual(started, ['bespin-1']);
});

test('klik na zamčenou planetu misi nespustí, jen poradí', () => {
  const started = [];
  const { root } = renderMap(createDefaultState(), (id) => started.push(id));
  const locked = root.querySelectorAll('.planet-card')[3];
  locked.click();
  const tooltip = root.querySelector('.map-tooltip');
  assert.equal(tooltip.hidden, false);
  assert.ok(tooltip.textContent.includes('Dokonči'));
  assert.equal(root.querySelector('.planet-detail').hidden, true);
  assert.deepEqual(started, []);
});

test('TDD-MAP-002-G: Mistr Jedi se ukáže po pěti planetách a neslibuje všechny planety', () => {
  const state = stateWithCompleted(CORE_PLANETS.map((p) => p.id));
  const { root } = renderMap(state);
  const banner = root.querySelector('.master-jedi');
  assert.ok(banner, 'po pěti planetách má být titul Mistr Jedi');
  assert.ok(banner.textContent.includes('MISTR JEDI'));
  // Endgame planety zůstávají neodehrané - hláška o osvobození všech planet by lhala.
  assert.equal(banner.textContent.includes('Všechny planety'), false);

  const fresh = renderMap(stateWithCompleted(['tatooine', 'hoth']));
  assert.equal(fresh.root.querySelector('.master-jedi'), null);
});

test('tlačítko krystalů otevře inventář se všemi barvami včetně endgame', () => {
  const state = stateWithCompleted(['coruscant']);
  state.inventory.crystals = [{ color: 'černý', count: 2 }];
  const { root } = renderMap(state);

  const crystalsBtn = root.querySelectorAll('.btn-crystals')[0];
  assert.ok(crystalsBtn, 'chybí tlačítko inventáře');
  crystalsBtn.click();

  const cells = root.querySelectorAll('.crystal-cell');
  assert.equal(cells.length, PLANETS.length, 'inventář má ukázat barvu každé planety');
  for (const planet of PLANETS) {
    const cell = cells.find((c) => c.querySelector(`.crystal-${planet.crystalColor}`));
    assert.ok(cell, `chybí buňka pro ${planet.crystalColor} krystal`);
    assert.ok(cell.textContent.includes(planet.name), `${planet.crystalColor} nemá zdrojovou planetu`);
  }
  const black = cells.find((c) => c.querySelector('.crystal-černý'));
  assert.ok(black.textContent.includes('×2'), 'počet krystalů se má propsat');
});

test('tlačítko dílny otevře dílnu', () => {
  const { root } = renderMap(stateWithCompleted(['coruscant']));
  const workshopBtn = root
    .querySelectorAll('button')
    .find((b) => b.textContent.includes('Dílna'));
  assert.ok(workshopBtn, 'chybí tlačítko dílny');
  workshopBtn.click();
  assert.ok(root.querySelector('.parts-list'), 'dílna se nezobrazila');
});

test('inventář bez krystalů poradí, kam jít', () => {
  const container = createContainer();
  createInventoryOverlay(container, { state: createDefaultState(), onClose: () => {} });
  assert.ok(container.querySelector('.inventory-empty'));
  assert.equal(container.querySelector('.crystal-grid'), null);
});

/* --- Mapa musí ukázat, že pokračuje (UX revize UCV-MAP-002) --------------- */

test('TDD-MAP-002-I: pás planet ukazuje, že mapa pokračuje doprava', () => {
  const { root } = renderMap(createDefaultState());
  const wrap = root.querySelector('.planet-strip-wrap');
  assert.ok(wrap, 'pás planet nemá obal s afordancí posunu');
  // Jedenáct planet se nevejde na žádnou cílovou šířku - hráč to musí poznat
  // dřív než scrollováním naslepo (na tabletu je scrollbar overlay).
  assert.ok(wrap.classList.contains('can-scroll-right'), 'chybí značka, že mapa pokračuje doprava');
  assert.equal(wrap.classList.contains('can-scroll-left'), false, 'na začátku není kam doleva');

  const next = root.querySelector('.planet-strip-next');
  const prev = root.querySelector('.planet-strip-prev');
  assert.ok(next && prev, 'chybí šipky pro posun mapy');
  assert.equal(next.hidden, false, 'šipka doprava má být na začátku vidět');
  assert.equal(prev.hidden, true, 'šipka doleva na začátku nemá co dělat');
  assert.ok(next.getAttribute('aria-label').includes('další'), 'šipka bez srozumitelného názvu');
  // Dotykový cíl 56 px nese třída .btn - bez ní by šipka byla menší než pravidlo.
  assert.ok(next.classList.contains('btn') && prev.classList.contains('btn'));
});

test('TDD-MAP-002-J: mapa se otevře na planetě, kde hráč právě je', () => {
  const bespinIndex = PLANETS.findIndex((p) => p.id === 'bespin');

  // Nový hráč: začátek pásu.
  const fresh = renderMap(createDefaultState());
  const freshCards = fresh.root.querySelectorAll('.planet-card');
  assert.ok(freshCards[0].scrolledIntoView, 'nový hráč má vidět Tatooine');

  // Hráč s dohraným Coruscantem: mapa najede na čerstvě odemčený Bespin,
  // který jinak začíná přesně za okrajem obrazovky.
  const returning = renderMap(stateWithCompleted(['coruscant']));
  const cards = returning.root.querySelectorAll('.planet-card');
  assert.ok(cards[bespinIndex].scrolledIntoView, 'mapa se nepodívala na rozehranou planetu');
  assert.equal(cards[bespinIndex].scrolledIntoView.inline, 'center');
  assert.equal(cards[0].scrolledIntoView, undefined, 'posouvat se má jen na jednu planetu');
});

/* --- Kontrast ilustrací (UX revize UCV-MAP-002) --------------------------- */

/** Relativní jas dle WCAG. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastní poměr dvou barev (1:1 = neviditelné, 21:1 = černá na bílé). */
function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const cssText = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
const cssColor = (name) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(cssText)[1];

test('ilustrace planet jsou vidět proti kartě a nesplývají spolu', () => {
  // Karta planety má pozadí --color-bg-panel. Dathomir (#241f2e) měl proti
  // němu kontrast 1.03:1 a Mustafar 1.32:1 - obě koule byly na mapě
  // neviditelné. Práh 3:1 je nejtmavší planeta, která projde okem (Coruscant).
  const panel = cssColor('--color-bg-panel');
  const bodies = new Map();
  for (const planet of PLANETS) {
    const svg = createPlanetArt(planet.art);
    const body = svg.childNodes.find(
      (el) => el.tagName === 'CIRCLE' && Number(el.getAttribute('r')) >= 20
    );
    assert.ok(body, `${planet.id}: ilustrace nemá kouli planety`);
    const fill = body.getAttribute('fill');
    bodies.set(planet.id, fill);
    assert.ok(
      contrast(fill, panel) >= 3,
      `${planet.id}: koule ${fill} má proti kartě jen ${contrast(fill, panel).toFixed(2)}:1`
    );
  }
  // Dvě zelené planety vedle sebe se musí rozeznat i bez čtení jména.
  const greens = contrast(bodies.get('endor'), bodies.get('dagobah'));
  assert.ok(greens >= 1.5, `Endor a Dagobah jsou k nerozeznání (${greens.toFixed(2)}:1)`);
});

test('krystaly v inventáři nesplývají s buňkou', () => {
  // Černý krystal měl spodní odstín #17171f, tedy 1.06:1 proti buňce -
  // tvar krystalu se rozpadal. Práh 2:1 drží stávající paletu a chytí splynutí.
  const cell = cssColor('--color-bg');
  const gradient = /\.crystal-([^\s]+)\s*\{\s*background:\s*linear-gradient\(160deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g;
  const seen = [];
  for (const [, color, top, bottom] of cssText.matchAll(gradient)) {
    seen.push(color);
    for (const shade of [top, bottom]) {
      assert.ok(
        contrast(shade, cell) >= 2,
        `${color} krystal: odstín ${shade} má proti buňce jen ${contrast(shade, cell).toFixed(2)}:1`
      );
    }
  }
  assert.equal(seen.length, PLANETS.length, 'každá planeta má mít krystal se dvěma odstíny');
});

test('mapa dostane víc místa než ostatní obrazovky - jinak se vejde jen pět planet', () => {
  // Výpočet z UX revize: .screen má max-width 720px a padding 1.5rem, pás
  // padding 0.25rem, karta min-width 120px, mezera 1rem. 5 karet = přesně
  // 672px, tedy z šesté planety nebyl vidět ani pixel.
  const screenMax = Number(/\.screen \{[^}]*max-width: (\d+)px/s.exec(cssText)[1]);
  const mapMax = Number(/\.screen-map \{[^}]*max-width: (\d+)px/s.exec(cssText)[1]);
  assert.ok(mapMax > screenMax, 'mapa nemá vlastní šířku, pás zůstane ustřižený po páté planetě');

  const CARD = 120;
  const GAP = 16;
  const visibleCards = (viewport) => {
    const strip = Math.min(viewport, mapMax) - 2 * 24 - 2 * 4; // .screen a .planet-strip padding
    return Math.floor((strip + GAP) / (CARD + GAP));
  };
  assert.ok(visibleCards(720) < visibleCards(1024), 'širší obrazovka musí ukázat víc planet');
  for (const viewport of [1024, 1440]) {
    assert.ok(visibleCards(viewport) >= 6, `na ${viewport}px je vidět jen ${visibleCards(viewport)} planet`);
    assert.ok(
      visibleCards(viewport) < PLANETS.length,
      `na ${viewport}px se vejde celá mapa - afordance posunu by lhala`
    );
  }
});

test('TDD-MAP-002-K: šipka, která zmizí pod fokusem, ho předá dál', () => {
  // Hráč doroloval klávesnicí na konec: šipka doprava zmizí, ale fokus na ní
  // pořád stojí. Bez předání by spadl na <body> a tabovalo by se od začátku.
  const { root } = renderMap(createDefaultState());
  const strip = root.querySelector('.planet-strip');
  const next = root.querySelector('.planet-strip-next');
  const prev = root.querySelector('.planet-strip-prev');

  // Rozložení, ve kterém se dá posunout na obě strany, pak až na doraz vpravo.
  strip.clientWidth = 672;
  strip.scrollWidth = 1488;
  strip.scrollLeft = 400;
  strip.dispatch('scroll');
  assert.equal(next.hidden, false, 'uprostřed pásu musí jít doprava');
  assert.equal(prev.hidden, false, 'uprostřed pásu musí jít doleva');

  next.focus();
  assert.equal(document.activeElement, next);
  strip.scrollLeft = 1488 - 672;
  strip.dispatch('scroll');

  assert.equal(next.hidden, true, 'na konci pásu už není kam doprava');
  assert.notEqual(document.activeElement, null, 'fokus se ztratil');
  assert.notEqual(document.activeElement, next, 'fokus zůstal na skryté šipce');
  assert.equal(document.activeElement, prev, 'fokus měl přejít na protější šipku');

  // Pás sám je fokusovatelný - je to záloha, když zmizí obě šipky.
  assert.equal(strip.tabIndex, 0, 'rolovatelný pás musí jít ovládat z klávesnice');
});

test('TDD-MAP-002-L: posun šipkou respektuje vypnuté animace', () => {
  const { root } = renderMap(createDefaultState());
  const strip = root.querySelector('.planet-strip');
  const next = root.querySelector('.planet-strip-next');
  strip.clientWidth = 672;
  strip.scrollWidth = 1488;

  // Explicitní behavior v JS přebíjí CSS @media, takže se kód musí zeptat sám.
  const povoleno = [];
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce'), media: q });
  strip.scrollBy = (opts) => povoleno.push(opts.behavior);
  next.click();

  globalThis.matchMedia = (q) => ({ matches: false, media: q });
  next.click();
  delete globalThis.matchMedia;

  assert.deepEqual(povoleno, ['auto', 'smooth'], 'reduced-motion nesmí dostat plynulý posun');
});

test('každá planeta má vlastní ilustraci a barvu krystalu v CSS', () => {
  const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');
  for (const planet of PLANETS) {
    assert.ok(hasPlanetArt(planet.art), `${planet.id}: chybí ilustrace '${planet.art}'`);
    assert.ok(
      css.includes(`.crystal-${planet.crystalColor} `),
      `${planet.id}: chybí styl .crystal-${planet.crystalColor}`
    );
  }
});
