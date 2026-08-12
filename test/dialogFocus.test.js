/**
 * Past fokusu sdíleného rámce modálů (js/ui/overlay.js + js/ui/dialogA11y.js)
 * měřená na VŠECH čtyřech dialozích nad mapou: dílna, inventář, žebříček
 * titulů a slavnost Rady.
 *
 * Proč vlastní soubor: past je vlastnost RÁMCE, ne jedné obrazovky, a její
 * vada se pozná jedině tím, že se projde celý kruh Tabu v obou směrech.
 * Dokud past hledala 'button, input, [tabindex="-1"]', vycházel jí první
 * prvek na NADPIS - jenže ten je zaostřitelný jen programově a v pořadí Tabu
 * vůbec není. Shift+Tab z prvního skutečného tab stopu se proto nepoznal
 * a fokus vyjel na tlačítka mapy POD dialogem, kde ho dítě nevidí. Rolovatelný
 * `.overlay-content` (tab stop od UCV-FIX-001) v množině pasti nebyl vůbec.
 *
 * Dialogy se otevírají PŘES MAPU, ne přímo: teprve tak se dá měřit i návrat
 * fokusu na spouštěč, protože ten zařizuje mapa v onClose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, createContainer } from './domStub.js';

installDom(); // musí být dřív než import obrazovek - ty sahají na document až za běhu

const { PLANETS } = await import('../js/content/planets.js');
const { createMapScreen } = await import('../js/ui/mapScreen.js');
const { createWorkshopOverlay } = await import('../js/ui/workshopScreen.js');
const { createDefaultState } = await import('../js/engine/state.js');

/** Krystaly na všechny díly meče - dílna pak má i tlačítka 'Postavit'. */
function stateWithCrystals() {
  const state = createDefaultState();
  state.inventory.crystals = ['modrý', 'bílý', 'zelený', 'červený', 'fialový'].map((color) => ({
    color,
    count: 3,
  }));
  return state;
}

/** Hráč s dohranými planetami, který slavnost už viděl - otevře ji z odznaku. */
function stateCouncilReplay() {
  const state = stateWithCrystals();
  state.planets = PLANETS.map((planet) => {
    const boss = planet.missions[planet.missions.length - 1];
    return {
      planetId: planet.id,
      unlockedLevels: planet.missions.length,
      starsPerLevel: { [boss.id]: 1 },
      bestStreak: 0,
    };
  });
  state.profile = { name: 'Ahsoka', createdAt: '2026-01-01T00:00:00Z' };
  state.awards = { councilCelebrated: true };
  return state;
}

/** Čtyři dialogy sdíleného rámce i s tlačítkem, kterým je dítě na mapě otevře. */
const DIALOGY = [
  {
    nazev: 'Dílna',
    state: stateWithCrystals,
    opener: (root) => root.querySelectorAll('button').find((b) => b.textContent.includes('Dílna')),
  },
  {
    nazev: 'Inventář krystalů',
    state: stateWithCrystals,
    opener: (root) => root.querySelector('.btn-crystals'),
  },
  {
    nazev: 'Žebříček titulů',
    state: stateWithCrystals,
    opener: (root) => root.querySelector('.map-player-title'),
  },
  {
    nazev: 'Člen rady Jedi',
    state: stateCouncilReplay,
    opener: (root) => root.querySelector('.council-replay'),
  },
];

/**
 * Prvky podstromu v pořadí DOM. Schválně TÝŽ průchod, na kterém stojí
 * querySelectorAll stubu (test/domStub.js) - past se ptá jím, takže vlastní
 * kopie průchodu by po změně stubu tiše měřila jiný strom než produkce.
 * Stub nemodeluje textové uzly, takže je to zároveň pořadí, ve kterém prvky
 * obchází Tab (kladný tabindex, který by pořadí přeskládal, model neumí
 * a spadne na něj).
 */
function domOrder(el) {
  return el.descendants();
}

const NATIVNI_TAB_STOPY = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Je prvek schovaný sobě nebo NĚKTERÉMU PŘEDKOVI? Prohlížeč takový prvek
 * z pořadí Tabu vyřadí. Ptát se jen prvku samotného nestačí: běžnější tvar
 * je schovaná celá sekce (`section.hidden = true`) s tlačítky uvnitř, a ten
 * by modelu propadl jako plnohodnotný tab stop.
 */
function skryty(el) {
  for (let node = el; node; node = node.parentNode) {
    if (node.hidden || node.style?.display === 'none' || node.style?.visibility === 'hidden') {
      return true;
    }
  }
  return false;
}

