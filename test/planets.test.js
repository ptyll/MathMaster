import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLANETS, CORE_PLANETS, getMission, getNextMission, isFinalMissionOfPlanet } from '../js/content/planets.js';
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
import { createMission, createBossMission } from '../js/engine/mission.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { parseEquation } from '../js/content/equationParse.js';
import { applyOperation, checkStep } from '../js/content/stepCheck.js';
import {
  effectiveX,
  effectiveC,
  isFactored,
  needsCombine,
  formatTerms,
} from '../js/content/solver.js';
import { makeFraction, subtractFractions, lcm } from '../js/content/fractions.js';

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

test('TDD-MAP-002-A: řetěz odemykání vede přes všechny planety až k poslední', () => {
  const state = createDefaultState();
  for (let i = 1; i < PLANETS.length; i++) {
    assert.equal(isPlanetUnlocked(state, PLANETS, i), false, `${PLANETS[i].id} nesmí být odemčená předem`);
    const boss = PLANETS[i - 1].missions[PLANETS[i - 1].missions.length - 1];
    completeMission(state, PLANETS[i - 1].id, boss.id);
    assert.equal(isPlanetUnlocked(state, PLANETS, i), true, `${PLANETS[i].id} se má odemknout`);
  }
});

test('TDD-MAP-002-B: Mistr Jedi zůstává nad prvními pěti planetami', () => {
  const state = createDefaultState();
  for (const planet of CORE_PLANETS) {
    const boss = planet.missions[planet.missions.length - 1];
    completeMission(state, planet.id, boss.id);
  }
  assert.equal(CORE_PLANETS.length, 5);
  assert.equal(isMasterJedi(state, CORE_PLANETS), true);
  // Endgame planety titul nezdržují - ty mají vlastní odměnu (UCV-MAP-003).
  assert.equal(isMasterJedi(state, PLANETS), false);
});

test('TDD-MAP-002-C: starý save s dokončeným Coruscantem vidí Bespin odemčený', () => {
  // Uložený stav ze staré verze zná jen planety, které hráč hrál - endgame
  // planety v něm nejsou vůbec a odemykání se o ně nesmí opřít.
  const state = createDefaultState();
  state.planets = [
    { planetId: 'coruscant', unlockedLevels: 3, starsPerLevel: { 'coruscant-boss': 1 }, bestStreak: 3 },
  ];
  const bespinIndex = PLANETS.findIndex((p) => p.id === 'bespin');
  assert.equal(isPlanetUnlocked(state, PLANETS, bespinIndex), true);
  assert.equal(isPlanetUnlocked(state, PLANETS, bespinIndex + 1), false);
});

test('obsah planet: 11 planet, každá má boss misi jako poslední', () => {
  assert.equal(PLANETS.length, 11);
  const allIds = [];
  for (const planet of PLANETS) {
    assert.ok(planet.missions.length >= 3, planet.id);
    const last = planet.missions[planet.missions.length - 1];
    assert.equal(last.boss, true, `${planet.id} nemá bosse na konci`);
    assert.ok(isFinalMissionOfPlanet(last.id));
    assert.equal(isFinalMissionOfPlanet(planet.missions[0].id), false);
    assert.ok(planet.subtitle && planet.art && planet.crystalColor, planet.id);
    assert.ok(planet.tier === 'core' || planet.tier === 'endgame', planet.id);
    allIds.push(...planet.missions.map((m) => m.id));
  }
  // Id misí musí být unikátní přes celou hru - getMission hledá napříč planetami.
  assert.equal(new Set(allIds).size, allIds.length);
});

test('každá planeta má vlastní barvu krystalu (inventář i crafting je podle barvy)', () => {
  const colors = PLANETS.map((p) => p.crystalColor);
  assert.equal(new Set(colors).size, colors.length, `duplicitní barva: ${colors.join(', ')}`);
});

test('id planety je unikátní - stav i postup se hledají podle něj', () => {
  // Uložený stav (state.planets), odemykání i mapa se planety ptají podle id.
  // Dvě planety s týmž id by sdílely jeden záznam o postupu, takže by se
  // odemkly i dohrály naráz - a na mapě by stály dvě stejné karty.
  const ids = PLANETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, `duplicitní id planety: ${ids.join(', ')}`);
});

