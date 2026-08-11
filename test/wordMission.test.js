import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMission, createBossMission, generateForTopic } from '../js/engine/mission.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { parseEquation } from '../js/content/equationParse.js';
import {
  generateWordProblem,
  equationInputKind,
  machineOperations,
} from '../js/content/wordProblems.js';
import { expr, factoredExpr, effectiveX, effectiveC, formatExpr } from '../js/content/solver.js';
import { wordEquationHintText, summaryWithCarriedErrors } from '../js/ui/missionScreen.js';

// --- Pomocníci pro skládání tokenů (stejný vzor jako equationParse.test.js) --

const T = {
  x: Object.freeze({ kind: 'x' }),
  eq: Object.freeze({ kind: 'eq' }),
  num: (n, d) => ({ kind: 'num', n, d }),
  op: (op) => ({ kind: 'op', op }),
};

/** Tokeny jednoho členu (koeficient × x nebo konstanta) včetně znaménka. */
function termTokens(coef, isX) {
  const sign = coef.n < 0 ? '-' : '+';
  const mag = { n: Math.abs(coef.n), d: coef.d };
  let body;
  if (!isX) {
    body = [mag.d === 1 ? T.num(mag.n) : T.num(mag.n, mag.d)];
  } else if (mag.n === 1 && mag.d === 1) {
    body = [T.x];
  } else if (mag.d === 1) {
    body = [T.num(mag.n), T.x];
  } else if (mag.n === 1) {
    body = [T.x, T.op('/'), T.num(mag.d)];
  } else {
    body = [T.num(mag.n, mag.d), T.x];
  }
  return { sign, body };
}

/** Tokeny strany rovnice z lineárního tvaru { x, c } (zlomky). */
function sideTokens(side) {
  const terms = [];
  if (side.x.n !== 0) {
    terms.push(termTokens(side.x, true));
  }
  if (side.c.n !== 0) {
    terms.push(termTokens(side.c, false));
  }
  if (terms.length === 0) {
    return [T.num(0)];
  }
  const out = [...terms[0].body];
  if (terms[0].sign === '-') {
    out.unshift(T.op('-'));
  }
  for (const t of terms.slice(1)) {
    out.push(T.op(t.sign), ...t.body);
  }
  return out;
}

/** Tokeny kanonické rovnice úlohy (hráč napíše přesně generátorův tvar). */
function canonicalTokens(exercise) {
  const linearOf = (e) => ({ x: effectiveX(e), c: effectiveC(e) });
  return [
    ...sideTokens(linearOf(exercise.equation.left)),
    T.eq,
    ...sideTokens(linearOf(exercise.equation.right)),
  ];
}

/** Slovní úloha 'odečtu čtvrtinu' ručně - kanonicky (3/4)x = 6. */
function nthPartExercise() {
  return {
    topic: 'wordProblems',
    kind: 'thinkNumber',
    form: 'thinkNthPart',
    text: 'Od celého čísla odečtu jeho čtvrtinu a zůstane mi 6. Které číslo to je?',
    answer: { kind: 'int', value: 8 },
    steps: [],
    equation: { left: expr(3, 4, 0, 1), right: expr(0, 1, 6, 1) },
    hint: 'Čtvrtina čísla x je x/4.',
    distractors: [],
    seed: 1,
    difficulty: 4,
  };
}

function wordMission(overrides = {}) {
  return createMission({
    id: 'endor-1',
    planetId: 'endor',
    crystalColor: 'růžový',
    topic: 'wordProblems',
    exerciseCount: 3,
    startDifficulty: 2,
    seed: 1000,
    ...overrides,
  });
}

// --- Generování a výběr vstupu -----------------------------------------------

test('generateForTopic pokrývá wordProblems a drží obtížnost 2-6', () => {
  const easy = generateForTopic('wordProblems', 42, 1);
  assert.equal(easy.topic, 'wordProblems');
  assert.equal(easy.difficulty, 2);
  const hard = generateForTopic('wordProblems', 42, 9);
  assert.equal(hard.difficulty, 6);
  // Stejný kontrakt outputu jako ostatní generátory (DEC-011).
  assert.ok(easy.equation.left && easy.equation.right);
  assert.ok(Array.isArray(easy.steps));
  assert.ok(typeof easy.text === 'string');
});

