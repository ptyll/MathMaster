import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateWordProblem } from '../js/content/wordProblems.js';
import { evaluateExpr, effectiveX, formatExpr, isFactored } from '../js/content/solver.js';
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
      // Nabídka je vždy ze 4 možností: správná odpověď + právě 3 distraktory.
      assert.equal(p.distractors.length, 3, `špatný počet distraktorů (${p.distractors}): ${p.text}`);
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

test('TDD-MATH-007-K: writeHint - překlad fráze u všech forem, nikdy ne celá rovnice', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      // Každá forma/obtížnost má neprázdnou nápovědu k překladu fráze (UCV-MISSION-003).
      assert.equal(typeof p.writeHint, 'string', `chybí writeHint: ${p.form}`);
      assert.ok(p.writeHint.trim().length > 0, `prázdný writeHint: ${p.form}`);
      // Překlad fráze nikdy neprozradí rovnici - žádné rovnítko (= výsledek)
      // ani řetězec celé rovnice.
      assert.ok(!p.writeHint.includes('='), `writeHint obsahuje '=': ${p.form}: ${p.writeHint}`);
      const equationText = `${formatExpr(p.equation.left)} = ${formatExpr(p.equation.right)}`;
      assert.ok(!p.writeHint.includes(equationText), `writeHint prozradil rovnici: ${p.form}`);
    }
  }
});

test('TDD-MATH-007-L: řešitelský hint machinePlusTimes neprozradí rovnici', () => {
  let seen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const p = generateWordProblem(seed, 4);
    if (p.form !== 'machinePlusTimes') {
      continue;
    }
    seen++;
    // Hint slouží krokové fázi - má zůstat řešitelský, ale bez rovnice
    // (rovnici ve fázi 'napiš rovnici' ukáže až vrstva 3).
    assert.ok(!p.hint.includes('='), `hint prozradil rovnici: ${p.hint}`);
    assert.ok(!p.hint.includes(formatExpr(p.equation.left)), `hint obsahuje levou stranu rovnice: ${p.hint}`);
  }
  assert.ok(seen > 0, 've 300 seedech se má machinePlusTimes objevit');
});

// Formy obtížnosti 2, kde je levá strana rovnice DOSLOVA překlad jediné fráze
// ze zadání ('k němu přičtu 8' -> x + 8). Přesně tenhle překlad spec
// UCV-MISSION-003 po vrstvě 2 chce, takže shoda s formatExpr(left) tu není
// únik. Místo toho se hlídá pevná šablona, ve které se kromě operandu fráze
// nesmí objevit žádné jiné číslo (zpětná reference \1 na tentýž operand).
const PHRASE_IS_WHOLE_LEFT = new Set(['thinkPlus', 'thinkMinus']);
const PHRASE_ONLY_HINT =
  /^Hledané číslo je x\. '(?:K němu přičtu|Od něj odečtu) (\d+)' znamená x [+-] \1\.$/;

/**
 * Je levá strana SESTAVENÁ, tedy spojuje víc než jeden člen? Závorka
 * s činitelem (a(x + b)) nebo x-člen s konstantou (3x + 5) ano; jednočlenná
 * strana ((3/4)x, u poloviny renderovaná jako 'x/2') ne - ta je sama o sobě
 * překladem jedné fráze ('polovinu čísla' je x/2), který vrstva 2 ukázat má.
 */
const isComposedLeft = (e) => isFactored(e) || e.c.n !== 0;

/**
 * Padne hodnota v textu jako samostatné číslo? Číslice ve jmenovateli zlomku
 * (x/2, 3/4) pravou stranou rovnice nejsou, i když se s ní číselně trefí.
 */
