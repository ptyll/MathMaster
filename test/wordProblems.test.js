import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateWordProblem } from '../js/content/wordProblems.js';
import { evaluateExpr, effectiveX } from '../js/content/solver.js';
import { fractionsEqual, isSimplified, isWhole, makeFraction } from '../js/content/fractions.js';

function answerAsFraction(answer) {
  return answer.kind === 'int' ? makeFraction(answer.value) : makeFraction(answer.n, answer.d);
}

/** Ověří, že text odpovídá předem napsané šabloně dané formy. */
const FORM_PATTERNS = {
  thinkPlus: /^Myslím si číslo\. Když k němu přičtu \d+, dostanu \d+\. Které číslo si myslím\?$/,
  thinkMinus: /^Myslím si číslo\. Když od něj odečtu \d+, dostanu \d+\. Které číslo si myslím\?$/,
  thinkTimesPlus: /^Myslím si číslo\. Když ho vynásobím \d+ a přičtu \d+, dostanu \d+\. Které číslo si myslím\?$/,
  machineTimesPlus: /^Početní stroj vstup vynásobí \d+ a pak přičte \d+\. Který vstup dá výstup \d+\?$/,
  machinePlusTimes: /^Početní stroj ke vstupu přičte \d+ a výsledek vynásobí \d+\. Který vstup dá výstup \d+\?$/,
  thinkNthPart: /^Od celého čísla odečtu jeho (polovinu|třetinu|čtvrtinu) a zůstane mi \d+\. Které číslo to je\?$/,
  thinkTwoParts: /^Od celého čísla odečtu jeho (polovinu|třetinu|čtvrtinu) a ještě jeho (polovinu|třetinu|čtvrtinu)\. Zůstane mi \d+\. Které číslo to je\?$/,
  thinkFractionPlus: /^Myslím si číslo\. Když jeho (polovinu|třetinu|čtvrtinu|pětinu|šestinu) zvětším o \d+, dostanu \d+\. Které číslo si myslím\?$/,
  machineFractionTimesPlus: /^Početní stroj vstup vynásobí \d+\/\d+ a pak přičte \d+\. Který vstup dá výstup \d+(\/\d+)?\?$/,
};

test('TDD-MATH-007-A: stejný seed + difficulty = stejná úloha (determinismus)', () => {
  for (const difficulty of [2, 3, 4, 5, 6]) {
    const a = generateWordProblem(42, difficulty);
    const b = generateWordProblem(42, difficulty);
    assert.deepEqual(a, b);
    assert.notEqual(
      generateWordProblem(42, difficulty).text,
      generateWordProblem(43, difficulty).text,
      `jiný seed má dát jinou úlohu (difficulty ${difficulty})`
    );
  }
});

test('TDD-MATH-007-B: struktura výstupu - topic, equation, kroky, hint, český šablonový text', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      assert.equal(p.topic, 'wordProblems');
      assert.ok(['thinkNumber', 'machine'].includes(p.kind), p.form);
      assert.ok(FORM_PATTERNS[p.form], `neznámá forma: ${p.form}`);
      assert.match(p.text, FORM_PATTERNS[p.form], `text nesedí na šablonu formy ${p.form}: ${p.text}`);
      assert.ok(p.hint.length > 0);
      assert.equal(p.seed, seed);
      assert.equal(p.difficulty, difficulty);
      // Kanonický tvar rovnice pro validaci i krokový režim.
      assert.ok(p.equation && p.equation.left && p.equation.right, 'chybí equation {left, right}');
      assert.notEqual(effectiveX(p.equation.left).n, 0, `levá strana musí obsahovat x: ${p.text}`);
      // Krokové řešení je vždy přítomné (krokový režim se nikdy nevypíná).
      assert.ok(Array.isArray(p.steps) && p.steps.length >= 2, `málo kroků: ${p.text}`);
      assert.equal(p.steps[p.steps.length - 1].operation, 'Výsledek');
    }
  }
});

test('TDD-MATH-007-C: řešení sedí dosazením do kanonické rovnice a odpovídá poslednímu kroku', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      const x = answerAsFraction(p.answer);
      // Dosazení do levé strany musí dát pravou (pravá strana je vždy konstanta).
      const leftValue = evaluateExpr(p.equation.left, x);
      const rightValue = evaluateExpr(p.equation.right, x);
      assert.ok(
        fractionsEqual(leftValue, rightValue),
        `${p.text}: L(${x.n}/${x.d}) = ${leftValue.n}/${leftValue.d} != P = ${rightValue.n}/${rightValue.d}`
      );
      // Poslední krok hlásí stejný výsledek jako odpověď.
      const last = p.steps[p.steps.length - 1];
      assert.equal(
        last.rightSide,
        String(p.answer.kind === 'int' ? p.answer.value : `${p.answer.n}/${p.answer.d}`),
        `${p.text}: výsledek v krocích (${last.rightSide}) != odpověď`
      );
    }
  }
});

test('TDD-MATH-007-D: řešení je vždy kladné; zlomek jen v základním tvaru', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      if (p.answer.kind === 'int') {
        assert.ok(p.answer.value > 0, `x musí být kladné: ${p.text}`);
      } else {
        assert.ok(p.answer.n > 0 && p.answer.d > 1, `zlomek musí být kladný: ${p.text}`);
        assert.ok(isSimplified(p.answer), `${p.text} -> nekrácený výsledek ${p.answer.n}/${p.answer.d}`);
        // Zlomková řešení se smí objevit jen v obtížnosti 6.
        assert.equal(difficulty, 6, `zlomkové řešení mimo obtížnost 6: ${p.text}`);
      }
    }
  }
});

