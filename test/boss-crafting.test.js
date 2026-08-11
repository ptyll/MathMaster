import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBossMission } from '../js/engine/mission.js';
import {
  GROUPS,
  PARTS,
  crystalCount,
  isCrafted,
  hasSword,
  hasDroid,
  isUnlocked,
  isGroupComplete,
  groupProgress,
  partsOfGroup,
  missingCrystals,
  canCraft,
  craft,
  cosmeticsFor,
} from '../js/content/crafting.js';
import { applyMissionResult } from '../js/engine/progress.js';
import { isPlanetUnlocked, isMasterJedi } from '../js/engine/unlock.js';
import { createDefaultState } from '../js/engine/state.js';
import { createSaveStore } from '../js/engine/save.js';
import { PLANETS, CORE_PLANETS } from '../js/content/planets.js';

function testBoss() {
  return createBossMission({
    id: 'tatooine-boss',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    startDifficulty: 2,
    seed: 555,
  });
}

test('TDD-BOSS-001-A: správná odpověď ubere bossovi HP', () => {
  const boss = testBoss();
  assert.equal(boss.hp, 5);
  const r = boss.recordAnswer('correct');
  assert.equal(boss.hp, 4);
  assert.equal(r.missionDone, false);
});

test('boss padne po maxHp správných odpovědích', () => {
  const boss = testBoss();
  let r;
  for (let i = 0; i < 5; i++) {
    r = boss.recordAnswer('correct');
  }
  assert.equal(r.missionDone, true);
  assert.ok(boss.isDone);
  const summary = boss.getSummary();
  assert.equal(summary.boss, true);
  assert.equal(summary.stars, 1); // značka dokončení pro odemykání
});

test('špatná odpověď bere štít; po 3 se boss uzdraví na polovinu', () => {
  const boss = testBoss();
  boss.recordAnswer('correct');
  boss.recordAnswer('correct'); // hp 3
  boss.recordAnswer('wrong');   // shields 2
  boss.recordAnswer('wrong');   // shields 1
  const r = boss.recordAnswer('wrong'); // shields 0 -> heal
  assert.equal(r.healed, true);
  assert.equal(boss.shields, 3);
  assert.equal(boss.hp, 3); // max(3, ceil(5/2)=3)
  assert.ok(!boss.isDone); // žádný game over
});

test('uzdravení nikdy nesníží HP pod polovinu ani nezvýší nad aktuál', () => {
  const boss = testBoss();
  // hp 5, 3x špatně -> heal na max(5, 3) = 5? hp je 5 -> zůstane 5
  boss.recordAnswer('wrong');
  boss.recordAnswer('wrong');
  const r = boss.recordAnswer('wrong');
  assert.equal(r.healed, true);
  assert.equal(boss.hp, 5);
});

test('boss mise generuje příklady do nekonečna (vítězství i po chybách)', () => {
  const boss = testBoss();
  // 4 chyby, pak 5 správných - boss musí padnout
  for (let i = 0; i < 4; i++) {
    boss.recordAnswer('wrong');
  }
  let r;
  for (let i = 0; i < 5; i++) {
    r = boss.recordAnswer('correct');
  }
  assert.equal(r.missionDone, true);
});

test('dokončení bosse odemkne další planetu (stars=1)', () => {
  const state = createDefaultState();
  const boss = testBoss();
  for (let i = 0; i < 5; i++) {
    boss.recordAnswer('correct');
  }
  applyMissionResult(state, boss.getSummary());
  assert.equal(isPlanetUnlocked(state, PLANETS, 1), true);
});

// --- Crafting ---

function stateWithCrystals(entries) {
  const state = createDefaultState();
  state.inventory.crystals = entries.map(([color, count]) => ({ color, count }));
  return state;
}

test('crafting meče: potřebuje krystal každé barvy, loď je zamčená', () => {
  const state = stateWithCrystals([['modrý', 1], ['bílý', 1], ['zelený', 1]]);
  const hilt = PARTS.find((p) => p.id === 'sword-hilt');
  assert.ok(canCraft(state, hilt));
  assert.ok(craft(state, 'sword-hilt'));
  assert.ok(isCrafted(state, 'sword-hilt'));
  assert.equal(crystalCount(state, 'modrý'), 0); // krystal se spotřeboval
  assert.ok(!hasSword(state));

  // loď zamčená před mečem
  const hull = PARTS.find((p) => p.id === 'ship-hull');
  assert.equal(isUnlocked(state, hull), false);
  assert.equal(canCraft(state, hull), false);
});

