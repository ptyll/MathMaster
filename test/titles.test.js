/**
 * Tituly hráče (UCV-MAP-003): žebříček Padawan -> ... -> Mistr Jedi ->
 * Člen rady Jedi, jeho zpětná kompatibilita a jednorázovost slavnosti.
 *
 * Zpětnou kompatibilitu měříme na SKUTEČNÉM starém savu protaženém
 * createSaveStore().load(), ne na ručně poskládaném objektu stavu -
 * ručně poskládaný objekt by tiše obešel migraci i validaci tvaru.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLANETS, CORE_PLANETS, COUNCIL_PLANETS } from '../js/content/planets.js';
import {
  TITLES,
  COUNCIL_PLANET_COUNT,
  titleFor,
  isJediCouncil,
  completedPlanetCount,
  hasSeenCouncilCelebration,
  markCouncilCelebrationSeen,
} from '../js/engine/titles.js';
import { isMasterJedi } from '../js/engine/unlock.js';
import { createDefaultState } from '../js/engine/state.js';
import { createSaveStore, SAVE_KEY } from '../js/engine/save.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

/** Záznam planety s dokončeným bossem (tak vypadá dohraná planeta v savu). */
function completedPlanetRecord(planet) {
  const boss = planet.missions[planet.missions.length - 1];
  return {
    planetId: planet.id,
    unlockedLevels: planet.missions.length,
    starsPerLevel: Object.fromEntries(planet.missions.map((m) => [m.id, m.boss ? 1 : 3])),
    bestStreak: 4,
    _boss: boss.id,
  };
}

/** Stav hráče, který dohrál prvních `count` planet v řetězu. */
function stateWithFirst(count) {
  const state = createDefaultState();
  state.profile = { name: 'Ahsoka', createdAt: '2026-01-01T00:00:00Z' };
  state.planets = PLANETS.slice(0, count).map((p) => {
    const record = completedPlanetRecord(p);
    delete record._boss;
    return record;
  });
  return state;
}

test('TDD-MAP-003-A: titul roste s dokončenými planetami až k Radě Jedi', () => {
  const labels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => titleFor(stateWithFirst(n)).label);
  assert.deepEqual(labels, [
    'Padawan',
    'Padawan',
    'Zkušený padawan',
    'Zkušený padawan',
    'Rytíř Jedi',
    'Mistr Jedi',
    'Mistr Jedi',
    'Mistr Jedi',
    'Strážce Řádu',
    'Strážce Řádu',
    'Strážce Řádu',
    'Člen rady Jedi',
  ]);
  // Žebříček musí být opravdu vzestupný - jinak by 'nejvyšší dosažený'
  // znamenalo něco jiného, než co hráč čte.
  const thresholds = TITLES.map((t) => t.minPlanets);
  assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b));
  assert.equal(TITLES[0].label, 'Padawan');
  assert.equal(TITLES[TITLES.length - 1].label, 'Člen rady Jedi');
});

test('TDD-MAP-003-B: Mistr Jedi patří pořád původní pětce a Rada všem jedenácti', () => {
  const master = stateWithFirst(CORE_PLANETS.length);
  assert.equal(titleFor(master).label, 'Mistr Jedi');
  assert.equal(isMasterJedi(master, CORE_PLANETS), true, 'starý titul se nesmí hnout');
  assert.equal(isJediCouncil(master), false, 'Rada za pět planet by byla zadarmo');

  const council = stateWithFirst(PLANETS.length);
  assert.equal(isJediCouncil(council), true);
  assert.equal(completedPlanetCount(council), COUNCIL_PLANET_COUNT);
  // Cesta Rady je celý dnešní obsah - core i endgame, nic navíc.
  assert.equal(COUNCIL_PLANET_COUNT, 11);
  assert.deepEqual(
    COUNCIL_PLANETS.map((p) => p.id),
    PLANETS.map((p) => p.id)
  );
});

test('TDD-MAP-003-C: přerušený boss Dathomiru titul nedá, dohraný ano', () => {
  const last = PLANETS[PLANETS.length - 1];
  assert.equal(last.id, 'dathomir');

  // Tři mise Dathomiru hotové, boss rozehraný a neuzavřený.
  const almost = stateWithFirst(PLANETS.length - 1);
  almost.planets.push({
    planetId: last.id,
    unlockedLevels: last.missions.length,
    starsPerLevel: Object.fromEntries(last.missions.filter((m) => !m.boss).map((m) => [m.id, 3])),
    bestStreak: 6,
  });
  assert.equal(isJediCouncil(almost), false, 'titul nesmí přijít před poraženým bossem');
  assert.equal(titleFor(almost).label, 'Strážce Řádu');

  // Boss poražen (i za jednu hvězdu) -> Rada.
  const bossId = last.missions[last.missions.length - 1].id;
  almost.planets[almost.planets.length - 1].starsPerLevel[bossId] = 1;
  assert.equal(isJediCouncil(almost), true);
  assert.equal(titleFor(almost).label, 'Člen rady Jedi');
});