/**
 * Je prvek v SEKVENČNÍM pořadí Tabu? Úzký model prohlížeče, schválně
 * postavený nezávisle na výčtu v dialogA11y.js - kdyby test četl tentýž
 * selektor, měřil by sám sebe a vada v něm by prošla zeleně.
 *
 * Co model neumí, na to spadne (stejně jako domStub u nepodporovaného
 * selektoru): tiché 'není to tab stop' by z kruhu Tabu níž udělalo vakuum.
 */
function isTabStop(el) {
  if (el.tagName === 'A' || el.tagName === 'IFRAME') {
    throw new Error(`model pořadí Tabu neumí <${el.tagName.toLowerCase()}> - dopiš ho`);
  }
  const tabindex = el.getAttribute('tabindex');
  if (tabindex !== null && tabindex !== '0' && tabindex !== '-1') {
    throw new Error(`model pořadí Tabu neumí tabindex="${tabindex}" - dopiš ho`);
  }
  const stop = el.disabled
    ? false // zakázaný ovladač není fokusovatelný ani s tabindex="0"
    : tabindex === '0' || (tabindex === null && NATIVNI_TAB_STOPY.has(el.tagName));
  if (stop && skryty(el)) {
    throw new Error('model pořadí Tabu neumí skrytý tab stop - dopiš ho');
  }
  return stop;
}

/** Tab stopy panelu v pořadí, ve kterém je dítě klávesnicí obejde. */
function tabStops(panel) {
  return domOrder(panel).filter(isTabStop);
}

/**
 * Jeden stisk Tabu tak, jak ho zažije dítě: klávesa jde nejdřív pasti, a když
 * ji past nezastaví, posune fokus PROHLÍŽEČ - na nejbližší tab stop v pořadí
 * DOM. Vrací prvek, na kterém fokus skončil, nebo null, když fokus z panelu
 * vypadl ven (přesně ta vada, kvůli které tenhle soubor vznikl).
 */
function pressTab(panel, { shift = false } = {}) {
  let zastaveno = false;
  document.dispatch('keydown', {
    key: 'Tab',
    shiftKey: shift,
    preventDefault() {
      zastaveno = true;
    },
  });
  if (zastaveno) {
    return document.activeElement;
  }
  const order = domOrder(panel);
  const at = order.indexOf(document.activeElement);
  if (at < 0) {
    return null; // fokus je mimo panel a past ho tam nechala
  }
  const step = shift ? -1 : 1;
  for (let i = at + step; i >= 0 && i < order.length; i += step) {
    if (isTabStop(order[i])) {
      order[i].focus();
      return document.activeElement;
    }
  }
  return null; // prohlížeč by pokračoval za panel, tedy z dialogu ven
}

/**
 * Fokus stojí na prvku UPROSTŘED panelu, který v pořadí Tabu není (dílna tam
 * po postavení dílu posílá nadpis skupiny). Past ho odsud musí pustit DÁL,
 * ne zpátky na začátek dialogu - skokem na začátek by dítě přišlo o všechno,
 * co je za tím prvkem, včetně tlačítka Zavřít.
 *
 * Měří se to i s uměle vloženou značkou ve všech čtyřech dialozích: tvar
 * vzniká dnes jen v dílně, ale unést ho musí RÁMEC. Bez toho by celá tahle
 * třída vady visela na jediném testu jedné obrazovky.
 */
function overPrvekMimoPoradi(panel, znacka, nazev) {
  const order = domOrder(panel);
  const stops = tabStops(panel);
  const pozice = order.indexOf(znacka);
  assert.ok(pozice >= 0, `${nazev}: značka není v panelu`);
  const dalsi = stops.find((s) => order.indexOf(s) > pozice);
  const predchozi = [...stops].reverse().find((s) => order.indexOf(s) < pozice);
  assert.ok(dalsi && predchozi, `${nazev}: značka nestojí uprostřed pořadí - test by neměřil, co má`);
  // Kdyby další prvek v pořadí byl zrovna začátek dialogu, skok na začátek by
  // se od správného posunu nedal rozeznat a tvrzení níž by bylo vakuum.
  assert.notEqual(dalsi, stops[0], `${nazev}: za značkou stojí rovnou začátek dialogu`);

  znacka.focus();
  assert.equal(pressTab(panel), dalsi, `${nazev}: Tab z prvku mimo pořadí Tabu nešel dál, ale jinam`);
  znacka.focus();
  assert.equal(
    pressTab(panel, { shift: true }),
    predchozi,
    `${nazev}: Shift+Tab z prvku mimo pořadí Tabu nešel zpět, ale jinam`
  );
}

