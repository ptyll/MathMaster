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

test('TDD-MAP-002-D: obtížnost nad stropem tématu (Mustafar 7) generátor unese', () => {
  // Mustafar startuje na 7, adaptivita s ní může vyjet i jinde. Žádné téma
  // se nesmí zaseknout ani vrátit rozbitý příklad - jen svoje maximum.
  for (const topic of ['equations', 'fractions', 'fractionEquations', 'wordProblems']) {
    for (let difficulty = 1; difficulty <= 8; difficulty++) {
      for (let seed = 1; seed <= 30; seed++) {
        const ex = generateForTopic(topic, seed * 37, difficulty, seed);
        assert.equal(ex.topic, topic, `${topic}/${difficulty}`);
        assert.ok(ex.text.length > 0, `${topic}/${difficulty}: prázdné zadání`);
        assert.ok(ex.answer && (ex.answer.kind === 'int' || ex.answer.kind === 'fraction' || ex.answer.kind === 'choice'), `${topic}/${difficulty}: chybí odpověď`);
        assert.ok(Number.isFinite(ex.difficulty), `${topic}/${difficulty}: obtížnost není číslo`);
        assert.ok(ex.steps.length >= 1, `${topic}/${difficulty}: chybí kroky řešení`);
      }
    }
  }
  // Obtížnost 7 dává stejné (nejtěžší) zadání jako 6 - výš generátory nic nemají.
  assert.deepEqual(generateForTopic('equations', 99, 7), generateForTopic('equations', 99, 6));
  assert.deepEqual(generateForTopic('fractionEquations', 99, 7), generateForTopic('fractionEquations', 99, 3));
});

test('nečíselná obtížnost spadne na nejlehčí úroveň místo NaN v zadání', () => {
  for (const bad of [undefined, null, NaN, 'těžká']) {
    const ex = generateForTopic('equations', 7, bad);
    assert.ok(Number.isFinite(ex.difficulty), `obtížnost ${String(bad)} propadla do příkladu`);
    assert.ok(!ex.text.includes('NaN'));
  }
});

test('mise s obtížností 7 a mixem témat doběhne (Mustafar)', () => {
  const mission = testMission({
    id: 'mustafar-3',
    planetId: 'mustafar',
    crystalColor: 'žlutý',
    topic: undefined,
    topics: ['equations', 'fractions', 'fractionEquations'],
    startDifficulty: 7,
    exerciseCount: 4,
  });
  for (let i = 0; i < 4; i++) {
    assert.ok(mission.currentExercise.text.length > 0);
    mission.recordAnswer('correct');
  }
  assert.equal(mission.isDone, true);
  assert.equal(mission.getSummary().stars, 3);
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