test('TDD-MAP-003-D: titul nezávisí na craftingu', () => {
  const state = stateWithFirst(0);
  state.inventory.shipParts = ['sword-hilt', 'sword-emitter', 'sword-blade', 'sword-heart'];
  state.inventory.crystals = [{ color: 'modrý', count: 20 }];
  assert.equal(titleFor(state).label, 'Padawan', 'díly z dílny nesmí hnout titulem');

  // A naopak: dohraná hra bez jediného postaveného dílu titul má.
  const noCrafting = stateWithFirst(PLANETS.length);
  assert.deepEqual(noCrafting.inventory.shipParts, []);
  assert.equal(titleFor(noCrafting).label, 'Člen rady Jedi');
});

test('TDD-MAP-003-E: starý save bez klíče awards o titul ani postup nepřijde', () => {
  // Save v2 tak, jak ho zapsala verze hry PŘED touhle fází: bez 'awards'.
  const legacy = {
    version: 2,
    profile: { name: 'Rey', createdAt: '2026-02-02T00:00:00Z' },
    planets: CORE_PLANETS.map((p) => {
      const record = completedPlanetRecord(p);
      delete record._boss;
      return record;
    }),
    inventory: { crystals: [{ color: 'modrý', count: 3 }], shipParts: ['sword-hilt'] },
    stats: {
      totalSolved: 40,
      totalAttempts: 55,
      missionsCompleted: 18,
      totalTimeMs: 900000,
      perTopic: {
        equations: { solved: 20, attempts: 25, lastErrors: [], errors: { sign: 2 } },
        fractions: { solved: 20, attempts: 30, lastErrors: [], errors: {} },
      },
    },
    settings: { sound: true, hintsLevel: 'full' },
  };
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify(legacy));
  const store = createSaveStore(storage);

  const loaded = store.load();
  assert.ok(loaded, 'starý save se musí načíst');
  assert.equal(titleFor(loaded).label, 'Mistr Jedi', 'Mistr Jedi nesmí zmizet');
  assert.equal(isMasterJedi(loaded, CORE_PLANETS), true);
  assert.equal(loaded.stats.totalSolved, 40, 'postup se nesmí přepsat');
  assert.deepEqual(loaded.inventory.crystals, [{ color: 'modrý', count: 3 }]);
  assert.equal(loaded.planets.length, CORE_PLANETS.length);

  // Slavnost Rady tenhle hráč neviděl a ani na ni nemá nárok.
  assert.equal(hasSeenCouncilCelebration(loaded), false);
  assert.equal(isJediCouncil(loaded), false);
});

test('TDD-MAP-003-F: značka o proběhlé slavnosti přežije uložení a nespadne na poškozeném savu', () => {
  const state = stateWithFirst(PLANETS.length);
  assert.equal(hasSeenCouncilCelebration(state), false, 'nový stav slavnost ještě neviděl');

  const storage = memoryStorage();
  const store = createSaveStore(storage);
  markCouncilCelebrationSeen(state);
  store.save(state);
  const loaded = store.load();
  assert.equal(hasSeenCouncilCelebration(loaded), true, 'značka se neuložila');
  assert.equal(titleFor(loaded).label, 'Člen rady Jedi', 'titul se ze savu musí přečíst dál');

  // Starý/poškozený tvar: 'awards' chybí, nebo je to primitiv či pole.
  // Zápis vlastnosti na primitiv je ve strict módu TypeError a tenhle kód
  // běží při vykreslení mapy - hra by se vůbec nenamalovala.
  for (const broken of [undefined, 5, 'ano', null, []]) {
    const odd = stateWithFirst(PLANETS.length);
    if (broken === undefined) {
      delete odd.awards;
    } else {
      odd.awards = broken;
    }
    assert.equal(hasSeenCouncilCelebration(odd), false);
    markCouncilCelebrationSeen(odd);
    assert.equal(hasSeenCouncilCelebration(odd), true, `awards=${JSON.stringify(broken)}: značka se nezapsala`);
  }
});

test('TDD-MAP-003-G: další planeta v budoucnu nesmí titul Rady sebrat zpátky', () => {
  // Hráč s dohranou hrou nesmí po přidání dvanácté planety spadnout zpátky
  // na Strážce Řádu - přesně to už jednou hrozilo Mistru Jedimu (UCV-MAP-002).
  // Test hlídá právě tuhle stranu: delší seznam planet titul nesebere.
  //
  // Co tenhle test naopak NEDOKÁŽE: že je práh zmrazené číslo, a ne 'délka
  // PLANETS'. COUNCIL_PLANET_COUNT se počítá při načtení modulu ze skutečných
  // dat, takže na něj podstrčené pole nedosáhne a dnes jsou obě čísla 11.
  // Práh drží až literál assert.equal(COUNCIL_PLANET_COUNT, 11) v testu -B.
  const future = [
    ...PLANETS,
    {
      id: 'jakku',
      tier: 'legacy',
      name: 'Jakku',
      missions: [{ id: 'jakku-boss', title: 'Vrakoviště', boss: true }],
    },
  ];
  const council = stateWithFirst(PLANETS.length);
  assert.equal(titleFor(council, future).label, 'Člen rady Jedi', 'titul zmizel po rozšíření hry');
  assert.equal(isJediCouncil(council, future), true);
  assert.equal(completedPlanetCount(council, future), COUNCIL_PLANET_COUNT);
});
