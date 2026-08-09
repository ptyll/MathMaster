import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLANETS, getMission, getNextMission, isFinalMissionOfPlanet } from '../js/content/planets.js';
import {
  isPlanetUnlocked,
  isPlanetCompleted,
  planetStars,
  planetMaxStars,
  isMasterJedi,
  starsFor,
  totalCrystals,
} from '../js/engine/unlock.js';
import { createDefaultState } from '../js/engine/state.js';
import { applyMissionResult } from '../js/engine/progress.js';

function completeMission(state, planetId, missionId, stars = 1) {
  const mission = getMission(missionId);
  applyMissionResult(state, {
    missionId,
    planetId,
    crystalColor: mission.crystalColor,
    topic: mission.topic ?? 'equations',
    stars,
    mistakes: 0,
    firstTryCount: 5,
    solved: 5,
    total: 5,
    hintsUsed: 0,
  });
}

test('TDD-MAP-001-A: nový hráč má odemčenou jen první planetu', () => {
  const state = createDefaultState();
  PLANETS.forEach((_p, i) => {
    assert.equal(isPlanetUnlocked(state, PLANETS, i), i === 0, `planeta ${i}`);
  });
});

test('TDD-MAP-001-B: dokončení boss mise odemkne další planetu', () => {
  const state = createDefaultState();
  const first = PLANETS[0];
  // obyčejná mise nestačí
  completeMission(state, first.id, first.missions[0].id);
  assert.equal(isPlanetUnlocked(state, PLANETS, 1), false);
  // boss mise ano
  const boss = first.missions[first.missions.length - 1];
  completeMission(state, first.id, boss.id);
  assert.equal(isPlanetCompleted(state, first), true);
  assert.equal(isPlanetUnlocked(state, PLANETS, 1), true);
});

test('poslední planeta se odemkne až po předposlední', () => {
  const state = createDefaultState();
  for (let i = 0; i < PLANETS.length - 1; i++) {
    const boss = PLANETS[i].missions[PLANETS[i].missions.length - 1];
    completeMission(state, PLANETS[i].id, boss.id);
  }
  assert.equal(isPlanetUnlocked(state, PLANETS, PLANETS.length - 1), true);
  assert.equal(isMasterJedi(state, PLANETS), false);
  const lastBoss = PLANETS[4].missions[PLANETS[4].missions.length - 1];
  completeMission(state, PLANETS[4].id, lastBoss.id);
  assert.equal(isMasterJedi(state, PLANETS), true);
});

test('obsah planet: 5 planet, každá má boss misi jako poslední', () => {
  assert.equal(PLANETS.length, 5);
  for (const planet of PLANETS) {
    assert.ok(planet.missions.length >= 3, planet.id);
    const last = planet.missions[planet.missions.length - 1];
    assert.equal(last.boss, true, `${planet.id} nemá bosse na konci`);
    assert.ok(isFinalMissionOfPlanet(last.id));
    assert.equal(isFinalMissionOfPlanet(planet.missions[0].id), false);
    // unikátní id misí
    const ids = planet.missions.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('témata planet odpovídají učebnímu plánu', () => {
  assert.ok(PLANETS[0].missions.every((m) => m.topic === 'equations'));
  assert.ok(PLANETS[2].missions.every((m) => m.topic === 'fractions'));
  assert.ok(PLANETS[3].missions.every((m) => m.topic === 'fractionEquations'));
  assert.ok(PLANETS[4].missions.every((m) => Array.isArray(m.topics))); // mix
});

test('getMission a getNextMission', () => {
  const m = getMission('hoth-2');
  assert.equal(m.planetId, 'hoth');
  assert.equal(m.crystalColor, 'bílý');
  assert.equal(getNextMission('hoth-2').id, 'hoth-3');
  assert.equal(getNextMission('hoth-boss'), null);
  assert.equal(getMission('neexistuje'), null);
});

test('planetStars a planetMaxStars', () => {
  const state = createDefaultState();
  const planet = PLANETS[0];
  assert.equal(planetStars(state, planet), 0);
  assert.equal(planetMaxStars(planet), (planet.missions.length - 1) * 3 + 1); // boss dává 1
  completeMission(state, planet.id, planet.missions[0].id, 3);
  completeMission(state, planet.id, planet.missions[1].id, 2);
  assert.equal(planetStars(state, planet), 5);
  assert.equal(starsFor(state, planet.id, planet.missions[0].id), 3);
});

test('totalCrystals sčítá inventář', () => {
  const state = createDefaultState();
  completeMission(state, 'tatooine', 'tatooine-1', 3); // krystal + bonus
  assert.equal(totalCrystals(state), 2);
});