function mentionsAsNumber(text, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(?<![\\d/])${escaped}(?![\\d/])`).test(text);
}

test('TDD-MATH-007-M: writeHint překládá frázi, nikdy nesestaví stranu rovnice', () => {
  const seenForms = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      seenForms.add(p.form);
      if (PHRASE_IS_WHOLE_LEFT.has(p.form)) {
        assert.match(p.writeHint, PHRASE_ONLY_HINT, `${p.form}: vrstva 2 má být jen překlad fráze`);
        continue;
      }
      const left = p.equation.left;
      const leftText = formatExpr(left);
      if (isComposedLeft(left)) {
        assert.ok(
          !p.writeHint.includes(leftText),
          `${p.form}: writeHint složil celou levou stranu (${leftText}): ${p.writeHint}`
        );
      }
      if (isFactored(left)) {
        // U a(x + b) je didaktickou obtížností právě složení závorky ze dvou
        // frází - vrstva 2 nesmí prozradit ani její vnitřek.
        const inner = formatExpr({ f: { n: 1, d: 1 }, x: left.x, c: left.c });
        assert.ok(
          !p.writeHint.includes(inner),
          `${p.form}: writeHint složil vnitřek závorky (${inner}): ${p.writeHint}`
        );
      }
      // Pravá strana je výsledek ze zadání - vrstva 2 ho nedopisuje, jinak má
      // hráč po překladu fráze rovnou celou rovnici.
      const rightText = formatExpr(p.equation.right);
      assert.ok(
        !mentionsAsNumber(p.writeHint, rightText),
        `${p.form}: writeHint prozradil pravou stranu (${rightText}): ${p.writeHint}`
      );
    }
  }
  assert.equal(seenForms.size, 9, `nepokryté formy: ${[...seenForms].sort()}`);
});

test('TDD-MATH-007-N: distraktory jsou vždy tři i u nejmenší odpovědi', () => {
  // Reprodukce vady: u odpovědi 1 padnou hodnota−1 i hodnota−delta pod nulu
  // a hodnota+2 se zdvojí s hodnota+delta - dřív zbyly jen dva distraktory.
  const smallest = generateWordProblem(294, 6);
  assert.equal(smallest.answer.value, 1, 'seed 294 v obtížnosti 6 má mít odpověď 1');
  assert.equal(smallest.distractors.length, 3, `${smallest.text}: ${smallest.distractors}`);

  for (let seed = 1; seed <= 1200; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      if (p.answer.kind !== 'int') {
        continue;
      }
      assert.equal(p.distractors.length, 3, `${p.text}: ${p.distractors}`);
      assert.equal(new Set(p.distractors).size, 3, `duplicitní distraktory: ${p.text}`);
      assert.ok(
        p.distractors.every((d) => Number.isInteger(d) && d > 0 && d !== p.answer.value),
        `distraktory musí být kladné celé a různé od odpovědi: ${p.text}: ${p.distractors}`
      );
    }
  }
});

test('TDD-MATH-007-O: nečíselná difficulty spadne na nejlehčí, na výstupu je vždy 2-6', () => {
  // NaN dřív proklouzlo clampem (Math.trunc(NaN) = NaN), spadlo do větve
  // default (nejtěžší obtížnost) a šířilo se dál jako difficulty: NaN.
  for (const bad of [NaN, 'abc', {}, [], true, null, undefined]) {
    assert.deepEqual(
      generateWordProblem(7, bad),
      generateWordProblem(7, 2),
      `nečíselná obtížnost ${String(bad)} má dát nejlehčí úlohu`
    );
  }
  // Číselné okraje se pořád přiřazují k nejbližšímu kraji.
  for (const [given, expected] of [
    [0, 2],
    [1, 2],
    [-3, 2],
    [2.9, 2],
    [7, 6],
    [99, 6],
    [Infinity, 6],
    [-Infinity, 2],
    ['4', 4],
  ]) {
    assert.deepEqual(
      generateWordProblem(7, given),
      generateWordProblem(7, expected),
      `obtížnost ${String(given)} -> ${expected}`
    );
  }
  // Pole difficulty jde do uloženého stavu i adaptivity - musí být číslo 2-6.
  for (const difficulty of [NaN, 'abc', null, 0, 99, Infinity, 4]) {
    const d = generateWordProblem(11, difficulty).difficulty;
    assert.ok(Number.isInteger(d) && d >= 2 && d <= 6, `difficulty na výstupu je ${d}`);
  }
});