test('TDD-REWARD-002: postavení meče z kompletní sady', () => {
  const state = stateWithCrystals([['modrý', 1], ['bílý', 1], ['zelený', 1], ['červený', 1], ['fialový', 1]]);
  for (const part of PARTS.filter((p) => p.group === 'sword')) {
    assert.ok(craft(state, part.id), part.id);
  }
  assert.ok(hasSword(state));
  // teď je loď odemčená
  assert.ok(isUnlocked(state, PARTS.find((p) => p.id === 'ship-hull')));
  // ale chybí krystaly
  assert.equal(canCraft(state, PARTS.find((p) => p.id === 'ship-hull')), false);
  const missing = missingCrystals(state, PARTS.find((p) => p.id === 'ship-hull'));
  assert.deepEqual(missing, { 'modrý': 2, 'bílý': 2 });
});

test('craft bez krystalů selže a nic nezmění', () => {
  const state = createDefaultState();
  assert.equal(craft(state, 'sword-hilt'), false);
  assert.equal(state.inventory.shipParts.length, 0);
});

test('dvojitá stavba stejné části selže', () => {
  const state = stateWithCrystals([['modrý', 2]]);
  assert.ok(craft(state, 'sword-hilt'));
  assert.equal(craft(state, 'sword-hilt'), false);
});

test('dokončená skupina se pozná z postavených dílů', () => {
  const state = stateWithCrystals([['modrý', 3], ['bílý', 3], ['zelený', 3], ['červený', 3], ['fialový', 3]]);
  for (const part of PARTS.filter((p) => p.group === 'sword' || p.group === 'ship')) {
    craft(state, part.id);
  }
  assert.ok(hasSword(state));
  assert.ok(isGroupComplete(state, 'ship'));
});

/* --- Droid a světelné brnění (UCV-REWARD-003) ----------------------------- */

/** Barvy krystalů planet, které patří k dané skupině dílů - odvozeno z dat. */
function colorsOfParts(groupId) {
  return [...new Set(partsOfGroup(groupId).flatMap((p) => Object.keys(p.requires)))];
}

/** Planeta, ze které barva krystalu pochází. */
function planetOfColor(color) {
  return PLANETS.find((p) => p.crystalColor === color);
}

/** Stav se všemi krystaly, aby stavbu blokovalo jen odemykání skupin. */
function richState() {
  return stateWithCrystals(PLANETS.map((p) => [p.crystalColor, 9]));
}

function buildGroup(state, groupId) {
  for (const part of partsOfGroup(groupId)) {
    assert.ok(craft(state, part.id), `${part.id} se nepostavil`);
  }
}

test('TDD-REWARD-003-A: řetěz meč -> loď -> droid -> brnění se odemyká po skupinách', () => {
  const state = richState();
  const droidHead = PARTS.find((p) => p.id === 'droid-head');
  const helmet = PARTS.find((p) => p.id === 'armor-helmet');

  // Na začátku je odemčený jen meč - droid ani brnění nejdou postavit,
  // i když má hráč všechny krystaly světa.
  assert.equal(isUnlocked(state, droidHead), false);
  assert.equal(canCraft(state, droidHead), false);
  assert.equal(craft(state, 'droid-head'), false, 'zamčený díl se nesmí dát postavit');

  buildGroup(state, 'sword');
  assert.equal(isUnlocked(state, droidHead), false, 'droid se odemyká lodí, ne mečem');

  buildGroup(state, 'ship');
  assert.ok(isUnlocked(state, droidHead), 'po lodi má být droid odemčený');
  assert.equal(isUnlocked(state, helmet), false, 'brnění čeká na droida');

  // Rozestavěný droid brnění neodemkne - musí stát celý.
  assert.ok(craft(state, 'droid-head'));
  assert.ok(craft(state, 'droid-body'));
  assert.equal(hasDroid(state), false);
  assert.equal(isUnlocked(state, helmet), false, 'dva ze tří dílů droida nestačí');
  assert.deepEqual(groupProgress(state, 'droid'), { built: 2, total: 3 });

  assert.ok(craft(state, 'droid-legs'));
  assert.ok(hasDroid(state));
  assert.ok(isUnlocked(state, helmet), 'hotový droid odemyká brnění');

  buildGroup(state, 'armor');
  assert.ok(isGroupComplete(state, 'armor'));
  assert.ok(GROUPS.every((g) => isGroupComplete(state, g.id)), 'dílna má být hotová');
});