/** Otevře dialog přes mapu, jak to udělá dítě - vrací i jeho spouštěč. */
function openDialog(dialog) {
  const container = createContainer();
  const screen = createMapScreen(container, { state: dialog.state(), onStartMission: () => {} });
  const root = screen.element;
  const opener = dialog.opener(root);
  assert.ok(opener, `${dialog.nazev}: na mapě chybí tlačítko, které dialog otevírá`);

  opener.focus();
  assert.equal(document.activeElement, opener, `${dialog.nazev}: příprava - fokus nezačal na spouštěči`);
  opener.click();

  const overlay = root.querySelector('.solution-overlay');
  assert.ok(overlay, `${dialog.nazev}: spouštěč dialog neotevřel`);
  const panel = overlay.querySelector('.solution-panel');
  return { screen, root, overlay, panel, opener, title: panel.querySelector('h2') };
}

test('past fokusu: kruh Tabu se ve všech čtyřech dialozích uzavírá v obou směrech', () => {
  for (const dialog of DIALOGY) {
    const { screen, panel } = openDialog(dialog);
    const stops = tabStops(panel);

    // Kdyby dialog měl jediný tab stop, kruh by se uzavíral sám sebou
    // a měření obou směrů by nic netvrdilo.
    assert.ok(stops.length >= 2, `${dialog.nazev}: v dialogu je jen ${stops.length} tab stopů`);

    stops[0].focus();
    const vpred = stops.map((_, i) => {
      const cil = pressTab(panel);
      assert.ok(cil, `${dialog.nazev}: Tab vyvezl fokus z dialogu ven (krok ${i + 1})`);
      return stops.indexOf(cil);
    });
    assert.deepEqual(
      vpred,
      stops.map((_, i) => (i + 1) % stops.length),
      `${dialog.nazev}: Tab neprošel dialog v pořadí a zpátky na začátek`
    );

    stops[0].focus();
    const vzad = stops.map((_, i) => {
      const cil = pressTab(panel, { shift: true });
      assert.ok(cil, `${dialog.nazev}: Shift+Tab vyvezl fokus z dialogu ven (krok ${i + 1})`);
      return stops.indexOf(cil);
    });
    assert.deepEqual(
      vzad,
      stops.map((_, i) => (stops.length - 1 - i + stops.length) % stops.length),
      `${dialog.nazev}: Shift+Tab neprošel dialog pozpátku a zpátky na konec`
    );

    screen.destroy();
  }
});

test('past fokusu: rolovatelný obsah je první tab stop a Shift+Tab z něj zůstane v dialogu', () => {
  // .overlay-content dostal tabIndex 0 v UCV-FIX-001 (jinak se na nízkém okně
  // ke spodku obsahu klávesnicí nedá dostat) a je v panelu PRVNÍ. Past o něm
  // ale nevěděla, takže právě z něj vedl Shift+Tab na mapu pod dialogem.
  for (const dialog of DIALOGY) {
    const { screen, panel } = openDialog(dialog);
    const stops = tabStops(panel);
    const content = panel.querySelector('.overlay-content');

    assert.equal(stops[0], content, `${dialog.nazev}: první tab stop dialogu není rolovatelný obsah`);
    const zavrit = stops[stops.length - 1];
    assert.equal(zavrit.tagName, 'BUTTON', `${dialog.nazev}: poslední tab stop není tlačítko`);
    assert.ok(zavrit.textContent.length > 0, `${dialog.nazev}: poslední tab stop je bez popisku`);

    content.focus();
    assert.equal(
      pressTab(panel, { shift: true }),
      zavrit,
      `${dialog.nazev}: Shift+Tab z rolovatelného obsahu utekl z dialogu`
    );

    // Past sem cyklí ze Zavřít, takže tohle je místo, kam se dítě dostane
    // klávesou. Dřív tu cyklila na nadpis a odečítač zopakoval jméno dialogu;
    // ta orientace musí zůstat, i když se cíl posunul na správný tab stop.
    // Bez role by aria-label na obyčejném <div> odečítač zahodil.
    assert.equal(content.getAttribute('role'), 'group', `${dialog.nazev}: rolující obsah nemá roli, jméno by propadlo`);
    const jmeno = content.getAttribute('aria-label');
    assert.ok(jmeno, `${dialog.nazev}: rolující obsah je pro odečítač bezejmenný`);
    assert.ok(
      jmeno.includes(dialog.nazev),
      `${dialog.nazev}: jméno rolující oblasti (${JSON.stringify(jmeno)}) neříká, ve kterém dialogu dítě je`
    );

    screen.destroy();
  }
});

