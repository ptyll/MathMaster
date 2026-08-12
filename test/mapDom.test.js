import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDom, createContainer } from './domStub.js';
import { parseCss, resolveValue, resolveAnimation } from './cssCascade.js';

installDom(); // musí být dřív než import obrazovek - ty sahají na document až za běhu

const { PLANETS, CORE_PLANETS } = await import('../js/content/planets.js');
const { createMapScreen } = await import('../js/ui/mapScreen.js');
const { createInventoryOverlay } = await import('../js/ui/workshopScreen.js');
const { hasPlanetArt, createPlanetArt } = await import('../js/ui/planetArt.js');
const { createDefaultState } = await import('../js/engine/state.js');
const { focusNewScreen } = await import('../js/ui/dialogA11y.js');
const { createSaveStore } = await import('../js/engine/save.js');
const { TITLES, titleFor, completedPlanetCount } = await import('../js/engine/titles.js');
const { titleLadderSteps, planetWord, planetWordFrom } = await import('../js/ui/titleLadder.js');

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

test('TDD-MAP-002-M: obrazovka se staví až připojená, jinak je posun mapy no-op', () => {
  // js/main.js stavěl obrazovku do odpojené sekce a připojoval ji až potom.
  // V prohlížeči tím pádem scrollIntoView v mapScreen nic neudělal (odpojený
  // podstrom nemá rozložení) a hráč s dohraným Coruscantem neviděl Bespin.
  // Test jde přes stejnou cestu jako hra, ne přes připojený kontejner.
  const detached = document.createElement('section');
  const screen = createMapScreen(detached, {
    state: stateWithCompleted(['coruscant']),
    onStartMission: () => {},
  });
  const bespin = screen.element.querySelectorAll('.planet-card')[
    PLANETS.findIndex((p) => p.id === 'bespin')
  ];
  assert.equal(
    bespin.scrolledIntoView,
    undefined,
    'v odpojeném podstromu prohlížeč neposouvá - stub to musí modelovat stejně'
  );

  // A hlavně: main.js musí sekci připojit dřív, než do ní obrazovku postaví.
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const pripojeni = main.indexOf('app.appendChild(el)');
  const stavba = main.indexOf('createMapScreen(el');
  assert.ok(pripojeni > -1 && stavba > -1, 'render() v main.js změnil tvar');
  assert.ok(
    pripojeni < stavba,
    'main.js staví obrazovku do odpojené sekce - posun mapy bude zase mrtvý kód'
  );
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

/* --- Titul hráče a slavnost Rady Jedi (UCV-MAP-003) ----------------------- */

/** Stav hráče, který dohrál všech jedenáct planet. */
function stateFinished() {
  const state = stateWithCompleted(PLANETS.map((p) => p.id));
  state.profile = { name: 'Ahsoka', createdAt: '2026-01-01T00:00:00Z' };
  return state;
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test('TDD-MAP-003-H: mapa ukazuje titul vedle jména a ten roste s postupem', () => {
  const titleOf = (state) => {
    const { root } = renderMap(state);
    const chip = root.querySelector('.map-player-title');
    assert.ok(chip, 'panel hráče neukazuje titul');
    assert.ok(root.querySelector('.map-player').contains(chip), 'titul nestojí u jména');
    return chip.textContent;
  };

  assert.equal(titleOf(createDefaultState()), 'Padawan');
  assert.equal(titleOf(stateWithCompleted(['tatooine', 'hoth', 'dagobah', 'deathstar'])), 'Rytíř Jedi');
  assert.equal(titleOf(stateWithCompleted(CORE_PLANETS.map((p) => p.id))), 'Mistr Jedi');
  assert.equal(titleOf(stateFinished()), 'Člen rady Jedi');
});

test('TDD-MAP-003-I: po poslední planetě se otevře slavnost Rady Jedi, a jen jednou', () => {
  const state = stateFinished();
  const storage = memoryStorage();
  const store = createSaveStore(storage);

  const container = createContainer();
  const screen = createMapScreen(container, {
    state,
    onStartMission: () => {},
    onStateChanged: () => store.save(state),
  });

  const overlay = container.querySelector('.council-overlay');
  assert.ok(overlay, 'po dokončení všech planet nepřišla slavnostní obrazovka');
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.ok(overlay.querySelector('.council-badge'), 'chybí odznak Rady Jedi');
  assert.equal(overlay.querySelector('.council-badge').getAttribute('role'), 'img');
  assert.ok(overlay.textContent.includes('Ahsoka'), 'slavnost neoslovuje hráče jménem');
  assert.ok(overlay.querySelector('.confetti'), 'chybí konfety');
  assert.ok(
    overlay.textContent.includes(String(PLANETS.length)),
    'hláška neříká, kolik planet je osvobozených - a číslo má jít z dat'
  );

  // Dialog si vezme fokus dovnitř (overlay se zavěsí do dokumentu dřív).
  assert.ok(overlay.contains(document.activeElement), 'fokus zůstal mimo slavnost');

  // Zavřít je v patičce, tedy vidět bez rolování, a je to dotykový cíl .btn.
  const panel = overlay.querySelector('.solution-panel');
  const footer = overlay.querySelector('.overlay-footer');
  assert.ok(footer, 'slavnost nemá patičku se zavíracím tlačítkem');
  assert.equal(panel.childNodes[panel.childNodes.length - 1], footer, 'patička není poslední v panelu');
  assert.ok(panel.classList.contains('solution-panel--framed'), 'panel roluje celý i s tlačítkem');
  const closeBtn = footer.querySelectorAll('button')[0];
  assert.equal(closeBtn.textContent, 'Pokračovat na mapu');
  assert.ok(closeBtn.classList.contains('btn'), 'zavírací tlačítko nemá dotykový cíl třídy .btn');

  // Po zavření se hráč vrátí na mapu i fokusem.
  closeBtn.click();
  assert.equal(container.querySelector('.council-overlay'), null, 'slavnost nejde zavřít');
  assert.equal(document.activeElement, screen.element.querySelector('h1'), 'fokus po zavření spadl mimo mapu');

  // Podruhé už slavnost nepřijde - ani ve stejném sezení, ani po uložení
  // a načtení savu (značka musí přežít JSON, ne jen běh).
  assert.equal(renderMap(state).root.querySelector('.council-overlay'), null, 'konfety při každém návratu na mapu');
  const loaded = store.load();
  assert.ok(loaded, 'stav se slavností se neuložil');
  assert.equal(
    renderMap(loaded).root.querySelector('.council-overlay'),
    null,
    'po načtení savu se slavnost spustila znovu'
  );
  // Titul ale zůstává napořád.
  assert.equal(renderMap(loaded).root.querySelector('.map-player-title').textContent, 'Člen rady Jedi');
});

test('TDD-MAP-003-J: hláška Rady vystřídá Mistra Jediho a neslibuje cestu, která už není', () => {
  const { root } = renderMap(stateFinished());
  const banner = root.querySelector('.master-jedi');
  assert.ok(banner, 'dohraná hra nemá na mapě žádný titul');
  assert.ok(banner.classList.contains('master-jedi--council'));
  assert.ok(banner.textContent.includes('ČLEN RADY JEDI'));
  assert.equal(banner.textContent.includes('MISTR JEDI'), false, 'na mapě svítí oba tituly naráz');
  assert.equal(
    banner.textContent.includes('čeká další cesta'),
    false,
    'dohranému hráči hláška slibuje pokračování, které neexistuje'
  );
  assert.ok(banner.textContent.includes(String(PLANETS.length)), 'počet planet v hlášce má jít z dat');

  // Pětka planet zůstává u své původní hlášky (starý save o nic nepřijde).
  const master = renderMap(stateWithCompleted(CORE_PLANETS.map((p) => p.id))).root.querySelector('.master-jedi');
  assert.ok(master.textContent.includes('MISTR JEDI'));
  assert.equal(master.classList.contains('master-jedi--council'), false);
});

test('TDD-MAP-003-M: pruh na mapě mluví o titulu, který hráč právě má', () => {
  // Pruh měl text natvrdo, takže hráči s osmi planetami křičel 'MISTR JEDI',
  // zatímco vedle jména mu svítil odznak 'Strážce Řádu' - mapa tvrdila dvě
  // věci najednou. Text teď jde ze žebříčku, takže se rozejít nemůže.
  const ids = PLANETS.map((p) => p.id);
  for (const pocet of [CORE_PLANETS.length, CORE_PLANETS.length + 3, PLANETS.length]) {
    const { root } = renderMap(stateWithCompleted(ids.slice(0, pocet)));
    const odznak = root.querySelector('.map-player-title').textContent;
    const banner = root.querySelector('.master-jedi');
    assert.ok(banner, `${pocet} planet: chybí oslavný pruh`);
    assert.ok(
      banner.textContent.toUpperCase().includes(odznak.toUpperCase()),
      `${pocet} planet: pruh hlásí ${JSON.stringify(banner.textContent)}, ale odznak je '${odznak}'`
    );
  }

  // Pod milníkem se pruh nekreslí vůbec - oslava každé planety by zevšedněla.
  const knight = renderMap(stateWithCompleted(ids.slice(0, 4)));
  assert.equal(knight.root.querySelector('.map-player-title').textContent, 'Rytíř Jedi');
  assert.equal(knight.root.querySelector('.master-jedi'), null, 'pruh se ukazuje i mimo milník');
});

test('TDD-MAP-003-K: přechod na obrazovku nepřebije fokus otevřeného modálu', () => {
  // main.js po překreslení posílá fokus na h1 obrazovky. Kdyby to udělal
  // i nad otevřenou slavností, hráč by se ocitl POD modálem: čtečka i Tab
  // by četly mapu, kterou overlay překrývá.
  const withDialog = createContainer();
  createMapScreen(withDialog, { state: stateFinished(), onStartMission: () => {} });
  const inDialog = document.activeElement;
  assert.ok(
    withDialog.querySelector('.council-overlay').contains(inDialog),
    'předpoklad testu neplatí - slavnost si fokus nevzala'
  );
  focusNewScreen(withDialog);
  assert.equal(document.activeElement, inDialog, 'fokus utekl ze slavnosti na nadpis pod ní');

  // Bez otevřeného modálu ale nadpis fokus dostat musí.
  const plain = createContainer();
  createMapScreen(plain, { state: createDefaultState(), onStartMission: () => {} });
  focusNewScreen(plain);
  const h1 = plain.querySelector('h1');
  assert.equal(document.activeElement, h1, 'po přechodu na obrazovku fokus nikam nemíří');
  assert.equal(h1.tabIndex, -1, 'nadpis není fokusovatelný');
});

test('titul i slavnost jsou čitelné a s vypnutým pohybem mají statickou náhradu', () => {
  const rules = parseCss(cssText);
  const panel = cssColor('--color-bg-panel');
  /** Barva z CSS, i když je schovaná za proměnnou. */
  const solid = (value) => (value?.startsWith('var(') ? cssColor(value.slice(4, -1)) : value);

  for (const selector of [
    '.map-player-title',
    '.stats-profile-title',
    '.stats-profile-name',
    '.council-name',
    '.council-text',
    '.council-hint',
  ]) {
    const color = solid(resolveValue(rules, selector, 'color'));
    assert.ok(color, `${selector}: nemá vlastní barvu textu`);
    assert.ok(
      contrast(color, panel) >= 4.5,
      `${selector}: text ${color} má proti panelu jen ${contrast(color, panel).toFixed(2)}:1`
    );
    // Ztlumený stav se nedělá průhledností - vnořené opacity se násobí
    // a text spadne pod čitelnou hranici (poučení z dílny).
    assert.equal(resolveValue(rules, selector, 'opacity'), null, `${selector}: text se ztlumuje průhledností`);
  }

  // Panel hráče musí umět zalomit řádek - s titulem je v něm o položku víc.
  assert.equal(resolveValue(rules, '.map-player', 'flex-wrap'), 'wrap');

  // Jméno, titul a postup jsou v přehledu tři sousední <span> bez mezer
  // v DOM - bez vlastní mezery se slijí do 'ReyMistr Jedi5 z 11 planet'
  // (naměřeno v prohlížeči, textContent to nepozná).
  assert.equal(resolveValue(rules, '.stats-profile', 'display'), 'flex');
  assert.ok(resolveValue(rules, '.stats-profile', 'gap'), 'profil v přehledu nemá mezery mezi položkami');

  // Odznak si drží velikost i na nízkém okně - flex ho jinak smrskne na
  // nulu a ze slavnosti zbude holý text (naměřeno na 800x360).
  assert.equal(resolveValue(rules, '.council-badge', 'flex'), 'none');

  // Omezený pohyb: odznak přestane pulzovat, konfety zmizí úplně - a proto
  // musí slavnost dostat statickou náhradu, jinak z oslavy zbude holé okno.
  assert.equal(resolveAnimation(rules, '.council-badge', true), 'none');
  assert.notEqual(resolveAnimation(rules, '.council-badge', false), 'none', 'odznak nepulzuje ani normálně');
  assert.equal(resolveValue(rules, '.confetti', 'display', true), 'none');
  assert.ok(
    resolveValue(rules, '.council-overlay .solution-panel', 'box-shadow', true),
    'slavnost nemá pod vypnutým pohybem žádnou náhradu za konfety a pulz'
  );
  assert.equal(
    resolveValue(rules, '.council-overlay .solution-panel', 'box-shadow', false),
    null,
    'náhrada svítí i s puštěnými animacemi - pak to není náhrada'
  );
  // Odznak je vidět i bez animace (zář má i základní pravidlo).
  assert.ok(resolveValue(rules, '.council-badge', 'filter'), 'odznak má lesk jen z animace');
});

/* --- Žebříček titulů (UCV-MAP-003) ---------------------------------------
 *
 * Odznak titulu na mapě otevírá celý žebříček. Testy hlídají hlavně to, aby
 * se kreslil z dat (TITLES), ne z výčtu v obrazovce, aby zbývající počet
 * planet seděl a aby budoucí stupně neprozradily obsah, který hráč nevidí.
 */

/** Očekávaný tvar slova po číslovce - schválně vlastní, ne import z modulu. */
const tvarPlanet = (n) => (n === 1 ? 'planeta' : n >= 2 && n <= 4 ? 'planety' : 'planet');
/** Tvar po předložce 'od' (2. pád): od 1 planety, od 2 planet. */
const tvarOd = (n) => (n === 1 ? 'planety' : 'planet');

/** Stav s prvními `pocet` planetami dohranými. */
const stavSPoctem = (pocet) =>
  pocet === 0 ? createDefaultState() : stateWithCompleted(PLANETS.slice(0, pocet).map((p) => p.id));

function openLadder(state) {
  const { root, screen } = renderMap(state);
  const chip = root.querySelector('.map-player-title');
  assert.ok(chip, 'panel hráče nemá odznak titulu');
  chip.click();
  return { root, screen, chip, overlay: root.querySelector('.title-ladder-overlay') };
}

test('TDD-MAP-003-N: odznak titulu otevře žebříček a ten se kreslí z TITLES', () => {
  const { overlay } = openLadder(stavSPoctem(CORE_PLANETS.length));
  assert.ok(overlay, 'klepnutí na odznak titulu žebříček neotevřelo');
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(overlay.getAttribute('aria-label'), 'Žebříček titulů');

  const steps = overlay.querySelectorAll('.title-step');
  assert.equal(steps.length, TITLES.length, 'žebříček nemá stupeň pro každý titul z TITLES');
  TITLES.forEach((title, i) => {
    assert.ok(steps[i].textContent.includes(title.label), `stupeň ${i + 1} není ${title.label}`);
    if (title.minPlanets > 0) {
      assert.ok(
        steps[i].textContent.includes(`od ${title.minPlanets} ${tvarOd(title.minPlanets)}`),
        `${title.label}: chybí práh 'od ${title.minPlanets} ${tvarOd(title.minPlanets)}'`
      );
    }
  });
  // Prahy mluví jednou formou - jinak stojí vedle sebe dvě holá čísla
  // ('8 planet' a 'ještě 3 planety') a dítě neví, které je meta.
  assert.ok(steps[0].textContent.includes('od začátku cesty'), 'první stupeň nemá slovní práh');

  // Seznam bez odrážek si musí sémantiku říct sám (Safari + VoiceOver).
  assert.equal(overlay.querySelector('.title-ladder-list').getAttribute('role'), 'list');
});

test('TDD-MAP-003-N2: nový stupeň v TITLES se v žebříčku objeví sám', () => {
  // Ruční výčet v obrazovce by prošel testem výše (dnes sedí), ale tenhle
  // ne: přidání titulu se nesmí muset psát na dvě místa.
  TITLES.push({ id: 'zkusebni', label: 'Zkušební stupeň', minPlanets: 99 });
  try {
    const { overlay } = openLadder(createDefaultState());
    const steps = overlay.querySelectorAll('.title-step');
    assert.equal(steps.length, TITLES.length, 'žebříček nepřevzal nový stupeň z dat');
    const last = steps[steps.length - 1];
    assert.ok(last.textContent.includes('Zkušební stupeň'));
    assert.ok(last.textContent.includes(`od 99 ${tvarOd(99)}`), 'nový stupeň nemá práh z dat');
  } finally {
    TITLES.pop();
  }
});

test('TDD-MAP-003-O: žebříček vyznačí stupeň, na kterém hráč právě stojí', () => {
  // Všechny počty planet, ne jen prahy: mezihodnoty (1, 3, 6, 7, 9, 10) jsou
  // právě ty, kde se off-by-one v porovnání s prahem projeví.
  for (const pocet of Array.from({ length: PLANETS.length + 1 }, (_, i) => i)) {
    const state = stavSPoctem(pocet);
    const { overlay } = openLadder(state);
    const steps = overlay.querySelectorAll('.title-step');
    const current = overlay.querySelectorAll('.title-step.is-current');
    assert.equal(current.length, 1, `${pocet} planet: aktuální stupeň musí být právě jeden`);
    assert.ok(
      current[0].textContent.includes(titleFor(state).label),
      `${pocet} planet: vyznačený stupeň není ${titleFor(state).label}`
    );
    assert.ok(current[0].textContent.includes('Tady jsi'), 'vyznačený stupeň to neříká slovy');
    assert.equal(current[0].getAttribute('aria-current'), 'step');

    // Pod aktuálním stupněm je splněno, nad ním zamčeno - a nic obojí.
    const at = steps.indexOf(current[0]);
    steps.forEach((step, i) => {
      if (i < at) {
        assert.ok(step.classList.contains('is-done'), `${pocet} planet: stupeň ${i} není splněný`);
      }
      if (i > at) {
        assert.ok(step.classList.contains('is-locked'), `${pocet} planet: stupeň ${i} není zamčený`);
      }
      assert.equal(
        step.classList.contains('is-locked') && step.classList.contains('is-done'),
        false,
        `${pocet} planet: stupeň ${i} je splněný i zamčený zároveň`
      );
    });
  }
});

test('TDD-MAP-003-P: žebříček řekne, kolik planet do dalšího stupně zbývá', () => {
  for (const pocet of [0, CORE_PLANETS.length, CORE_PLANETS.length + 2]) {
    const state = stavSPoctem(pocet);
    const { overlay } = openLadder(state);
    const steps = overlay.querySelectorAll('.title-step');
    const completed = completedPlanetCount(state);
    assert.equal(completed, pocet, 'předpoklad testu neplatí - stav nemá tolik planet');

    // Každý zamčený stupeň nese svůj vlastní zbytek, spočítaný z prahu.
    TITLES.forEach((title, i) => {
      if (title.minPlanets <= completed) {
        return;
      }
      const zbyva = title.minPlanets - completed;
      assert.ok(
        steps[i].textContent.includes(`ještě ${zbyva} ${tvarPlanet(zbyva)}`),
        `${pocet} planet, ${title.label}: chybí 'ještě ${zbyva} ${tvarPlanet(zbyva)}', je tam ${JSON.stringify(steps[i].textContent)}`
      );
    });

    // A nejbližší stupeň je i v hlavičce dialogu, ať to dítě nemusí hledat.
    const dalsi = TITLES.find((t) => t.minPlanets > completed);
    const hlavicka = overlay.querySelector('.title-ladder-next').textContent;
    const zbyva = dalsi.minPlanets - completed;
    assert.ok(hlavicka.includes(dalsi.label), `${pocet} planet: hlavička neříká další titul`);
    assert.ok(
      hlavicka.includes(`ještě ${zbyva} ${tvarPlanet(zbyva)}`),
      `${pocet} planet: hlavička hlásí ${JSON.stringify(hlavicka)}`
    );
    assert.ok(
      overlay.querySelector('.title-ladder-summary').textContent.includes(String(completed)),
      `${pocet} planet: shrnutí neříká, kolik planet má hráč hotových`
    );
  }

  // Konkrétní tvary: 5 planet -> do Strážce Řádu chybí 3, 7 planet -> 1.
  assert.ok(openLadder(stavSPoctem(5)).overlay.textContent.includes('ještě 3 planety'));
  assert.ok(openLadder(stavSPoctem(7)).overlay.textContent.includes('ještě 1 planeta'));
  assert.ok(openLadder(stavSPoctem(0)).overlay.textContent.includes('ještě 5 planet'));

  // Dohraný hráč už nikam nespěje - žádné 'ještě' mu žebříček neslibuje.
  const dohrano = openLadder(stateFinished()).overlay;
  assert.equal(/ještě/.test(dohrano.textContent), false, 'dohraný hráč dostal další stupeň');
  assert.equal(dohrano.querySelectorAll('.title-step.is-locked').length, 0);
  assert.ok(dohrano.querySelector('.title-ladder-next').textContent.includes('vrcholu'));
});

test('TDD-MAP-003-Q: žebříček neprozradí obsah, který hráč ještě neviděl', () => {
  const { overlay } = openLadder(createDefaultState());
  const text = overlay.textContent;
  for (const planet of PLANETS) {
    assert.equal(text.includes(planet.name), false, `žebříček prozrazuje planetu ${planet.name}`);
  }
  // Oslavné hlášky u titulů mluví o Coruscantu a o endgame cestě - do
  // žebříčku budoucích stupňů nepatří.
  for (const title of TITLES) {
    if (title.banner) {
      assert.equal(text.includes(title.banner), false, `žebříček vyzradil hlášku titulu ${title.id}`);
    }
  }
});

test('TDD-MAP-003-R: žebříček má Zavřít v patičce, fokus uvnitř a vrací ho na odznak', () => {
  const { root, chip, overlay } = openLadder(stavSPoctem(2));
  const panel = overlay.querySelector('.solution-panel');
  assert.ok(panel.classList.contains('solution-panel--framed'), 'panel by roloval i s tlačítkem');
  const footer = overlay.querySelector('.overlay-footer');
  assert.ok(footer, 'žebříček nemá patičku se zavíracím tlačítkem');
  assert.equal(panel.childNodes[panel.childNodes.length - 1], footer, 'patička není poslední v panelu');
  const closeBtn = footer.querySelectorAll('button')[0];
  assert.ok(closeBtn.classList.contains('btn'), 'zavírací tlačítko nemá dotykový cíl třídy .btn');

  // Fokus jde dovnitř dialogu (overlay se zavěsí do dokumentu dřív).
  assert.ok(overlay.contains(document.activeElement), 'fokus zůstal mimo žebříček');

  closeBtn.click();
  assert.equal(root.querySelector('.title-ladder-overlay'), null, 'žebříček nejde zavřít');
  assert.equal(document.activeElement, chip, 'fokus se po zavření nevrátil na odznak titulu');

  // Dva overlaye naráz ne: dílna otevřená po žebříčku ho vystřídá.
  chip.click();
  root.querySelectorAll('button').find((b) => b.textContent.includes('Dílna')).click();
  assert.equal(root.querySelector('.title-ladder-overlay'), null, 'žebříček zůstal viset pod dílnou');
});

test('TDD-MAP-003-S: odznak titulu je tlačítko s dotykovým cílem 56 px', () => {
  const { root } = renderMap(createDefaultState());
  const chip = root.querySelector('.map-player-title');
  assert.equal(chip.tagName, 'BUTTON', 'odznak titulu nejde stisknout - není to tlačítko');
  assert.equal(chip.textContent, 'Padawan', 'na odznaku má zůstat jen titul');
  assert.equal(chip.getAttribute('aria-haspopup'), 'dialog');
  const label = chip.getAttribute('aria-label');
  assert.ok(label.includes('Padawan'), 'název tlačítka neobsahuje viditelný text');
  assert.ok(/žebříček/i.test(label), 'název tlačítka neříká, co se stane');

  // Dotykový cíl se počítá z kaskády, ne z výskytu v souboru; a var()
  // se musí rozložit, jinak by podmínka prošla naprázdno.
  const rules = parseCss(cssText);
  const target = Number(/--touch-target:\s*(\d+)px/.exec(cssText)[1]);
  assert.equal(target, 56, 'změnil se dotykový cíl aplikace');
  const value = resolveValue(rules, 'button.map-player-title', 'min-height');
  const px = /^(\d+)px$/.exec(value ?? '');
  const resolved = px ? Number(px[1]) : value === 'var(--touch-target)' ? target : NaN;
  assert.ok(resolved >= 56, `odznak titulu má dotykový cíl '${value}', což není aspoň 56 px`);

  // Na tabletu není hover, takže bez viditelné pobídky vypadá odznak jako
  // pouhý štítek - a hráč se o žebříčku zase nedozví. Šipka je v ::after,
  // aby text tlačítka i jeho přístupný název zůstaly jen titulem.
  const chevron = resolveValue(rules, 'button.map-player-title::after', 'content');
  assert.ok(chevron && chevron !== 'none' && chevron !== "''", `odznak nemá vizuální pobídku: ${chevron}`);
});

test('žebříček je čitelný a zamčený stupeň se pozná rámečkem, ne ztlumením', () => {
  const rules = parseCss(cssText);
  const panel = cssColor('--color-bg-panel');
  const solid = (value) => (value?.startsWith('var(') ? cssColor(value.slice(4, -1)) : value);

  for (const selector of [
    'p.title-ladder-summary',
    'p.title-ladder-next',
    '.title-step-name',
    '.title-step-need',
    '.title-step-state',
    '.title-step.is-current .title-step-name',
    '.title-step.is-done .title-step-state',
    '.title-step.is-locked .title-step-state',
  ]) {
    const color = solid(resolveValue(rules, selector, 'color'));
    assert.ok(color, `${selector}: nemá vlastní barvu textu`);
    assert.ok(
      contrast(color, panel) >= 4.5,
      `${selector}: text ${color} má proti panelu jen ${contrast(color, panel).toFixed(2)}:1`
    );
    assert.equal(resolveValue(rules, selector, 'opacity'), null, `${selector}: text se ztlumuje průhledností`);
  }

  // Zamčený stupeň se odlišuje rámečkem a akcentem, ne ztlumením celého
  // řádku - právě 'ještě 3 planety' dítě potřebuje přečíst.
  assert.equal(resolveValue(rules, '.title-step.is-locked', 'opacity'), null, 'zamčený stupeň se ztlumuje');
  assert.equal(resolveValue(rules, '.title-step.is-locked', 'border-style'), 'dashed');
  const zamceny = resolveValue(rules, '.title-step.is-locked', 'border-color');
  const aktualni = resolveValue(rules, '.title-step.is-current', 'border-color');
  assert.ok(zamceny && aktualni && zamceny !== aktualni, 'zamčený a aktuální stupeň mají stejný rámeček');

  // Odstavce hry mají max-width: 46ch, což by shrnutí lámalo doprostřed.
  assert.equal(resolveValue(rules, 'p.title-ladder-summary', 'max-width'), 'none');
  assert.equal(resolveValue(rules, 'p.title-ladder-next', 'max-width'), 'none');

  // Řádek stupně jsou čtyři sousední <span> bez mezery v DOM ('Mistr
  // Jedi5 planetTady jsi' - viz textContent v testech výše). Mezeru musí
  // dát rozložení, jinak se v prohlížeči slijí do jednoho slova.
  assert.equal(resolveValue(rules, '.title-step', 'display'), 'flex');
  assert.ok(resolveValue(rules, '.title-step', 'gap'), 'řádek žebříčku nemá mezery mezi údaji');
});

test('TDD-MAP-003-T: model žebříčku je čistá funkce - stavy i zbytky sedí bez DOM', () => {
  // titleLadderSteps a planetWord jsou exportované proto, aby pravidlo
  // žebříčku šlo ověřit bez obrazovky. Očekávání jsou tu napsaná doslova,
  // ne spočítaná toutéž funkcí (titleFor), kterou používá implementace.
  assert.deepEqual(
    [0, 1, 2, 4, 5, 11].map(planetWord),
    ['planet', 'planeta', 'planety', 'planety', 'planet', 'planet']
  );
  assert.deepEqual([1, 2, 5, 11].map(planetWordFrom), ['planety', 'planet', 'planet', 'planet']);

  assert.deepEqual(
    titleLadderSteps(stavSPoctem(5)).map((s) => [s.label, s.isCurrent, s.isDone, s.remaining]),
    [
      ['Padawan', false, true, 0],
      ['Zkušený padawan', false, true, 0],
      ['Rytíř Jedi', false, true, 0],
      ['Mistr Jedi', true, false, 0],
      ['Strážce Řádu', false, false, 3],
      ['Člen rady Jedi', false, false, 6],
    ]
  );
  // Nový hráč: aktuální je první stupeň, nic není splněné.
  const novy = titleLadderSteps(createDefaultState());
  assert.deepEqual(novy.map((s) => s.isCurrent), [true, false, false, false, false, false]);
  assert.deepEqual(novy.map((s) => s.remaining), [0, 2, 4, 5, 8, 11]);
});

test('DOM stub hlásí nepodporovaný selektor výjimkou, ne tichým prázdnem', () => {
  const container = createContainer();
  const outer = document.createElement('div');
  outer.className = 'outer';
  const inner = document.createElement('span');
  inner.className = 'inner';
  outer.appendChild(inner);
  container.appendChild(outer);

  // Co stub umí, ať najde - i složeninu typu a tříd.
  assert.equal(container.querySelectorAll('.outer').length, 1);
  assert.equal(container.querySelectorAll('span.inner').length, 1);
  assert.equal(container.querySelectorAll('.outer.chybi').length, 0);
  assert.equal(container.querySelectorAll('span, div').length, 2);

  // Co neumí, ať křičí. Potomkový selektor ('.a .b') je nejběžnější tvar,
  // u kterého se tichá nula splete s 'prvek tam není' - a nad takovým
  // dotazem by svítil zelený test, protože forEach nad prázdným polem nic
  // neasertuje. Stráž musí platit pro KAŽDÝ tvar, který stub neumí.
  for (const selector of ['.outer .inner', 'span em', '*', '.outer > .inner', '#app', '.a[hidden]']) {
    assert.throws(
      () => container.querySelectorAll(selector),
      /nepodporovaný selektor/,
      `stub tiše spolkl selektor ${selector}`
    );
  }
});