test('TDD-REWARD-003-B: stavba droida spotřebuje krystaly a chybějící pojmenuje', () => {
  const state = stateWithCrystals([['oranžový', 2], ['tyrkysový', 2]]);
  // Odemčení řešíme přímo přes postavené díly - tady jde o krystaly.
  state.inventory.shipParts = PARTS.filter((p) => p.group === 'sword' || p.group === 'ship').map((p) => p.id);

  assert.ok(craft(state, 'droid-head'));
  assert.equal(crystalCount(state, 'oranžový'), 0, 'krystaly se mají spotřebovat');

  const body = PARTS.find((p) => p.id === 'droid-body');
  assert.equal(canCraft(state, body), false);
  assert.deepEqual(missingCrystals(state, body), { 'žlutý': 1 });

  // Nedokončený droid nesmí zmizet z inventáře ani ze stavu při neúspěchu.
  assert.equal(craft(state, 'droid-body'), false);
  assert.equal(crystalCount(state, 'tyrkysový'), 2);
  assert.equal(isCrafted(state, 'droid-body'), false);
});

test('TDD-REWARD-003-C: droid stojí krystaly mix planet, brnění krystaly slovních planet', () => {
  // Zdroj barev se odvozuje z PLANETS, ne z výčtu v testu: kdyby někdo
  // přebarvil planetu, spadne tohle, ne až oko hráče.
  const endgame = PLANETS.filter((p) => p.tier === 'endgame');
  const isWordPlanet = (planet) => planet.missions.every((m) => m.topic === 'wordProblems');
  const mixColors = endgame.filter((p) => !isWordPlanet(p)).map((p) => p.crystalColor);
  const wordColors = endgame.filter(isWordPlanet).map((p) => p.crystalColor);

  assert.deepEqual(colorsOfParts('droid').sort(), [...mixColors].sort());
  assert.deepEqual(colorsOfParts('armor').sort(), [...wordColors].sort());

  for (const groupId of ['droid', 'armor']) {
    for (const part of partsOfGroup(groupId)) {
      for (const [color, count] of Object.entries(part.requires)) {
        assert.ok(planetOfColor(color), `${part.id}: barva ${color} není z žádné planety`);
        assert.ok(count >= 1 && count <= 2, `${part.id}: ${color} stojí ${count} krystalů (má být 1-2)`);
      }
    }
  }
});

test('TDD-REWARD-003-D: na každý díl se dá vydělat i bez trojhvězdičkových bonusů', () => {
  // Za první dokončení mise je jeden krystal, bonus až za tři hvězdy.
  // Kdyby díl stál víc, než planeta vůbec dá, byla by dílna neprůchodná.
  const needed = {};
  for (const part of PARTS) {
    for (const [color, count] of Object.entries(part.requires)) {
      needed[color] = (needed[color] ?? 0) + count;
    }
  }
  for (const [color, count] of Object.entries(needed)) {
    const planet = planetOfColor(color);
    assert.ok(planet, `barva ${color} nemá planetu`);
    assert.ok(
      count <= planet.missions.length,
      `${color}: díly chtějí ${count} krystalů, ale ${planet.name} jich dá jen ${planet.missions.length}`
    );
  }
});