test('vstup rovnice podle obtížnosti: dlaždice do 3, volný zápis od 4', () => {
  assert.equal(equationInputKind(2), 'tiles');
  assert.equal(equationInputKind(3), 'tiles');
  assert.equal(equationInputKind(4), 'free');
  assert.equal(equationInputKind(6), 'free');
});

test('diagram početního stroje se odvodí ze struktury úlohy, ne z textu', () => {
  // a·x + b = c: násobí a pak přičte
  const timesPlus = {
    form: 'machineTimesPlus',
    equation: { left: expr(3, 1, 2, 1), right: expr(0, 1, 20, 1) },
  };
  assert.deepEqual(machineOperations(timesPlus), [
    { symbol: '×', value: '3' },
    { symbol: '+', value: '2' },
  ]);

  // a(x + b) = c: přičte a pak násobí
  const plusTimes = {
    form: 'machinePlusTimes',
    equation: { left: factoredExpr(2, 1, 1, 1, 5, 1), right: expr(0, 1, 36, 1) },
  };
  assert.deepEqual(machineOperations(plusTimes), [
    { symbol: '+', value: '5' },
    { symbol: '×', value: '2' },
  ]);

  // (p/q)x + c: zlomkový koeficient
  const frac = {
    form: 'machineFractionTimesPlus',
    equation: { left: expr(3, 4, 2, 1), right: expr(0, 1, 8, 1) },
  };
  assert.deepEqual(machineOperations(frac), [
    { symbol: '×', value: '3/4' },
    { symbol: '+', value: '2' },
  ]);

  // 'myslím si číslo' strojem není - žádný diagram
  const think = generateWordProblem(7, 2);
  assert.equal(think.kind, 'thinkNumber');
  assert.equal(machineOperations(think), null);
});

// --- Relace slovní úlohy: fáze 'napiš rovnici' -------------------------------

test('slovní úloha startuje ve fázi writeEquation (krokový režim vždy zapnutý)', () => {
  const session = createStepSession(generateWordProblem(42, 2));
  assert.equal(session.kind, 'wordProblem');
  assert.equal(session.isActive, true);
  assert.equal(session.phase, 'writeEquation');
  assert.equal(session.equationSession, null);
});

test('uznaná rovnice spustí krokovou relaci nad hráčovou rovnicí (kanonický tvar)', () => {
  const exercise = generateWordProblem(42, 3);
  const session = createStepSession(exercise);
  const result = parseEquation(canonicalTokens(exercise), exercise.equation);
  assert.equal(result.status, 'match');

  const recorded = session.recordEquationResult(result);
  assert.equal(recorded.advanced, true);
  assert.ok(session.equationSession);
  // Kroková relace běží nad rovnicí hráče - text odpovídá kanonickému tvaru.
  const expected = `${formatExpr(exercise.equation.left)} = ${formatExpr(exercise.equation.right)}`;
  assert.equal(session.equationSession.equationText, expected);
});

test('kroková relace startuje z multiTerm, když hráč napsal nesčtené členy (DEC-011/012)', () => {
  const exercise = nthPartExercise();
  const session = createStepSession(exercise);

  // Hráč napíše x - x/4 = 6, zatímco kanonický tvar je (3/4)x = 6.
  const tokens = [T.x, T.op('-'), T.x, T.op('/'), T.num(4), T.eq, T.num(6)];
  const result = parseEquation(tokens, exercise.equation);
  assert.equal(result.status, 'match');
  assert.ok(result.multiTerm);

  session.recordEquationResult(result);
  const inner = session.equationSession;
  // Hráč vidí svou rovnici v původním tvaru, ne sečtenou (žádná tichá kanonizace).
  assert.equal(inner.equationText, 'x - x/4 = 6');
  assert.deepEqual(inner.combinableSides, ['left']);

  // Sečíst členy musí hráč sám - operace combine s dopočtem koeficientu.
  const op = inner.submitOperation({ kind: 'combine', side: 'left' });
  assert.equal(op.status, 'ok');
  assert.equal(op.needsValues, true);
  const value = inner.submitValue({ kind: 'fraction', n: 3, d: 4 });
  assert.equal(value.status, 'committed');
  assert.equal(inner.equationText, '(3/4)x = 6');
});