test('endgame planety: témata a rozsahy obtížnosti podle zadání', () => {
  const expected = {
    bespin: { topics: ['equations', 'fractions'], range: [3, 5] },
    kamino: { topics: ['fractions', 'fractionEquations'], range: [4, 6] },
    mustafar: { topics: ['equations', 'fractions', 'fractionEquations'], range: [5, 7] },
    endor: { topic: 'wordProblems', range: [2, 4] },
    geonosis: { topic: 'wordProblems', range: [3, 5] },
    dathomir: { topic: 'wordProblems', range: [4, 6] },
  };
  const endgame = PLANETS.filter((p) => p.tier === 'endgame');
  assert.deepEqual(endgame.map((p) => p.id), Object.keys(expected));

  for (const planet of endgame) {
    const spec = expected[planet.id];
    // 3 mise + boss
    assert.equal(planet.missions.length, 4, planet.id);
    for (const mission of planet.missions) {
      if (spec.topics) {
        assert.deepEqual(mission.topics, spec.topics, mission.id);
      } else {
        assert.equal(mission.topic, spec.topic, mission.id);
      }
      assert.ok(mission.stepMode, `${mission.id} má mít krokový režim`);
      assert.ok(
        mission.startDifficulty >= spec.range[0] && mission.startDifficulty <= spec.range[1],
        `${mission.id}: obtížnost ${mission.startDifficulty} mimo ${spec.range.join('-')}`
      );
    }
  }
});

test('témata planet odpovídají učebnímu plánu', () => {
  assert.ok(PLANETS[0].missions.every((m) => m.topic === 'equations'));
  assert.ok(PLANETS[2].missions.every((m) => m.topic === 'fractions'));
  assert.ok(PLANETS[3].missions.every((m) => m.topic === 'fractionEquations'));
  assert.ok(PLANETS[4].missions.every((m) => Array.isArray(m.topics))); // mix
});

/* ------------------------------------------------------------------------ */
/* Automatický hráč (TDD-MAP-002-H)                                          */
/* ------------------------------------------------------------------------ */

/*
 * Test průchodnosti musí příklad DOŘEŠIT krokovým řešičem, ne jen ohlásit
 * misi 'correct'. Poučení z předchozího plánu: operace 'sečíst stejné členy'
 * byla v enginu hotová a pokrytá testy, ale neměla tlačítko v UI - příklad
 * proto nešlo dokončit a ŽÁDNÝ test to nechytil, protože všechny testovaly
 * relaci, ne reálné dohrání. Auto-hráč níž proto volí jen kroky, které umí
 * zvolit i dítě na obrazovce (js/ui/stepInput.js): operace se symbolem,
 * roznásobení závorky, sečtení členů na jedné straně - a operand u + a −
 * jen v kladné velikosti, protože směr nese zvolená operace.
 */

const TOKEN = {
  x: { kind: 'x' },
  eq: { kind: 'eq' },
  num: (n, d) => ({ kind: 'num', n, d }),
  op: (op) => ({ kind: 'op', op }),
};

const ONE = { n: 1, d: 1 };

/** Kolik kroků nejvýš, než relaci prohlásíme za zaseknutou. */
const MAX_STEPS = 60;
/** Kolik příkladů nejvýš, než misi prohlásíme za nedoběhnutou (boss léčí). */
const MAX_EXERCISES = 40;

/* --- Fáze 'napiš rovnici': zápis tak, jak ho poskládá dítě ---------------- */

/** Tokeny x-členu s kladným koeficientem: x, 3x, x/4, (3/4)x. */
function xTermTokens(magnitude) {
  if (magnitude.n === 1 && magnitude.d === 1) {
    return [TOKEN.x];
  }
  if (magnitude.d === 1) {
    return [TOKEN.num(magnitude.n), TOKEN.x];
  }
  return magnitude.n === 1
    ? [TOKEN.x, TOKEN.op('/'), TOKEN.num(magnitude.d)]
    : [TOKEN.num(magnitude.n, magnitude.d), TOKEN.x];
}

/** Připojí člen se znaménkem - první člen dostane mínus jen když je záporný. */
function appendTerm(tokens, coefficient, isX) {
  const magnitude = { n: Math.abs(coefficient.n), d: coefficient.d };
  const body = isX ? xTermTokens(magnitude) : [TOKEN.num(magnitude.n, magnitude.d)];
  if (tokens.length === 0) {
    if (coefficient.n < 0) {
      tokens.push(TOKEN.op('-'));
    }
    tokens.push(...body);
    return;
  }
  tokens.push(TOKEN.op(coefficient.n < 0 ? '-' : '+'), ...body);
}

/**
 * Strana rovnice tak, jak ji hráč napíše podle nápovědy: x-člen NESEČTENÝ,
 * rozepsaný na dva členy ('x - x/2' místo '(1/2)x', '2x - x' místo 'x').
 * Přesně tudy se do hry dostane operace 'sečíst stejné členy' - kdyby ji
 * auto-hráč obešel psaním kanonického tvaru, test by tuhle cestu minul.
 */
