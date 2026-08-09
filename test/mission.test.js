import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMission, generateForTopic } from '../js/engine/mission.js';
import { applyMissionResult } from '../js/engine/progress.js';
import { createDefaultState } from '../js/engine/state.js';

function testMission(overrides = {}) {
  return createMission({
    id: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    exerciseCount: 5,
    startDifficulty: 1,
    seed: 1000,
    ...overrides,
  });
}

/** Odpoví správně na aktuální příklad (vezme odpověď z generátoru). */
function answerCorrectly(mission) {
  return mission.recordAnswer('correct');
}

test('mise postupuje příklady a skončí po exerciseCount', () => {
  const m = testMission();
  assert.equal(m.progress.current, 1);
  assert.equal(m.progress.total, 5);

  let result;
  for (let i = 0; i < 4; i++) {
    result = answerCorrectly(m);
    assert.equal(result.missionDone, false);
  }
  result = answerCorrectly(m);
  assert.equal(result.missionDone, true);
  assert.ok(m.isDone);
});

test('TDD-MISSION-002-A: 2 chyby ze 7 příkladů = 2 hvězdy', () => {
  const m = testMission({ exerciseCount: 7 });
  // 2 příklady nejdřív pokazíme (1 chyba každý), pak všechny správně.
  m.recordAnswer('wrong');
  answerCorrectly(m);
  m.recordAnswer('wrong');
  answerCorrectly(m);
  for (let i = 0; i < 5; i++) {
    answerCorrectly(m);
  }
  assert.equal(m.getSummary().stars, 2);
  assert.equal(m.getSummary().mistakes, 2);
});

test('všechny příklady napoprvé = 3 hvězdy', () => {
  const m = testMission();
  while (!m.isDone) {
    answerCorrectly(m);
  }
  assert.equal(m.getSummary().stars, 3);
});

test('víc než 2 chyby = 1 hvězda', () => {
  const m = testMission();
  m.recordAnswer('wrong');
  m.recordAnswer('wrong');
  answerCorrectly(m);
  m.recordAnswer('wrong');
  answerCorrectly(m);
  while (!m.isDone) {
    answerCorrectly(m);
  }
  assert.equal(m.getSummary().stars, 1);
});

test('přeskočení se počítá jako nezodpovězený příklad (chyba pro hvězdy)', () => {
  const m = testMission();
  m.skip();
  m.skip();
  m.skip();
  while (!m.isDone) {
    answerCorrectly(m);
  }
  assert.equal(m.getSummary().mistakes, 3);
  assert.equal(m.getSummary().stars, 1);
});

test('po 2. chybě u stejného příkladu se nabídnou kroky', () => {
  const m = testMission();
  const r1 = m.recordAnswer('wrong');
  assert.equal(r1.showSteps, false);
  const r2 = m.recordAnswer('wrong');
  assert.equal(r2.showSteps, true);
  assert.ok(m.shouldShowSteps);
  // příklad se neposunul
  assert.equal(m.progress.current, 1);
});

test('adaptivita v misi: 3 správné v řadě zvýší obtížnost dalšího příkladu', () => {
  const m = testMission({ startDifficulty: 1 });
  answerCorrectly(m);
  answerCorrectly(m);
  answerCorrectly(m);
  // čtvrtý příklad už je z obtížnosti 2
  assert.equal(m.currentExercise.difficulty, 2);
});

test('generateForTopic pokrývá všechna témata', () => {
  assert.equal(generateForTopic('equations', 1, 1).topic, 'equations');
  assert.equal(generateForTopic('fractions', 1, 2, 3).topic, 'fractions');
  assert.equal(generateForTopic('fractionEquations', 1, 3).topic, 'fractionEquations');
  assert.throws(() => generateForTopic('geometry', 1, 1), /Neznámé téma/);
});

test('fractions téma cyklí druhy úloh', () => {
  const kinds = new Set();
  for (let i = 0; i < 6; i++) {
    kinds.add(generateForTopic('fractions', 42, 2, i).kind);
  }
  assert.equal(kinds.size, 6);
});

test('TDD-MISSION-002-B: zopakování mise přepíše hvězdy na max, krystal se neduplikuje', () => {
  const state = createDefaultState();
  const first = applyMissionResult(state, {
    missionId: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    stars: 2,
    mistakes: 2,
    firstTryCount: 3,
    solved: 5,
    total: 5,
  });
  assert.equal(first.crystalGranted, true);
  assert.equal(first.bonusGranted, false);
  assert.equal(state.inventory.crystals[0].count, 1);

  const second = applyMissionResult(state, {
    missionId: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    stars: 3,
    mistakes: 0,
    firstTryCount: 5,
    solved: 5,
    total: 5,
  });
  assert.equal(second.starsGranted, 3);
  assert.equal(second.crystalGranted, false); // krystal se neduplikuje
  assert.equal(second.bonusGranted, true);    // bonus za první 3 hvězdy
  assert.equal(state.inventory.crystals[0].count, 2);
});

test('horší výsledek hvězdy nesníží', () => {
  const state = createDefaultState();
  applyMissionResult(state, { missionId: 'm1', planetId: 'p', crystalColor: 'modrý', stars: 3, mistakes: 0, firstTryCount: 5, solved: 5, total: 5 });
  const replay = applyMissionResult(state, { missionId: 'm1', planetId: 'p', crystalColor: 'modrý', stars: 1, mistakes: 4, firstTryCount: 1, solved: 5, total: 5 });
  assert.equal(replay.starsGranted, 3);
  assert.equal(replay.crystalGranted, false);
  assert.equal(replay.bonusGranted, false);
  assert.equal(state.inventory.crystals[0].count, 2); // 1 + bonus z prvního průchodu
});

test('statistiky se sčítají', () => {
  const state = createDefaultState();
  applyMissionResult(state, { missionId: 'm1', planetId: 'p', crystalColor: 'modrý', stars: 2, mistakes: 1, firstTryCount: 4, solved: 5, total: 5 });
  assert.equal(state.stats.totalSolved, 5);
  assert.equal(state.stats.totalAttempts, 6);
});

test('solved počítá jen skutečně vyřešené (skip se nepočítá)', () => {
  const m = testMission();
  m.skip();
  m.skip();
  while (!m.isDone) {
    answerCorrectly(m);
  }
  const summary = m.getSummary();
  assert.equal(summary.solved, 3);
  assert.equal(summary.total, 5);
});

test('applyMissionResult plní i per-topic statistiky', () => {
  const state = createDefaultState();
  applyMissionResult(state, {
    missionId: 'm1',
    planetId: 'p',
    crystalColor: 'modrý',
    topic: 'equations',
    stars: 2,
    mistakes: 2,
    firstTryCount: 3,
    solved: 5,
    total: 5,
  });
  assert.equal(state.stats.perTopic.equations.solved, 5);
  assert.equal(state.stats.perTopic.equations.attempts, 7);
  assert.equal(state.stats.perTopic.fractions.solved, 0);
});