test('špatná rovnice = chyba equationSetup, nedopsaná = bez chyby', () => {
  const exercise = generateWordProblem(42, 2);
  const session = createStepSession(exercise);

  // Dobře zapsaná rovnice, která nesedí na zadání (jiná konstanta).
  const wrongTokens = [...sideTokens({ x: { n: 1, d: 1 }, c: { n: 1, d: 1 } }), T.eq, T.num(99)];
  const mismatch = parseEquation(wrongTokens, exercise.equation);
  assert.equal(mismatch.status, 'mismatch');
  const recorded = session.recordEquationResult(mismatch);
  assert.equal(recorded.advanced, false);

  let outcome = session.getOutcome();
  assert.equal(outcome.mistakes, 1);
  assert.deepEqual(outcome.errors, { equationSetup: 1 });
  // Relace zůstává ve fázi psaní - hráč opravuje dlaždice/zápis.
  assert.equal(session.phase, 'writeEquation');

  // Nedopsaný zápis je nápověda, ne chyba do statistik.
  const unparseable = parseEquation([T.x, T.op('+')], exercise.equation);
  assert.equal(unparseable.status, 'unparseable');
  session.recordEquationResult(unparseable);
  outcome = session.getOutcome();
  assert.equal(outcome.mistakes, 1);
  assert.deepEqual(outcome.errors, { equationSetup: 1 });
});

// --- Agregace na jeden výsledek za příklad (hvězdy + adaptivita) -------------

test('chyby equationSetup i krokové chyby se agregují na jednu chybu za příklad', () => {
  const mission = wordMission();
  const exercise = mission.currentExercise;
  const session = createStepSession(exercise);

  // Dvě špatně sestavené rovnice.
  const wrongTokens = [...sideTokens({ x: { n: 1, d: 1 }, c: { n: 1, d: 1 } }), T.eq, T.num(99)];
  session.recordEquationResult(parseEquation(wrongTokens, exercise.equation));
  session.recordEquationResult(parseEquation(wrongTokens, exercise.equation));

  // Správná rovnice, pak jedna špatná úprava v krokovém režimu (strategie).
  session.recordEquationResult(parseEquation(canonicalTokens(exercise), exercise.equation));
  const bad = session.equationSession.submitOperation({ kind: 'add', operand: { n: 1, d: 1 } });
  assert.equal(bad.status, 'noProgress');

  const outcome = session.getOutcome();
  assert.equal(outcome.mistakes, 3);
  assert.deepEqual(outcome.errors, { equationSetup: 2, strategy: 1 });

  // Mise z toho udělá JEDNU chybu pro hvězdy i adaptivitu - druhy chyb
  // se sčítají všechny (rodičovský přehled).
  const result = mission.recordStepResult(outcome);
  assert.equal(result.firstTry, false);
  const summary = mission.getSummary();
  assert.equal(summary.mistakes, 1);
  assert.equal(summary.errors.equationSetup, 2);
  assert.equal(summary.errors.strategy, 1);
});

test('bezchybná slovní úloha se počítá jako first try', () => {
  const mission = wordMission();
  const exercise = mission.currentExercise;
  const session = createStepSession(exercise);
  session.recordEquationResult(parseEquation(canonicalTokens(exercise), exercise.equation));

  const result = mission.recordStepResult(session.getOutcome());
  assert.equal(result.firstTry, true);
  assert.equal(mission.getSummary().mistakes, 0);
  assert.equal(mission.getSummary().firstTryCount, 1);
});