test('past fokusu: nadpis dialogu drží fokus po otevření, ale do pořadí Tabu nepatří', () => {
  for (const dialog of DIALOGY) {
    const { screen, panel, title } = openDialog(dialog);

    assert.ok(title, `${dialog.nazev}: dialog nemá nadpis`);
    assert.equal(document.activeElement, title, `${dialog.nazev}: fokus po otevření nemíří na nadpis`);
    // Proti ATRIBUTU, ne proti vlastnosti: -1 je ve stubu i výchozí hodnota
    // prvku, na který nikdo nesáhl, takže tvrzení o vlastnosti by platilo
    // i o nadpisu, kterému to nastavení někdo smazal.
    assert.equal(title.getAttribute('tabindex'), '-1', `${dialog.nazev}: nadpis se stal tab stopem navíc`);
    assert.equal(
      tabStops(panel).includes(title),
      false,
      `${dialog.nazev}: nadpis se počítá do sekvenčního pořadí Tabu`
    );

    // Fokus po otevření tedy stojí MIMO pořadí Tabu - past to musí unést
    // v obou směrech, protože přesně tady dítě mačká klávesu jako první.
    // Pozor, co tvrdí SMĚR DOPŘEDU: nadpis stojí před vším ostatním, takže
    // 'past skočila na začátek' a 'past posun nechala prohlížeči' tu dají
    // týž prvek a tenhle řádek je nerozliší. Rozdíl mezi nimi měří až test
    // 'prvek uprostřed panelu mimo pořadí Tabu' - nemazat ho jako dvojí
    // měření téhož.
    const stops = tabStops(panel);
    assert.equal(pressTab(panel), stops[0], `${dialog.nazev}: Tab z nadpisu skončil jinde než na prvním tab stopu`);
    title.focus();
    assert.equal(
      pressTab(panel, { shift: true }),
      stops[stops.length - 1],
      `${dialog.nazev}: Shift+Tab z nadpisu utekl z dialogu`
    );

    screen.destroy();
  }
});

test('past fokusu: fokus zvenčí past vrátí dovnitř a po zavření se vrací na spouštěč', () => {
  for (const dialog of DIALOGY) {
    const { screen, panel, opener } = openDialog(dialog);
    const stops = tabStops(panel);

    // Tlačítka mapy zůstávají pod otevřeným modálem v DOM. Kdyby se fokus
    // dostal na ně, past ho musí vzít zpátky dovnitř - ne ho tam nechat.
    opener.focus();
    assert.equal(pressTab(panel), stops[0], `${dialog.nazev}: past nevrátila fokus zvenčí dovnitř`);
    opener.focus();
    assert.equal(
      pressTab(panel, { shift: true }),
      stops[stops.length - 1],
      `${dialog.nazev}: past nevrátila fokus zvenčí dovnitř (Shift+Tab)`
    );

    // Zavření Escapem: dialog zmizí a fokus se vrátí na tlačítko, kterým ho
    // dítě otevřelo - jinak by tabovalo znovu od začátku stránky.
    document.dispatch('keydown', { key: 'Escape' });
    assert.equal(screen.element.querySelector('.solution-overlay'), null, `${dialog.nazev}: Escape nezavřel dialog`);
    assert.equal(document.activeElement, opener, `${dialog.nazev}: fokus se po zavření nevrátil na spouštěč`);

    screen.destroy();
  }
});

test('past fokusu: prvek uprostřed panelu mimo pořadí Tabu pokračuje dál, ne zpátky na začátek', () => {
  // Nejdřív tam, kde ten tvar opravdu vzniká: dílna po postavení dílu posílá
  // fokus na nadpis skupiny ('🤖 Droid 2/3') s tabindex="-1" UPROSTŘED panelu.
  const container = createContainer();
  const dilna = createWorkshopOverlay(container, {
    state: stateWithCrystals(),
    onCrafted: () => {},
    onClose: () => {},
  });
  const panel = container.querySelector('.solution-panel');
  const postavit = panel.querySelectorAll('button').filter((b) => b.textContent.includes('Postavit'));
  assert.ok(postavit.length >= 2, `dílna nabízí jen ${postavit.length} dílů ke stavbě`);

  postavit[0].click();
  const nadpis = document.activeElement;
  assert.equal(nadpis.tagName, 'H3', 'fokus po stavbě nemíří na nadpis skupiny');
  assert.equal(nadpis.getAttribute('tabindex'), '-1', 'nadpis skupiny se stal tab stopem navíc');
  overPrvekMimoPoradi(panel, nadpis, 'Dílna po stavbě dílu');
  dilna.destroy();

  // A pak přes celý rámec: značka se do obsahu vloží uměle, protože unést to
  // musí každý dialog, ne jen ten jediný, kde tvar dnes vzniká.
  for (const dialog of DIALOGY) {
    const otevreny = openDialog(dialog);
    const znacka = document.createElement('h3');
    znacka.textContent = 'značka mimo pořadí Tabu';
    znacka.tabIndex = -1;
    otevreny.panel.querySelector('.overlay-content').appendChild(znacka);
    overPrvekMimoPoradi(otevreny.panel, znacka, dialog.nazev);
    otevreny.screen.destroy();
  }
});