function playerSideTokens(side) {
  const x = effectiveX(side);
  const c = effectiveC(side);
  const tokens = [];
  if (x.n !== 0) {
    let first = { ...ONE };
    let second = subtractFractions(x, ONE);
    if (second.n === 0) {
      // Koeficient 1 nejde rozepsat jako 'x + 0x' - z 'x' uděláme '2x - x'.
      first = makeFraction(2);
      second = makeFraction(-1);
    }
    appendTerm(tokens, first, true);
    appendTerm(tokens, second, true);
  }
  if (c.n !== 0) {
    appendTerm(tokens, c, false);
  }
  if (tokens.length === 0) {
    tokens.push(TOKEN.num(0));
  }
  return tokens;
}

const playerEquationTokens = (equation) => [
  ...playerSideTokens(equation.left),
  TOKEN.eq,
  ...playerSideTokens(equation.right),
];

/* --- Volba kroku --------------------------------------------------------- */

/** Přesun členu na druhou stranu: kladnou hodnotu odečteme, zápornou přičteme. */
const moveOperation = (value, term) =>
  value.n > 0
    ? { kind: 'sub', term, operand: { n: value.n, d: value.d } }
    : { kind: 'add', term, operand: { n: -value.n, d: value.d } };

/**
 * Kroky, které auto-hráč zkusí, v učebnicovém pořadí: sečíst členy, roznásobit
 * závorku, dostat x na jednu stranu, konstantu na druhou a teprve nakonec
 * zbavit se koeficientu. Slepé dělení se tím vyhne známé předexistující vadě
 * řešiče (z '3x - 8 = 5x' vede legální dělení pěti do stavu bez pokračování) -
 * ta je zaevidovaná jako odložená práce a tenhle test ji nehlídá.
 */
function candidateOperations(state) {
  const operations = [];
  for (const side of ['left', 'right']) {
    if (needsCombine(state[side])) {
      operations.push({ kind: 'combine', side });
    }
  }
  if (isFactored(state.left) || isFactored(state.right)) {
    operations.push({ kind: 'expand' });
  }
  const lx = effectiveX(state.left);
  const rx = effectiveX(state.right);
  const lc = effectiveC(state.left);
  const rc = effectiveC(state.right);
  if (lx.n !== 0 && rx.n !== 0) {
    // Obě orientace - která z nich je pokrok, rozhodne checkStep, ne test.
    operations.push(moveOperation(rx, 'x'), moveOperation(lx, 'x'));
  }
  if (lx.n !== 0 && lc.n !== 0) {
    operations.push(moveOperation(lc, 'const'));
  }
  if (rx.n !== 0 && rc.n !== 0) {
    operations.push(moveOperation(rc, 'const'));
  }
  const coefficient = lx.n !== 0 ? lx : rx;
  if (coefficient.d > 1) {
    operations.push({ kind: 'mul', operand: { n: coefficient.d, d: 1 } });
  }
  if (coefficient.n < 0) {
    operations.push({ kind: 'mul', operand: { n: -1, d: 1 } });
  }
  if (Math.abs(coefficient.n) !== 1 || coefficient.d !== 1) {
    operations.push({ kind: 'div', operand: { ...coefficient } });
  }
  return operations;
}

/* --- Dopočet hodnot po zvoleném kroku ------------------------------------ */

/**
 * Hodnota, na kterou se relace ptá. Který slot to je, relace strojově
 * nevystavuje, takže ho čteme z otázky pro hráče (partQuestion/slotQuestion) -
 * u členu podle jeho zápisu v rovnici PŘED krokem.
 */
function expectedSlotValue(prompt, previous, next) {
  const part = prompt.startsWith('Kolik x') ? 'x' : 'c';
  const fromTerm = /vyjde z členu (.+)\?$/.exec(prompt);
  if (!fromTerm) {
    return next[prompt.includes('levé') ? 'left' : 'right'][part];
  }
  for (const side of ['left', 'right']) {
    const terms = previous[side].terms;
    if (!Array.isArray(terms)) {
      continue;
    }
    // Stejně zapsaný člen na obou stranách dá po stejné operaci stejnou
    // hodnotu, takže na pořadí stran nezáleží.
    const index = terms.findIndex((term) => formatTerms([term]) === fromTerm[1]);
    if (index >= 0) {
      return next[side].terms[index][part];
    }
  }
  return null;
}