test('boss slovní planety: zásah = napsat i vyřešit rovnici, štít padá jen jednou za příklad', () => {
  const boss = createBossMission({
    id: 'endor-boss',
    planetId: 'endor',
    crystalColor: 'růžový',
    topic: 'wordProblems',
    startDifficulty: 2,
    seed: 1000,
  });
  assert.equal(boss.currentExercise.topic, 'wordProblems');

  const session = createStepSession(boss.currentExercise);
  // Hráč se dvakrát splete v rovnici a jednou v kroku - přesto přijde
  // jen o JEDEN štít a bossovi klesne 1 HP (mechanika HP/štítů beze změny).
  const wrongTokens = [...sideTokens({ x: { n: 1, d: 1 }, c: { n: 1, d: 1 } }), T.eq, T.num(99)];
  session.recordEquationResult(parseEquation(wrongTokens, boss.currentExercise.equation));
  session.recordEquationResult(parseEquation(wrongTokens, boss.currentExercise.equation));
  session.recordEquationResult(
    parseEquation(canonicalTokens(boss.currentExercise), boss.currentExercise.equation)
  );
  session.equationSession.submitOperation({ kind: 'add', operand: { n: 1, d: 1 } });

  const hpBefore = boss.hp;
  const result = boss.recordStepResult(session.getOutcome());
  assert.equal(result.hp, hpBefore - 1);
  assert.equal(result.shields, 2); // 3 - 1, ne 3 - 3
  assert.equal(result.missionDone, false);
  const summary = boss.getSummary();
  assert.equal(summary.errors.equationSetup, 2);
  assert.equal(summary.errors.strategy, 1);
});

test('UCV-MISSION-003: vrstvená nápověda ve fázi napiš rovnici - 2 překlad fráze, 3 rovnice', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const exercise = generateWordProblem(seed, difficulty);
      assert.equal(wordEquationHintText(exercise, 1), 'Co je neznámá? Označ si ji x.');
      // Vrstva 2 ukáže překlad fráze ze zadání (writeHint), ne řešitelský
      // hint a nikdy ne celou rovnici.
      const level2 = wordEquationHintText(exercise, 2);
      assert.equal(level2, exercise.writeHint, `${exercise.form}: vrstva 2 má být writeHint`);
      assert.ok(!level2.includes('='), `${exercise.form}: vrstva 2 prozradila rovnici: ${level2}`);
      // Vrstva 3 ukáže správnou rovnici z kanonického tvaru.
      const expected = `Rovnice je: ${formatExpr(exercise.equation.left)} = ${formatExpr(exercise.equation.right)}`;
      assert.equal(wordEquationHintText(exercise, 3), expected, `${exercise.form}: vrstva 3`);
    }
  }
});

test('vrstva 2 nesáhne po řešitelském hintu ani u úlohy bez writeHint', () => {
  // Ručně sestavená úloha (generátor writeHint dodává vždy). Její řešitelský
  // hint prozrazuje celou rovnici - přesně to vrstva 2 ukázat nesmí.
  const exercise = { ...nthPartExercise(), hint: 'Zůstane 3/4 z x - a to je 6.' };
  assert.equal(exercise.writeHint, undefined);

  const level2 = wordEquationHintText(exercise, 2);
  assert.notEqual(level2, exercise.hint);
  assert.ok(!level2.includes('='), `vrstva 2 prozradila rovnici: ${level2}`);
  assert.ok(!level2.includes('3/4'), `vrstva 2 prozradila koeficient: ${level2}`);
  // Vrstva 3 rovnici ukázat smí - tam je od toho.
  assert.equal(wordEquationHintText(exercise, 3), 'Rovnice je: (3/4)x = 6');
});

// --- Přeskočení příkladu si nese druhy chyb (UCV-STATS-001) ------------------

