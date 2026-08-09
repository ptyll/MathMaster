import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBossMission } from '../js/engine/mission.js';
import {
  PARTS,
  crystalCount,
  isCrafted,
  hasSword,
  hasShip,
  isUnlocked,
  missingCrystals,
  canCraft,
  craft,
} from '../js/content/crafting.js';
import { applyMissionResult } from '../js/engine/progress.js';
import { isPlanetUnlocked } from '../js/engine/unlock.js';
import { createDefaultState } from '../js/engine/state.js';
import { PLANETS } from '../js/content/planets.js';

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

test('hasShip vyžaduje všechny části lodi', () => {
  const state = stateWithCrystals([['modrý', 3], ['bílý', 3], ['zelený', 3], ['červený', 3], ['fialový', 3]]);
  for (const part of PARTS) {
    craft(state, part.id);
  }
  assert.ok(hasSword(state));
  assert.ok(hasShip(state));
});
