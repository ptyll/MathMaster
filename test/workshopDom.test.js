/**
 * DOM testy dílny a odměn na misi (UCV-REWARD-003) nad test/domStub.js.
 * Crafting model má vlastní testy v boss-crafting.test.js; tady jde o to,
 * co hráč doopravdy uvidí a naklikne - odměna, která je jen ve stavu, není
 * odměna.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { installDom, createContainer } from './domStub.js';
import { parseCss, resolveValue, resolveAnimation, animationName } from './cssCascade.js';


installDom(); // musí být dřív než import obrazovek - ty sahají na document až za běhu

const { PLANETS } = await import('../js/content/planets.js');
const { GROUPS, PARTS, partsOfGroup, cosmeticsFor, crystalCount } = await import('../js/content/crafting.js');
const { createWorkshopOverlay, createInventoryOverlay } = await import('../js/ui/workshopScreen.js');
const { createMissionScreen } = await import('../js/ui/missionScreen.js');
const { createMission, createBossMission } = await import('../js/engine/mission.js');
const { hasPartArt } = await import('../js/ui/craftArt.js');
const { createDefaultState } = await import('../js/engine/state.js');

const cssText = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

/** Stav hráče: postavené skupiny dílů + krystaly v inventáři. */
function stateWith({ built = [], crystals = {} } = {}) {
  const state = createDefaultState();
  state.inventory.shipParts = built.flatMap((groupId) => partsOfGroup(groupId).map((p) => p.id));
  state.inventory.crystals = Object.entries(crystals).map(([color, count]) => ({ color, count }));
  return state;
}

function openWorkshop(state, onCrafted = () => {}) {
  const container = createContainer();
  createWorkshopOverlay(container, { state, onCrafted, onClose: () => {} });
  return container;
}

/** Řádek dílu podle jeho ilustrace - jméno se opakuje (Trup má loď i droid). */
function partRow(container, partId) {
  return container.querySelectorAll('.part-row').find((row) => row.querySelector(`.part-art-${partId}`)) ?? null;
}

function craftButton(row) {
  return row.querySelectorAll('button').find((b) => b.textContent.includes('Postavit')) ?? null;
}

test('TDD-REWARD-003-H: dílna má skupinu pro každou odměnu a zamčená řekne, co postavit dřív', () => {
  const container = openWorkshop(stateWith());

  const sections = container.querySelectorAll('.part-group');
  assert.equal(sections.length, GROUPS.length, 'dílna neukazuje všechny skupiny dílů');
  for (const group of GROUPS) {
    const section = container.querySelector(`.part-group-${group.id}`);
    assert.ok(section, `chybí skupina ${group.id}`);
    assert.ok(section.textContent.includes(group.name), `skupina ${group.id} není pojmenovaná`);
    for (const part of partsOfGroup(group.id)) {
      assert.ok(partRow(container, part.id), `chybí řádek dílu ${part.id}`);
    }
  }

  // Nový hráč: meč je otevřený, zbytek řetězu vysvětlí, na co se čeká.
  assert.equal(container.querySelector('.part-group-sword').classList.contains('locked'), false);
  const hint = (groupId) => container.querySelector(`.part-group-${groupId}`).textContent;
  assert.ok(hint('ship').includes('Postav nejdřív meč'), 'loď neřekne, že se čeká na meč');
  assert.ok(hint('droid').includes('Postav nejdřív loď'), 'droid neřekne, že se čeká na loď');
  assert.ok(hint('armor').includes('Postav nejdřív droida'), 'brnění neřekne, že se čeká na droida');

  // Zamčený díl nesmí jít postavit ani omylem.
  assert.equal(craftButton(partRow(container, 'droid-head')), null, 'zamčený droid má tlačítko Postavit');
});