test('summaryWithCarriedErrors sčítá druhy chyb a počet chyb nechává být', () => {
  const summary = { mistakes: 2, stars: 2, errors: { strategy: 1, skipped: 1 } };
  const merged = summaryWithCarriedErrors(summary, { strategy: 2, equationSetup: 3 });
  assert.deepEqual(merged.errors, { strategy: 3, skipped: 1, equationSetup: 3 });
  // Počet chyb (hvězdy) i zbytek souhrnu zůstávají beze změny.
  assert.equal(merged.mistakes, 2);
  assert.equal(merged.stars, 2);
  // Původní souhrn se nemutuje.
  assert.deepEqual(summary.errors, { strategy: 1, skipped: 1 });
  // Bez nasbíraných chyb se souhrn nekopíruje zbytečně.
  assert.equal(summaryWithCarriedErrors(summary, {}), summary);
});

test('přeskočení slovní úlohy nezahodí nasbírané chyby equationSetup', () => {
  const mission = wordMission({ exerciseCount: 1 });
  const exercise = mission.currentExercise;
  const session = createStepSession(exercise);

  // Hráč pětkrát sestaví rovnici, která na zadání nesedí.
  const wrongTokens = [...sideTokens({ x: { n: 1, d: 1 }, c: { n: 1, d: 1 } }), T.eq, T.num(99)];
  for (let i = 0; i < 5; i++) {
    session.recordEquationResult(parseEquation(wrongTokens, exercise.equation));
  }

  // Přesně to, co dělá obrazovka mise při kliknutí na 'Přeskočit'.
  const carried = { ...session.getOutcome().errors };
  const result = mission.skip();
  assert.equal(result.missionDone, true);

  const summary = summaryWithCarriedErrors(mission.getSummary(), carried);
  assert.deepEqual(summary.errors, { equationSetup: 5, skipped: 1 });
  // Rodič vidí, ČEHO se dítě dopouštělo, hvězdy pořád jednu chybu za příklad.
  assert.equal(summary.mistakes, 1);
});

test('přeskočení v krokovém režimu nezahodí krokové chyby', () => {
  const mission = createMission({
    id: 'hoth-1',
    planetId: 'hoth',
    crystalColor: 'modrý',
    topic: 'equations',
    exerciseCount: 1,
    startDifficulty: 2,
    seed: 5,
    stepMode: true,
  });
  const session = createStepSession(mission.currentExercise);
  assert.equal(session.isActive, true);
  const bad = session.submitOperation({ kind: 'add', operand: { n: 1, d: 1 } });
  assert.equal(bad.status, 'noProgress');

  const carried = { ...session.getOutcome().errors };
  mission.skip();
  const summary = summaryWithCarriedErrors(mission.getSummary(), carried);
  assert.deepEqual(summary.errors, { strategy: 1, skipped: 1 });
  assert.equal(summary.mistakes, 1);
});

test('2 chyby v rovnici + 3 chyby v krocích = jedna chyba za příklad, všechny druhy do statistik', () => {
  const mission = wordMission();
  const exercise = mission.currentExercise;
  const session = createStepSession(exercise);

  const wrongTokens = [...sideTokens({ x: { n: 1, d: 1 }, c: { n: 1, d: 1 } }), T.eq, T.num(99)];
  session.recordEquationResult(parseEquation(wrongTokens, exercise.equation));
  session.recordEquationResult(parseEquation(wrongTokens, exercise.equation));
  session.recordEquationResult(parseEquation(canonicalTokens(exercise), exercise.equation));
  for (let i = 0; i < 3; i++) {
    const bad = session.equationSession.submitOperation({ kind: 'add', operand: { n: 1, d: 1 } });
    assert.equal(bad.status, 'noProgress');
  }

  const outcome = session.getOutcome();
  assert.equal(outcome.mistakes, 5);
  assert.deepEqual(outcome.errors, { equationSetup: 2, strategy: 3 });

  const before = mission.progress.current;
  mission.recordStepResult(outcome);
  // Jeden záznam pro adaptivitu = jeden posun na další příklad.
  assert.equal(mission.progress.current, before + 1);

  const summary = mission.getSummary();
  assert.equal(summary.mistakes, 1, 'hvězdy počítají nejvýš jednu chybu za příklad');
  assert.equal(summary.firstTryCount, 0);
  assert.equal(summary.solved, 1);
  assert.deepEqual(summary.errors, { equationSetup: 2, strategy: 3 });
});