test('TDD-MATH-007-E: obtížnosti 2-5 mají vždy celočíselné řešení, 6 umí i zlomek', () => {
  let sawFraction = false;
  let sawIntAt6 = false;
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [2, 3, 4, 5]) {
      assert.equal(generateWordProblem(seed, difficulty).answer.kind, 'int', `difficulty ${difficulty}, seed ${seed}`);
    }
    const at6 = generateWordProblem(seed, 6);
    if (at6.answer.kind === 'fraction') {
      sawFraction = true;
    } else {
      sawIntAt6 = true;
    }
  }
  assert.ok(sawFraction, 'obtížnost 6 má občas vygenerovat zlomkové řešení');
  assert.ok(sawIntAt6, 'obtížnost 6 má občas vygenerovat i celočíselné řešení');
});

test('TDD-MATH-007-F: "odečtu čtvrtinu" znamená čtvrtinu neznámé (x − x/4), ne konstanty', () => {
  let sawQuarter = false;
  for (let seed = 1; seed <= 300; seed++) {
    const p = generateWordProblem(seed, 4);
    if (p.form !== 'thinkNthPart') {
      continue;
    }
    // Levá strana je (n-1)/n * x bez konstanty - čtvrtina se odečítá z x.
    const coef = effectiveX(p.equation.left);
    assert.equal(p.equation.left.c.n, 0, p.text);
    if (p.text.includes('čtvrtinu')) {
      sawQuarter = true;
      assert.equal(coef.n, 3, p.text);
      assert.equal(coef.d, 4, p.text);
    }
    if (p.text.includes('polovinu')) {
      assert.equal(coef.n, 1, p.text);
      assert.equal(coef.d, 2, p.text);
    }
    if (p.text.includes('třetinu')) {
      assert.equal(coef.n, 2, p.text);
      assert.equal(coef.d, 3, p.text);
    }
  }
  assert.ok(sawQuarter, 'v obtížnosti 4 se má objevit i varianta s čtvrtinou');
});

test('TDD-MATH-007-G: distraktory u celočíselných odpovědí - kladné, bez správné odpovědi', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      if (p.answer.kind !== 'int') {
        assert.deepEqual(p.distractors, [], `zlomková odpověď nemá distraktory: ${p.text}`);
        continue;
      }
      assert.ok(p.distractors.length >= 2, `málo distraktorů: ${p.text}`);
      assert.ok(!p.distractors.includes(p.answer.value), `distraktor = odpověď: ${p.text}`);
      assert.ok(p.distractors.every((d) => d > 0 && Number.isInteger(d)), `distraktory musí být kladné celé: ${p.text}`);
      assert.equal(new Set(p.distractors).size, p.distractors.length, `duplicitní distraktory: ${p.text}`);
    }
  }
});

test('TDD-MATH-007-H: každá obtížnost generuje všechny své formy a správný typ rovnice', () => {
  const seen = { 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() };
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      seen[difficulty].add(generateWordProblem(seed, difficulty).form);
    }
  }
  assert.deepEqual([...seen[2]].sort(), ['thinkMinus', 'thinkPlus']);
  assert.deepEqual([...seen[3]].sort(), ['machineTimesPlus', 'thinkTimesPlus']);
  assert.deepEqual([...seen[4]].sort(), ['machinePlusTimes', 'thinkNthPart']);
  assert.deepEqual([...seen[5]].sort(), ['thinkTwoParts']);
  assert.deepEqual([...seen[6]].sort(), ['machineFractionTimesPlus', 'thinkFractionPlus']);

  // a(x + b) = c má v rovnici součinový tvar (závorku), ne roznásobený tvar.
  for (let seed = 1; seed <= 500; seed++) {
    const p = generateWordProblem(seed, 4);
    if (p.form === 'machinePlusTimes') {
      const f = p.equation.left.f;
      assert.ok(f.n !== 1 || f.d !== 1, `očekávám závorku a(x + b): ${p.text}`);
      return;
    }
  }
  assert.fail('ve 500 seedech se neobjevila forma machinePlusTimes');
});

test('TDD-MATH-007-I: difficulty mimo rozsah 2-6 se přiřadí k nejbližšímu kraji', () => {
  assert.deepEqual(generateWordProblem(7, 1), generateWordProblem(7, 2));
  assert.deepEqual(generateWordProblem(7, 9), generateWordProblem(7, 6));
  assert.deepEqual(generateWordProblem(7), generateWordProblem(7, 2));
});

test('TDD-MATH-007-J: krokový režim začíná vždy z kanonické rovnice úlohy', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      const first = p.steps[0];
      // První krok nese stav po první úpravě; výchozí stav krokového režimu
      // je p.equation a obojí musí mít stejné řešení.
      const startValue = evaluateExpr(p.equation.left, answerAsFraction(p.answer));
      const stepValue = evaluateExpr(first.leftExpr, answerAsFraction(p.answer));
      assert.ok(
        fractionsEqual(startValue, evaluateExpr(p.equation.right, answerAsFraction(p.answer))) &&
          fractionsEqual(stepValue, evaluateExpr(first.rightExpr, answerAsFraction(p.answer))),
        `${p.text}: kroky neodpovídají rovnici`
      );
      // Žádná zlomková odpověď mimo difficulty 6 je ověřená jinde; zde jen
      // že u fraction answerů kroky končí zlomkem v základním tvaru.
      if (p.answer.kind === 'fraction') {
        assert.ok(isSimplified({ n: p.answer.n, d: p.answer.d }), p.text);
        assert.ok(!isWhole({ n: p.answer.n, d: p.answer.d }), p.text);
      }
    }
  }
});