test('TDD-REWARD-003-I: hráč s lodí postaví droida klikáním a tím si odemkne brnění', () => {
  const state = stateWith({
    built: ['sword', 'ship'],
    crystals: { 'oranžový': 2, 'tyrkysový': 2, 'žlutý': 3, 'růžový': 2 },
  });
  let crafted = 0;
  let container = openWorkshop(state, () => {
    crafted++;
  });

  // Droid je pro hráče s hotovou lodí rovnou otevřený, brnění ještě ne.
  assert.equal(container.querySelector('.part-group-droid').classList.contains('locked'), false);
  assert.ok(container.querySelector('.part-group-armor').textContent.includes('Postav nejdřív droida'));
  assert.equal(craftButton(partRow(container, 'armor-helmet')), null, 'helma jde postavit před droidem');

  for (const part of partsOfGroup('droid')) {
    const btn = craftButton(partRow(container, part.id));
    assert.ok(btn, `${part.id}: chybí tlačítko Postavit`);
    btn.click();
    // Dílna se po stavbě překreslí - řádek je nový objekt.
    const row = partRow(container, part.id);
    assert.ok(row.textContent.includes('Hotovo'), `${part.id}: stavba se nepropsala do dílny`);
    assert.equal(craftButton(row), null, `${part.id}: postavený díl jde postavit znovu`);
  }

  // Po překreslení nesmí fokus spadnout na body - hráč u klávesnice by se
  // musel prokousat celou dílnou znovu. Nadpis skupiny navíc přečte postup.
  const droidTitle = container.querySelector('.part-group-droid').querySelector('.part-group-title');
  assert.equal(document.activeElement, droidTitle, 'po stavbě se ztratil fokus');
  // Proti ATRIBUTU, ne proti vlastnosti - -1 je i výchozí hodnota nenastaveného
  // prvku, takže tvrzení o vlastnosti by nepoznalo, že nastavení zmizelo.
  assert.equal(droidTitle.getAttribute('tabindex'), '-1', 'nadpis se nesmí stát tab stopem navíc');

  assert.equal(crafted, 3, 'stavba se neohlásila k uložení');
  assert.equal(crystalCount(state, 'oranžový'), 0, 'krystaly se nespotřebovaly');
  assert.equal(crystalCount(state, 'žlutý'), 0);
  assert.ok(container.querySelector('.part-group-droid').textContent.includes('3/3'), 'chybí postup skupiny');

  // A hlavně: dokončený droid otevřel brnění, na které hráč zbylé krystaly má.
  const armor = container.querySelector('.part-group-armor');
  assert.equal(armor.classList.contains('locked'), false, 'brnění zůstalo zamčené i po droidovi');
  assert.equal(armor.textContent.includes('Postav nejdřív'), false);
  assert.ok(craftButton(partRow(container, 'armor-helmet')), 'helmu nejde postavit ani s krystaly');
});

test('TDD-REWARD-003-J: chybějící krystal pošle hráče na konkrétní planetu', () => {
  // Hláška se musí odvodit z crystalColor planety - ruční výčet by u nové
  // planety mlčel nebo lhal.
  const orange = PLANETS.find((p) => p.crystalColor === 'oranžový');
  const state = stateWith({ built: ['sword', 'ship'], crystals: { 'oranžový': 1 } });
  const container = openWorkshop(state);

  const row = partRow(container, 'droid-head');
  assert.ok(row.classList.contains('locked'), 'díl bez krystalů má být šedivý');
  assert.equal(craftButton(row), null, 'díl bez krystalů nabízí stavbu');
  const missing = row.querySelector('.part-missing');
  assert.ok(missing, 'díl bez krystalů neřekne, co chybí');
  assert.equal(missing.textContent, `Potřebuješ oranžový krystal z ${orange.nameGenitive}`);
  assert.equal(orange.name, 'Bespin', 'oranžový krystal už není z Bespinu - hláška se musí odvodit z dat');

  // Víc chybějících krystalů se počítá, ne opakuje.
  const empty = openWorkshop(stateWith({ built: ['sword', 'ship'] }));
  assert.equal(
    partRow(empty, 'droid-head').querySelector('.part-missing').textContent,
    `Potřebuješ 2× oranžový krystal z ${orange.nameGenitive}`
  );

  // Díl ze dvou barev pojmenuje obě planety (brnění je s hotovým droidem
  // odemčené, takže tu mluví chybějící krystaly, ne zámek skupiny).
  const armorOpen = openWorkshop(stateWith({ built: ['sword', 'ship', 'droid'] }));
  const cloakText = partRow(armorOpen, 'armor-cloak').querySelector('.part-missing').textContent;
  for (const color of ['bronzový', 'černý']) {
    const planet = PLANETS.find((p) => p.crystalColor === color);
    assert.ok(cloakText.includes(planet.nameGenitive), `plášť neřekne, kde vzít ${color} krystal`);
  }
});

