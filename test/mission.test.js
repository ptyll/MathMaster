import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMission, createBossMission, generateForTopic } from '../js/engine/mission.js';
import { applyMissionResult } from '../js/engine/progress.js';
import { createDefaultState } from '../js/engine/state.js';
import { PLANETS } from '../js/content/planets.js';

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
  assert.deepEqual(generateForTopic('fractionEquations', 99, 7), generateForTopic('fractionEquations', 99, 6));
  assert.deepEqual(generateForTopic('fractions', 99, 7, 0), generateForTopic('fractions', 99, 6, 0));
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

/* --- UCN-CLEAN-001: co dítě ze zlomkových druhů reálně uvidí ---------------- */

/**
 * Druh zlomkové úlohy se cyklí TÝMŽ indexem jako téma mise, takže na víctematické
 * planetě padnou jen druhy ze zbytkové třídy. Rozhodnutí fáze UCN-CLEAN-001 znělo
 * NECHAT to tak (měření je v komentáři u FRACTION_KINDS v js/engine/mission.js),
 * a proto tady stojí tahle tabulka: drží dnešní stav, aby změna `exerciseCount`
 * nebo počtu témat nezměnila TIŠE množinu druhů, které dítě na planetě kdy uvidí.
 *
 * Hodnoty jsou NAMĚŘENÉ simulací skutečné mise, ne dopočítané ze vzorce - dopočet
 * by kontroloval tentýž výraz, který má hlídat, a spadl by teprve tehdy, až by se
 * rozešly dvě kopie téhož omylu. U bossů je to hra bez jediné chyby; delší souboj
 * ukáže víc (viz test o `expand` níž).
 */
const ZLOMKOVE_DRUHY_BEZ_CHYBY = {
  'dagobah-1': ['add', 'compare', 'equivalent', 'simplify', 'subtract'],
  'dagobah-2': ['add', 'compare', 'equivalent', 'simplify', 'subtract'],
  'dagobah-3': ['add', 'compare', 'equivalent', 'simplify', 'subtract'],
  'dagobah-boss': ['add', 'compare', 'equivalent', 'simplify', 'subtract'],
  'coruscant-1': ['equivalent', 'subtract'],
  'coruscant-2': ['compare', 'subtract'],
  'coruscant-boss': ['compare', 'subtract'],
  'bespin-1': ['equivalent', 'subtract'],
  'bespin-2': ['equivalent', 'subtract'],
  'bespin-3': ['equivalent', 'subtract'],
  'bespin-boss': ['equivalent', 'subtract'],
  'kamino-1': ['add', 'simplify'],
  'kamino-2': ['add', 'simplify'],
  'kamino-3': ['add', 'simplify'],
  'kamino-boss': ['add', 'compare', 'simplify'],
  'mustafar-1': ['subtract'],
  'mustafar-2': ['subtract'],
  'mustafar-3': ['subtract'],
  'mustafar-boss': ['compare', 'subtract'],
};

/** Mise, ve kterých se vůbec zlomky vyskytují - jednotematické i mixované. */
function miseSeZlomky() {
  return PLANETS.flatMap((planet) =>
    planet.missions
      .filter((m) => (m.topics ? m.topics.includes('fractions') : m.topic === 'fractions'))
      .map((m) => ({ ...m, planetId: planet.id }))
  );
}

/** Odehraje misi na samé správné odpovědi a vrátí druhy zlomkových úloh, které padly. */
function druhyBezChyby(mission, seed = 4711) {
  const config = { ...mission, crystalColor: 'modrý', seed };
  const m = mission.boss ? createBossMission(config) : createMission(config);
  const druhy = new Set();
  let pojistka = 0;
  while (!m.isDone && pojistka++ < 200) {
    const ex = m.currentExercise;
    if (ex.topic === 'fractions') {
      druhy.add(ex.kind);
    }
    m.recordAnswer('correct');
  }
  return [...druhy].sort();
}

test('UCN-CLEAN-001: množiny zlomkových druhů na misích drží (změna exerciseCount nebo témat je změní)', () => {
  const mise = miseSeZlomky();

  // Kdyby filtr nic nenašel, prošla by smyčka níž naprázdno a test by zeleně kryl
  // hru úplně bez zlomků. Počet je proto součástí tvrzení.
  assert.equal(
    mise.length,
    Object.keys(ZLOMKOVE_DRUHY_BEZ_CHYBY).length,
    'změnil se počet misí se zlomky - doplň nebo odeber řádek v ZLOMKOVE_DRUHY_BEZ_CHYBY'
  );

  for (const mission of mise) {
    const ocekavane = ZLOMKOVE_DRUHY_BEZ_CHYBY[mission.id];
    assert.ok(ocekavane, `${mission.id}: nová mise se zlomky, doplň ji do tabulky`);
    const druhy = druhyBezChyby(mission);
    assert.ok(druhy.length > 0, `${mission.id}: nepadl ani jeden zlomkový příklad`);
    assert.deepEqual(
      druhy,
      ocekavane,
      `${mission.id}: změnila se MNOŽINA zlomkových druhů, které tam dítě uvidí`
    );
  }
});

test("UCN-CLEAN-001: 'expand' potká jen dítě, kterému se v boss souboji nedaří", () => {
  const bezChyby = new Set(miseSeZlomky().flatMap((m) => druhyBezChyby(m)));
  assert.equal(
    bezChyby.has('expand'),
    false,
    "dítě, které dohraje hru bez chyby, dnes 'expand' nepotká - jestli už ano, přepiš komentář u FRACTION_KINDS"
  );
  assert.equal(bezChyby.size, 5, 'bezchybná hra dnes ukáže právě pět ze šesti druhů');

  // Boss: index roste jen za správné odpovědi a po třech chybách se boss uzdraví,
  // takže souboj se protáhne a dítě se dostane až na index 5 = 'expand'.
  const boss = createBossMission({
    ...miseSeZlomky().find((m) => m.id === 'dagobah-boss'),
    crystalColor: 'zelený',
    seed: 4711,
  });
  const druhy = new Set();
  let spravne = 0;
  let pojistka = 0;
  while (!boss.isDone && pojistka++ < 200) {
    druhy.add(boss.currentExercise.kind);
    if (spravne === 3) {
      boss.recordAnswer('wrong');
      boss.recordAnswer('wrong');
      boss.recordAnswer('wrong');
      spravne = 0;
      continue;
    }
    boss.recordAnswer('correct');
    spravne++;
  }
  assert.ok(druhy.has('expand'), "prodloužený boss souboj musí dojít až na 'expand'");
});