/** Všechny hodnoty stavu po kroku - záloha, kdyby otázka změnila znění. */
function valuesAfterStep(next) {
  const values = [];
  for (const side of ['left', 'right']) {
    if (Array.isArray(next[side].terms)) {
      for (const term of next[side].terms) {
        values.push(term.x, term.c);
      }
    }
    values.push(next[side].x, next[side].c);
  }
  return values;
}

const asInput = (value) =>
  value.d === 1 ? { kind: 'int', value: value.n } : { kind: 'fraction', n: value.n, d: value.d };

/* --- Řešení jedné relace ------------------------------------------------- */

function solveEquationSession(session, label, played, source = 'wordProblem') {
  let steps = 0;
  let pendingNext = null;
  while (!session.isDone) {
    assert.ok(
      steps++ < MAX_STEPS,
      `${label}: strop ${MAX_STEPS} kroků vyčerpán na '${session.equationText}' - relace se nedostala do konce`
    );
    if (session.phase === 'values') {
      const prompt = session.question.prompt;
      const exact = expectedSlotValue(prompt, session.equationState, pendingNext);
      const candidates = exact ? [exact, ...valuesAfterStep(pendingNext)] : valuesAfterStep(pendingNext);
      const accepted = candidates.some((value) => session.submitValue(asInput(value)).status !== 'wrong');
      assert.ok(accepted, `${label}: dopočet po kroku neprošel u otázky '${prompt}'`);
      continue;
    }
    const state = session.equationState;
    let chosen = null;
    for (const operation of candidateOperations(state)) {
      // Krok si napřed ověříme stejnými funkcemi, kterými ho posoudí hra -
      // auto-hráč tak nabízí jen kroky, které dávají smysl, a případné
      // odmítnutí níž je opravdový nález, ne jeho hádání.
      const applied = applyOperation(state, operation);
      if (applied.status !== 'ok' || checkStep(state, applied.next).status !== 'ok') {
        continue;
      }
      const result = session.submitOperation(operation);
      assert.ok(
        result.status === 'ok' || result.status === 'committed' || result.status === 'solved',
        `${label}: hra odmítla učebnicový krok ${JSON.stringify(operation)} na '${session.equationText}' (${result.status})`
      );
      pendingNext = applied.next;
      chosen = operation;
      if (operation.kind === 'combine') {
        played.combines++;
        played.combinesBySource[source] = (played.combinesBySource[source] ?? 0) + 1;
      }
      break;
    }
    assert.ok(
      chosen,
      `${label}: relace se zasekla na '${session.equationText}' - z tohohle stavu nevede žádná přijatá operace a příklad nejde dořešit`
    );
  }
}

function solveFractionSession(session, exercise, label) {
  const [a, b] = exercise.operands;
  const common = lcm(a.d, b.d);
  const numerators = [a.n * (common / a.d), b.n * (common / b.d)];
  const combined =
    exercise.kind === 'add' ? numerators[0] + numerators[1] : numerators[0] - numerators[1];
  let steps = 0;
  while (!session.isDone) {
    const phase = session.fractionPhase;
    assert.ok(steps++ < MAX_STEPS, `${label}: zlomková relace uvízla ve fázi ${phase}`);
    const value =
      phase === 'denominator'
        ? { kind: 'int', value: common }
        : phase === 'numerator-a'
          ? { kind: 'int', value: numerators[0] }
          : phase === 'numerator-b'
            ? { kind: 'int', value: numerators[1] }
            : phase === 'combine'
              ? { kind: 'int', value: combined }
              : asInput(makeFraction(combined, common));
    const result = session.submitValue(value);
    assert.ok(result.status !== 'wrong', `${label}: hra odmítla správnou odpověď ve fázi ${phase}: ${result.note}`);
  }
}

/**
 * Dohraje jeden příklad krokovým režimem.
 * @returns {object|null} souhrn relace, nebo null u úloh bez krokového režimu
 *   (krácení, rozšiřování, porovnávání zlomků - ty se řeší zadáním výsledku)
 */
function playExercise(exercise, label, played) {
  played.exercises++;
  played.difficulties.add(`${exercise.topic}:${exercise.difficulty}`);
  const session = createStepSession(exercise);
  if (!session.isActive) {
    assert.ok(exercise.answer, `${label}: úloha bez krokového režimu musí mít odpověď`);
    return null;
  }
  if (session.kind === 'fraction') {
    solveFractionSession(session, exercise, label);
  } else if (session.kind === 'wordProblem') {
    played.wordProblems++;
    const written = parseEquation(playerEquationTokens(exercise.equation), exercise.equation);
    assert.equal(written.status, 'match', `${label}: hráčova rovnice neuznána (${written.note})`);
    assert.ok(session.recordEquationResult(written).advanced, `${label}: uznaná rovnice nepustila do kroků`);
    solveEquationSession(session.equationSession, label, played);
  } else {
    solveEquationSession(session, label, played, exercise.topic);
  }
  assert.ok(session.isDone, `${label}: relace skončila nedořešená`);
  return session.getOutcome();
}