test('TDD-REWARD-003-K: dílna pobízí k další skupině a na konci pochválí', () => {
  const statusOf = (state) => openWorkshop(state).querySelector('.workshop-status').textContent;
  assert.ok(statusOf(stateWith()).includes('meč'));
  assert.ok(statusOf(stateWith({ built: ['sword'] })).includes('loď'));
  assert.ok(statusOf(stateWith({ built: ['sword', 'ship'] })).includes('droid'));
  assert.ok(statusOf(stateWith({ built: ['sword', 'ship', 'droid'] })).includes('brnění'));
  const done = statusOf(stateWith({ built: GROUPS.map((g) => g.id) }));
  assert.ok(done.includes('hotová'), `hotová dílna hlásí '${done}'`);
});

/* --- Odměna musí být vidět na misi, ne jen v dílně ------------------------ */

function renderMission(state) {
  const container = createContainer();
  const mission = createMission({
    id: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    startDifficulty: 1,
    exerciseCount: 4,
    stepMode: true,
    seed: 11,
  });
  createMissionScreen(container, {
    mission,
    onExit: () => {},
    onFinish: () => {},
    cosmetics: cosmeticsFor(state),
  });
  return container;
}

test('TDD-REWARD-003-L: postavený droid stojí na misi vedle padawana', () => {
  const beforeDroid = renderMission(stateWith({ built: ['sword', 'ship'] }));
  assert.equal(beforeDroid.querySelector('.droid-companion'), null, 'droid se ukazuje dřív, než ho hráč postaví');

  const withDroid = renderMission(stateWith({ built: ['sword', 'ship', 'droid'] }));
  const droid = withDroid.querySelector('.droid-companion');
  assert.ok(droid, 'postavený droid na misi chybí');
  assert.equal(droid.parentNode, withDroid.querySelector('.mission-stage'), 'droid nestojí u postavičky');
  assert.equal(droid.getAttribute('aria-hidden'), 'true', 'dekorace nemá mluvit do odečítače');
  assert.ok(droid.querySelector('.droid-art'), 'droid nemá ilustraci');
});

test('TDD-REWARD-003-M: každý postavený kus brnění je na postavičce vidět hned', () => {
  const naked = renderMission(stateWith({ built: ['sword', 'ship', 'droid'] }));
  for (const cssClass of ['armor-helmet', 'armor-cloak', 'armor-gloves']) {
    assert.equal(naked.querySelectorAll(`.${cssClass}`).length, 0, `${cssClass} se ukazuje bez postavení`);
  }

  // Jeden kus brnění (rozestavěná sada) se musí projevit taky - jinak hráč
  // nevidí odměnu, dokud nedostaví celou trojici.
  const partial = stateWith({ built: ['sword', 'ship', 'droid'] });
  partial.inventory.shipParts.push('armor-helmet');
  const helmetOnly = renderMission(partial);
  assert.ok(helmetOnly.querySelectorAll('.armor-helmet').length > 0, 'postavená helma není na postavičce');
  assert.equal(helmetOnly.querySelectorAll('.armor-cloak').length, 0);
  assert.equal(helmetOnly.querySelectorAll('.armor-gloves').length, 0);

  const full = renderMission(stateWith({ built: GROUPS.map((g) => g.id) }));
  for (const cssClass of ['armor-helmet', 'armor-cloak', 'armor-gloves']) {
    assert.ok(full.querySelectorAll(`.${cssClass}`).length > 0, `${cssClass} chybí na postavičce`);
  }
  assert.ok(full.querySelectorAll('.saber-blade').length > 0, 'meč z dřívějška se ztratil');
});