test('past fokusu: tlačítko s tabindex="-1" se do kruhu Tabu nepočítá', () => {
  // Takové tlačítko sedí na obě skupiny výčtu naráz - je to `button` i prvek
  // zaostřitelný jen programově. Do pořadí Tabu ale nepatří, a kdyby ho past
  // brala jako poslední tab stop, cyklila by na prvek, ke kterému se dítě
  // klávesnicí nikdy nedostane, a Zavřít by z kruhu vypadlo.
  const { screen, panel } = openDialog(DIALOGY[2]);
  const jenProgramove = document.createElement('button');
  jenProgramove.type = 'button';
  jenProgramove.textContent = 'jen programově';
  jenProgramove.tabIndex = -1;
  panel.appendChild(jenProgramove);

  const stops = tabStops(panel);
  assert.equal(stops.includes(jenProgramove), false, 'předpoklad testu neplatí - model to bere jako tab stop');
  const zavrit = stops[stops.length - 1];
  zavrit.focus();
  assert.equal(pressTab(panel), stops[0], 'Tab z posledního tab stopu neuzavřel kruh');
  stops[0].focus();
  assert.equal(pressTab(panel, { shift: true }), zavrit, 'Shift+Tab cyklí na prvek mimo pořadí Tabu');

  screen.destroy();
});

test('past fokusu: prvek, který past nezná, si posun řídí sám', () => {
  // Odkaz, <select> nebo contenteditable ve výčtu pasti nejsou (žádný dialog
  // je nemá). Past na nich ale nesmí SKOČIT na začátek dialogu: fokus je
  // uvnitř panelu a všechno za takovým prvkem - včetně tlačítka Zavřít - by
  // se tím stalo klávesnicí nedosažitelným. Klik na pozadí schválně nezavírá,
  // takže dítě bez myši by z dialogu ven nemělo jak.
  for (const shift of [false, true]) {
    const { screen, panel } = openDialog(DIALOGY[1]);
    const odkaz = document.createElement('a');
    odkaz.setAttribute('href', '#');
    odkaz.textContent = 'Více o krystalech';
    panel.querySelector('.overlay-content').appendChild(odkaz);

    odkaz.focus();
    let zastaveno = false;
    document.dispatch('keydown', {
      key: 'Tab',
      shiftKey: shift,
      preventDefault() {
        zastaveno = true;
      },
    });
    const smer = shift ? 'Shift+Tab' : 'Tab';
    assert.equal(zastaveno, false, `${smer}: past přebila posun z prvku, o kterém nic neví`);
    assert.equal(document.activeElement, odkaz, `${smer}: past fokus přemístila, ačkoli o prvku nic neví`);

    screen.destroy();
  }
});

test('past fokusu: dialog bez jediného tab stopu drží fokus na nadpisu', async () => {
  // Sdílený rámec vždycky vyrobí .overlay-content i Zavřít, ale
  // makeDialogAccessible je exportovaná a použitelná i nad vlastním panelem.
  // Kdyby se past při 'žádný tab stop' vypnula, Tab by dítě odvedl na
  // obrazovku POD otevřeným modálem - přesně to, čemu má past bránit.
  const { makeDialogAccessible } = await import('../js/ui/dialogA11y.js');
  const container = createContainer();
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  const panel = document.createElement('div');
  const nadpis = document.createElement('h2');
  nadpis.textContent = 'Jen text';
  const odstavec = document.createElement('p');
  odstavec.textContent = 'Dialog bez jediného tlačítka.';
  panel.append(nadpis, odstavec);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  const a11y = makeDialogAccessible(overlay, panel, () => {});
  assert.equal(document.activeElement, nadpis, 'fokus po otevření nemíří na nadpis');
  assert.equal(tabStops(panel).length, 0, 'předpoklad testu neplatí - panel nějaký tab stop má');

  for (const shift of [false, true]) {
    nadpis.focus();
    assert.equal(
      pressTab(panel, { shift }),
      nadpis,
      `${shift ? 'Shift+Tab' : 'Tab'} odvedl fokus z dialogu, který nemá tab stop`
    );
  }

  a11y.detach();
});