/** Víc seedů: jeden by prohnal jen nepatrný vzorek toho, co generátory umí. */
const PLAYTHROUGH_SEEDS = Array.from({ length: 25 }, (_, i) => 101 + i * 37);

test('TDD-MAP-002-H: každá mise ve hře je průchodná a každý příklad má kroky řešení', () => {
  // Data planet mají přímý vliv na generátory (téma + obtížnost). Test hlídá,
  // že žádná mise - včetně endgame s obtížností 7 a slovních úloh - nespadne
  // ani nevrátí příklad bez krokového vysvětlení (povinné pravidlo aplikace).
  // A hlavně: každý příklad se automatickým hráčem OPRAVDU dořeší krokovým
  // režimem až do konce. Bez toho by test zůstal zelený i nad příkladem,
  // který hráč na obrazovce nemá jak dokončit.
  const played = { exercises: 0, combines: 0, wordProblems: 0, combinesBySource: {}, difficulties: new Set() };
  for (const planet of PLANETS) {
    for (const mission of planet.missions) {
      for (const seed of PLAYTHROUGH_SEEDS) {
        const config = {
          id: mission.id,
          planetId: planet.id,
          crystalColor: planet.crystalColor,
          topic: mission.topic,
          topics: mission.topics,
          exerciseCount: mission.exerciseCount ?? 4,
          startDifficulty: mission.startDifficulty,
          seed,
        };
        const run = mission.boss ? createBossMission(config) : createMission(config);
        let guard = 0;
        while (!run.isDone) {
          assert.ok(guard++ < MAX_EXERCISES, `${mission.id} (seed ${seed}) nedoběhla`);
          const exercise = run.currentExercise;
          const label = `${mission.id} (seed ${seed}, příklad ${guard})`;
          assert.ok(exercise.text.length > 0, `${label}: prázdné zadání`);
          assert.ok(exercise.steps.length >= 1, `${label}: příklad bez kroků řešení`);
          if (exercise.topic === 'wordProblems') {
            // Slovní úloha se bez struktury rovnice nedá ani zapsat, ani ověřit.
            assert.ok(exercise.equation, `${label}: slovní úloha bez rovnice`);
          }
          const outcome = playExercise(exercise, label, played);
          if (outcome) {
            run.recordStepResult(outcome);
          } else {
            run.recordAnswer('correct');
          }
        }
        assert.ok(run.isDone, `${mission.id} (seed ${seed}) nedoběhla`);
      }
    }
  }
  // Pojistka, že test opravdu prohnal to, co slibuje: kdyby auto-hráč začal
  // slovní úlohy psát rovnou sečtené, cesta přes 'sečíst stejné členy' by se
  // tiše přestala testovat.
  assert.ok(played.exercises > 1000, `málo příkladů: ${played.exercises}`);
  // Sečtení členů vzniká nově ze DVOU zdrojů: z hráčem psané rovnice u slovních
  // úloh (tam ho musí projít každá) a ze zlomkových rovnic stupně 4, kde je to
  // nová dovednost. Rovnost by tedy platit přestala - drží se ale to, co
  // pojistka opravdu hlídá: každá slovní úloha tudy projde a obě cesty žijí.
  assert.equal(
    played.combinesBySource.wordProblem,
    played.wordProblems,
    'každá slovní úloha má projít sečtením členů'
  );
  assert.ok(played.combines >= played.wordProblems, 'combine nesmí ubýt');
  assert.ok(played.combines > 500, `málo kroků combine: ${played.combines}`);
  assert.ok(
    played.combinesBySource.fractionEquations > 0,
    'zlomkové rovnice stupně 4 se v žádné misi nedohrály přes sečtení členů'
  );
  // Průchodnost nových stupňů není hotová tím, že testy jsou zelené - musí se
  // doopravdy odehrát. Endgame planety je startují (Kamino 4-6, Mustafar 5+),
  // takže když tu některý chybí, buď ho ořezal strop tématu, nebo se do misí
  // vůbec nedostal a jeho průchodnost nikdo neověřil.
  for (const topic of ['fractions', 'fractionEquations']) {
    for (const difficulty of [4, 5, 6]) {
      assert.ok(
        played.difficulties.has(`${topic}:${difficulty}`),
        `auto-hráč nikdy nehrál ${topic} na obtížnosti ${difficulty}: ${[...played.difficulties].sort()}`
      );
    }
  }
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