/* --- Data vs. grafika ------------------------------------------------------ */

test('TDD-REWARD-003-O: odměny jsou vidět i v boss souboji', () => {
  // Boss obrazovka staví HP lištu a bosse přes prepend/insertBefore. Ty stub
  // dlouho neuměl, takže se boss větev missionScreen.js nedala vůbec vykreslit
  // a droid ani brnění v souboji nikdy nikdo netestoval - jen v běžné misi.
  const container = createContainer();
  const boss = createBossMission({
    id: 'dathomir-boss',
    planetId: 'dathomir',
    crystalColor: 'černý',
    topic: 'wordProblems',
    startDifficulty: 4,
    boss: true,
    stepMode: true,
    seed: 11,
  });
  createMissionScreen(container, {
    mission: boss,
    cosmetics: cosmeticsFor(stateWith({ built: ['sword', 'ship', 'droid', 'armor'] })),
    onExit: () => {},
    onFinish: () => {},
  });

  const stage = container.querySelector('.mission-stage');
  assert.ok(container.querySelector('.boss-art'), 'boss se nevykreslil');
  assert.ok(container.querySelector('.boss-hp'), 'chybí HP lišta bosse');
  assert.ok(container.querySelector('.player-shields'), 'chybí štíty hráče');

  const droid = container.querySelector('.droid-companion');
  assert.ok(droid, 'droid v boss souboji chybí');
  assert.equal(droid.parentNode, stage, 'droid nestojí u postavičky');
  for (const cssClass of ['armor-helmet', 'armor-cloak', 'armor-gloves']) {
    assert.ok(container.querySelector(`.${cssClass}`), `v boss souboji chybí ${cssClass}`);
  }
  // Boss patří do stage před padawana, jinak by ho droid a brnění překryly.
  const poradi = stage.childNodes.map((c) => c.className);
  assert.ok(
    poradi.indexOf('boss-art') < poradi.indexOf('avatar'),
    `boss má stát před padawanem, pořadí je ${poradi.join(' | ')}`
  );
});

test('TDD-REWARD-003-N: každý díl má ilustraci a každá skupina styl v CSS', () => {
  // Bez téhle kontroly by nový díl prošel revizí s prázdným místem místo
  // obrázku - stejná past jako createPlanetArt kreslící poušť.
  for (const part of PARTS) {
    assert.ok(hasPartArt(part.id), `${part.id}: chybí ilustrace dílu`);
  }
  for (const group of GROUPS) {
    assert.ok(cssText.includes(`.part-group-${group.id} `), `chybí styl .part-group-${group.id}`);
  }
  // Droid i brnění mají v CSS vlastní pravidla, ne jen třídu v JS.
  for (const cssClass of ['.droid-companion', '.droid-art', '.armor-helmet', '.armor-cloak', '.armor-gloves']) {
    assert.ok(cssText.includes(cssClass), `chybí styl ${cssClass}`);
  }

  // A dílna opravdu žádnou náhradní ikonu nevykreslí.
  const container = openWorkshop(stateWith({ built: GROUPS.map((g) => g.id) }));
  assert.equal(container.querySelectorAll('.part-art-missing').length, 0, 'díl bez ilustrace v dílně');
  assert.equal(container.querySelectorAll('.part-art').length, PARTS.length);
});