test('TDD-REWARD-003-E: hotová dílna neovlivní obtížnost, odemykání planet ani tituly', () => {
  const state = richState();
  for (const group of GROUPS) {
    buildGroup(state, group.id);
  }
  assert.ok(isGroupComplete(state, 'armor'));
  // Postup po mapě i titul se počítají výhradně z odehraných misí.
  assert.equal(isPlanetUnlocked(state, PLANETS, 1), false);
  assert.equal(isMasterJedi(state, CORE_PLANETS), false);
  assert.deepEqual(state.planets, []);
  // A crafting nesahá do statistik, ze kterých se bere adaptivní obtížnost.
  assert.equal(state.stats.totalSolved, 0);
  assert.equal(state.stats.totalAttempts, 0);
});

test('TDD-REWARD-003-F: starý save s hotovým mečem i lodí má droida rovnou odemčeného', () => {
  // Skutečný save předchozí verze (schéma v2, ještě bez tématu wordProblems),
  // protáhnutý opravdovým save modulem - ne ručně poskládaný objekt.
  const legacySave = {
    version: 2,
    profile: { name: 'Ela', createdAt: '2025-11-03T10:00:00.000Z' },
    planets: CORE_PLANETS.map((planet) => ({
      planetId: planet.id,
      unlockedLevels: planet.missions.length,
      starsPerLevel: Object.fromEntries(planet.missions.map((m) => [m.id, 3])),
      bestStreak: 4,
    })),
    inventory: {
      crystals: [{ color: 'modrý', count: 2 }],
      shipParts: [
        'sword-hilt', 'sword-emitter', 'sword-blade', 'sword-heart',
        'ship-hull', 'ship-engine', 'ship-cockpit', 'ship-wings',
      ],
    },
    stats: {
      totalSolved: 120,
      totalAttempts: 150,
      missionsCompleted: 18,
      totalTimeMs: 3600000,
      perTopic: {
        equations: { solved: 60, attempts: 70, lastErrors: [], errors: { signError: 3 } },
        fractions: { solved: 40, attempts: 50, lastErrors: [], errors: {} },
        fractionEquations: { solved: 20, attempts: 30, lastErrors: [], errors: {} },
      },
    },
    settings: { sound: true, hintsLevel: 'full' },
  };
  const storage = new Map();
  const store = createSaveStore({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  });
  storage.set('mathmaster-save-v1', JSON.stringify(legacySave));

  const state = store.load();
  assert.ok(state, 'starý save se musí načíst');
  assert.ok(hasSword(state) && isGroupComplete(state, 'ship'), 'postup z minulé verze zůstává');

  // Tohle je jádro zpětné kompatibility: droid se odemyká z postavených dílů,
  // takže hráč po aktualizaci hry nemusí nic dohánět.
  for (const part of partsOfGroup('droid')) {
    assert.ok(isUnlocked(state, part), `${part.id} má být pro starý save odemčený`);
  }
  assert.equal(hasDroid(state), false, 'droida ještě nikdo nepostavil');
  for (const part of partsOfGroup('armor')) {
    assert.equal(isUnlocked(state, part), false, 'brnění čeká na droida i po aktualizaci');
  }
  // A hotový meč se dál propisuje na misi.
  assert.deepEqual(cosmeticsFor(state), {
    saber: true,
    droid: false,
    armor: { helmet: false, cloak: false, gloves: false },
  });
});

test('TDD-REWARD-003-G: save z verze 1 se stejným postupem droida taky odemkne', () => {
  const v1Save = {
    version: 1,
    profile: { name: 'Ela', createdAt: '2025-09-01T08:00:00.000Z' },
    planets: [],
    inventory: {
      crystals: [],
      shipParts: [
        'sword-hilt', 'sword-emitter', 'sword-blade', 'sword-heart',
        'ship-hull', 'ship-engine', 'ship-cockpit', 'ship-wings',
      ],
    },
    stats: {
      totalSolved: 10,
      totalAttempts: 12,
      perTopic: { equations: { solved: 10, attempts: 12, lastErrors: [], errors: {} } },
    },
    settings: { sound: true, hintsLevel: 'full' },
  };
  const storage = new Map();
  const store = createSaveStore({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  });
  storage.set('mathmaster-save-v1', JSON.stringify(v1Save));

  const state = store.load();
  assert.ok(state, 'save verze 1 se musí zmigrovat, ne zahodit');
  assert.equal(state.version, 2);
  assert.ok(isUnlocked(state, PARTS.find((p) => p.id === 'droid-head')));
});