/** Relativní jas dle WCAG (stejný výpočet jako v mapDom.test.js). */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test('nadpisy skupin v dílně jsou čitelné proti panelu', () => {
  // Akcent skupiny nese i text nadpisu, takže na něj platí práh pro text
  // (4.5:1) - na mapě už jednou prošla barva s poměrem 1.03:1.
  const panel = /--color-bg-panel:\s*(#[0-9a-f]{6})/.exec(cssText)[1];
  for (const group of GROUPS) {
    const accent = new RegExp(`\\.part-group-${group.id} \\{ --part-accent: (#[0-9a-f]{6})`).exec(cssText);
    assert.ok(accent, `skupina ${group.id} nemá vlastní akcent`);
    const ratio = contrast(accent[1], panel);
    assert.ok(ratio >= 4.5, `${group.id}: nadpis ${accent[1]} má proti panelu jen ${ratio.toFixed(2)}:1`);
  }
});

test('omezený pohyb doopravdy vypne každou animaci ve hře', () => {
  const rules = parseCss(cssText);

  // Které selektory v souboru animaci ZAPÍNAJÍ (mimo blok pro omezený pohyb).
  const animated = [
    ...new Set(
      rules
        .filter((r) => !r.media.some((m) => /prefers-reduced-motion/.test(m)))
        .filter((r) => r.decls.has('animation') || r.decls.has('animation-name'))
        .filter((r) => animationName(r.decls.get('animation-name')?.value ?? r.decls.get('animation').value) !== 'none')
        .map((r) => r.selector)
    ),
  ].sort();

  // Pojistka proti planě zelenému testu: kdyby parser přestal animace
  // nacházet, seznam by byl prázdný a všechno níž by 'prošlo'.
  assert.ok(animated.length >= 8, `parser našel jen ${animated.length} animací - test by nic nehlídal`);
  for (const sel of ['.droid-art', '.saber-blade', '.tile-boxes.is-shaking', '.free-eq-display.is-shaking']) {
    assert.ok(animated.includes(sel), `${sel} podle parseru animaci nezapíná - test hlídá něco jiného, než si myslí`);
  }

  const stillMoving = animated.filter((sel) => resolveAnimation(rules, sel, true) !== 'none');
  assert.deepEqual(
    stillMoving,
    [],
    `s vypnutými animacemi se pořád hýbe: ${stillMoving
      .map((s) => `${s} = ${resolveAnimation(rules, s, true)}`)
      .join(', ')}`
  );

  // Kontrola naopak: bez omezení pohybu animace zůstávají. Jinak by stačilo
  // vypnout pohyb všem a test výš by byl zelený nad mrtvou hrou.
  const movingNormally = animated.filter((sel) => resolveAnimation(rules, sel, false) !== 'none');
  assert.deepEqual(movingNormally, animated, 'animace zmizely i bez zapnutého omezení pohybu');

  // Pohyb dělají i přechody - avatar a boss se posouvají přes transition.
  for (const sel of ['.avatar', '.boss-art']) {
    assert.equal(resolveValue(rules, sel, 'transition', true), 'none', `${sel}: přechod zůstal i s omezeným pohybem`);
  }
});

test('TDD-REWARD-003-P: Zavřít je v dílně na dosah bez rolování', () => {
  const container = openWorkshop(stateWith());
  const panel = container.querySelector('.solution-panel');
  const footer = container.querySelector('.overlay-footer');
  assert.ok(footer, 'panel nemá patičku se Zavřít');
  assert.equal(panel.childNodes[panel.childNodes.length - 1], footer, 'patička není poslední v panelu');
  const closeBtn = footer.querySelectorAll('button').find((b) => b.textContent === 'Zavřít');
  assert.ok(closeBtn, 'Zavřít není v patičce');

  // Dílna se čtyřmi skupinami je vyšší než tablet, takže se musí rolovat
  // OBSAH, ne celý panel - jinak tlačítko na jeho konci odjede mimo obraz
  // (naměřeno 490-820 px pod okrajem). Patička proto stojí mimo rolující
  // část a v CSS to musí platit, ne jen být napsané.
  const rules = parseCss(cssText);
  assert.ok(panel.classList.contains('solution-panel--framed'), 'panel roluje celý i s patičkou');
  assert.equal(footer.parentNode, panel, 'patička se veze uvnitř rolujícího obsahu');
  assert.equal(
    resolveValue(rules, '.solution-panel--framed .overlay-content', 'overflow-y'),
    'auto',
    'obsah dialogu neroluje - dílna by přetekla z panelu ven'
  );
  assert.equal(
    resolveValue(rules, '.solution-panel--framed', 'overflow'),
    'hidden',
    'panel roluje sám, takže si patičku odveze pryč'
  );
  assert.ok(resolveValue(rules, '.overlay-footer', 'background'), 'patička je průhledná - obsah pod ní prosvítá');

  // Ovládání z klávesnice se posunem patičky nesmí rozbít: Escape pořád
  // zavírá. Kruh Tabu (že se z patičky cyklí zpátky do dialogu, a to v obou
  // směrech a ve všech čtyřech dialozích rámce) měří test/dialogFocus.test.js -
  // tady by z něj zůstal jediný krok a pravidlo o pořadí Tabu by mělo dva
  // domovy, které se rozejdou.
  closeBtn.focus();
  document.dispatch('keydown', { key: 'Escape' });
  assert.equal(container.querySelector('.solution-overlay'), null, 'Escape přestal zavírat');

  // Stejná patička platí i pro inventář - druhý overlay nad mapou.
  const inv = createContainer();
  createInventoryOverlay(inv, { state: stateWith(), onClose: () => {} });
  const invFooter = inv.querySelector('.overlay-footer');
  assert.ok(invFooter, 'inventář nemá patičku se Zavřít');
  assert.ok(
    invFooter.querySelectorAll('button').some((b) => b.textContent === 'Zavřít'),
    'inventář má Zavřít mimo patičku'
  );
});

test('ztlumené stavy v dílně a inventáři nesahají na čitelnost textu', () => {
  const rules = parseCss(cssText);

  // Průhlednost se násobí přes celý strom: skupina 0.75 × řádek 0.65 = 0.49
  // a hláška 'Potřebuješ 2× oranžový krystal z Bespinu' spadla na 2.7:1.
  // Ztlumit se proto smí jen ilustrace, ne prvek s textem pod sebou.
  for (const sel of ['.part-group.locked', '.part-row.locked', '.crystal-cell.empty']) {
    assert.equal(resolveValue(rules, sel, 'opacity'), null, `${sel} ztlumuje i text, který má hráč přečíst`);
  }

  const color = (name) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(cssText)[1];
  const rowBg = color('--color-bg');
  const panelBg = color('--color-bg-panel');
  const dim = color('--color-text-dim');
  // .part-requirements v řádku dílu a .part-group-hint na panelu - obojí
  // je návod, co dělat dál, takže platí práh pro text (4.5:1).
  assert.ok(contrast(dim, rowBg) >= 4.5, `popis dílu má proti řádku jen ${contrast(dim, rowBg).toFixed(2)}:1`);
  assert.ok(contrast(dim, panelBg) >= 4.5, `hláška zámku má proti panelu jen ${contrast(dim, panelBg).toFixed(2)}:1`);

  // Nadpis zamčené skupiny nese ztlumený akcent - pořád je to text.
  const lockedAccent = resolveValue(rules, '.part-group.locked', '--part-accent');
  assert.ok(lockedAccent, 'zamčená skupina se ničím neodlišuje');
  assert.ok(
    contrast(lockedAccent, panelBg) >= 4.5,
    `nadpis zamčené skupiny ${lockedAccent} má proti panelu jen ${contrast(lockedAccent, panelBg).toFixed(2)}:1`
  );

  // Zamčený řádek se pozná rámečkem, takže na něj platí práh pro netextovou
  // grafiku (3:1). Šedá #3a4166 měla jen 1.91:1 a rámeček nebyl vidět.
  const lockedOutline = /#[0-9a-f]{6}/.exec(resolveValue(rules, '.part-row.locked', 'outline'))?.[0];
  assert.ok(lockedOutline, 'zamčený řádek se neodlišuje rámečkem');
  assert.ok(
    contrast(lockedOutline, rowBg) >= 3,
    `rámeček zamčeného dílu má proti řádku jen ${contrast(lockedOutline, rowBg).toFixed(2)}:1`
  );
});

test('TDD-REWARD-003-P: otevřený dialog si vezme fokus dovnitř', () => {
  // makeDialogAccessible volá title.focus(), ale běželo dřív, než se overlay
  // vložil do dokumentu - a focus() na odpojeném uzlu je v prohlížeči no-op.
  // Fokus tak zůstal na tlačítku, které dialog otevřelo, tedy MIMO modál:
  // čtečka i klávesnice pak čtou mapu pod dialogem.
  for (const [nazev, open] of [
    ['Dílna', createWorkshopOverlay],
    ['Inventář krystalů', createInventoryOverlay],
  ]) {
    const container = createContainer();
    const opener = document.createElement('button');
    opener.textContent = 'Otevřít';
    container.appendChild(opener);
    opener.focus();
    assert.equal(document.activeElement, opener, 'příprava testu: fokus nezačal na spouštěči');

    open(container, { state: stateWith(), onCrafted: () => {}, onClose: () => {} });

    const focused = document.activeElement;
    assert.notEqual(focused, opener, `${nazev}: fokus zůstal mimo dialog`);
    assert.equal(focused.tagName, 'H2', `${nazev}: fokus nemíří na nadpis dialogu`);
    assert.equal(focused.textContent, nazev);
    assert.ok(container.querySelector('.solution-overlay').contains(focused), `${nazev}: fokus je mimo overlay`);
  }
});

test('tlačítko Postavit drží dotykový cíl 56 px', () => {
  // Původní verze testu se ptala 'není to px hodnota menší než 56?', jenže
  // .btn-craft používá var(--touch-target). Podmínka tím pádem vycházela
  // naprázdno a test by zůstal zelený, i kdyby min-height zmizelo úplně.
  const target = Number(/--touch-target:\s*(\d+)px/.exec(cssText)[1]);
  assert.equal(target, 56, 'změnil se dotykový cíl aplikace');

  const craftRule = /\.btn-craft \{[^}]*\}/s.exec(cssText)[0];
  const declared = /min-height:\s*([^;]+);/.exec(craftRule);
  assert.ok(declared, `.btn-craft nemá min-height: ${craftRule}`);

  const value = declared[1].trim();
  const px = /^(\d+)px$/.exec(value);
  const resolved = px ? Number(px[1]) : value === 'var(--touch-target)' ? target : NaN;
  assert.ok(
    resolved >= 56,
    `tlačítko v dílně má dotykový cíl '${value}', což není aspoň 56 px`
  );
});

test('UCV-FIX-001: rolovatelný obsah dialogu jde zaostřit klávesnicí', async () => {
  // `.overlay-content` roluje (viz test výš), ale uvnitř není nic
  // fokusovatelného a nadpis ani 'Zavřít' v něm nejsou - jsou to jeho
  // SOUROZENCI. Bez tabIndex se tedy na nízkém okně (1024x500) ke spodku
  // obsahu klávesnicí nedostane nikdo. Týká se celého sdíleného rámce, proto
  // se to měří na createOverlay, ne na jedné obrazovce.
  const { createOverlay } = await import('../js/ui/overlay.js');
  const { overlay, content } = createOverlay('Dílna', () => {});
  assert.equal(content.tabIndex, 0, 'rolovatelný obsah dialogu není fokusovatelný');
  // Fokusovatelný má být rolující OBSAH, ne celý rám - ten drží fokus 'Zavřít'.
  assert.notEqual(overlay.tabIndex, 0, 'tab stopem se stal celý rám dialogu');

  // A totéž musí platit pro každou obrazovku, která ten rám používá.
  for (const build of [createWorkshopOverlay, createInventoryOverlay]) {
    const host = createContainer();
    build(host, { state: stateWith(), onCrafted: () => {}, onClose: () => {} });
    const scrollable = host.querySelector('.overlay-content');
    assert.ok(scrollable, 'dialog nemá rolovatelný obsah');
    assert.equal(scrollable.tabIndex, 0, 'obsah dialogu obrazovky není fokusovatelný');
  }
});
