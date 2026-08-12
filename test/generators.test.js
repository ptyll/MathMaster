import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateSimpleEquation, generateLinearEquation } from '../js/content/equations.js';
import { generateFractionEquation } from '../js/content/fractionEquations.js';
import { generateFractionExercise } from '../js/content/fractionExercises.js';
import { expr, evaluateExpr, formatExpr } from '../js/content/solver.js';
import { fractionsEqual, isSimplified, makeFraction } from '../js/content/fractions.js';

function answerAsFraction(answer) {
  return answer.kind === 'int' ? makeFraction(answer.value) : makeFraction(answer.n, answer.d);
}

test('TDD-MATH-001-A: stejný seed = stejná sada příkladů', () => {
  const a = generateSimpleEquation(42, 1);
  const b = generateSimpleEquation(42, 1);
  assert.deepEqual(a, b);
  assert.notEqual(generateSimpleEquation(42, 1).text, generateSimpleEquation(43, 1).text);
});

test('TDD-MATH-001-B: všechny jednoduché rovnice mají validní kladné celé řešení <= 100', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateSimpleEquation(seed, difficulty);
      assert.equal(ex.answer.kind, 'int', ex.text);
      assert.ok(ex.answer.value > 0, `x musí být kladné: ${ex.text}`);
      assert.ok(ex.answer.value <= 100, `max 100: ${ex.text}`);
      assert.ok(ex.steps.length >= 1);
      assert.ok(ex.hint.length > 0);
      assert.ok(ex.distractors.length >= 2, `málo distraktorů: ${ex.text}`);
      assert.ok(!ex.distractors.includes(ex.answer.value));
      assert.ok(ex.distractors.every((d) => d > 0), `distraktory musí být kladné: ${ex.text}`);
    }
  }
});

test('TDD-MATH-002-A: ax + b = c má vždy celočíselné řešení', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateLinearEquation(seed, difficulty);
      assert.equal(ex.answer.kind, 'int', `${ex.text} (difficulty ${difficulty})`);
    }
  }
});

test('lineární rovnice difficulty 4: řešení sedí dosazením, může být záporné', () => {
  let sawNegative = false;
  for (let seed = 1; seed <= 300; seed++) {
    const ex = generateLinearEquation(seed, 4);
    assert.equal(ex.answer.kind, 'int', ex.text);
    if (ex.answer.value < 0) {
      sawNegative = true;
    }
  }
  assert.ok(sawNegative, 've vyšší obtížnosti se má objevit i záporné x');
});

test('TDD-MATH-003-A: sčítání zlomků dává vždy základní tvar a součet sedí', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    for (const difficulty of [1, 2, 3]) {
      for (const kind of ['add', 'subtract']) {
        const ex = generateFractionExercise(seed, kind, difficulty);
        assert.equal(ex.answer.kind, 'fraction');
        assert.ok(isSimplified(ex.answer), `${ex.text} -> ${ex.answer.n}/${ex.answer.d}`);
        assert.ok(ex.answer.n >= 0, `odečítání nesmí dát záporný výsledek: ${ex.text}`);
      }
    }
  }
});

test('úlohy se zlomky: všechny druhy mají kroky, nápovědu a správnou odpověď', () => {
  const kinds = ['compare', 'add', 'subtract', 'simplify', 'expand', 'equivalent'];
  for (let seed = 1; seed <= 100; seed++) {
    for (const kind of kinds) {
      const ex = generateFractionExercise(seed, kind, 2);
      assert.ok(ex.steps.length >= 1, kind);
      assert.ok(ex.hint.length > 0, kind);
      assert.ok(ex.text.length > 0, kind);
      if (kind === 'simplify') {
        assert.ok(isSimplified(ex.answer));
      }
      if (kind === 'compare') {
        assert.ok(ex.answer.kind === 'choice');
        assert.ok(['left', 'right'].includes(ex.answer.value));
      }
      if (kind === 'equivalent') {
        assert.equal(ex.answer.kind, 'int');
      }
    }
  }
});

test('TDD-MATH-004-A: rovnice se zlomky - řešení vždy sedí dosazením', () => {
  for (let seed = 1; seed <= 500; seed++) {
    for (const difficulty of [1, 2, 3]) {
      const ex = generateFractionEquation(seed, difficulty);
      const x = answerAsFraction(ex.answer);
      // Rekonstruujeme levou a pravou stranu z textu nejde - ověříme přes kroky:
      // poslední krok musí hlásit správný výsledek.
      const last = ex.steps[ex.steps.length - 1];
      assert.equal(last.operation, 'Výsledek');
      assert.ok(
        last.rightSide === String(ex.answer.kind === 'int' ? ex.answer.value : `${ex.answer.n}/${ex.answer.d}`),
        `${ex.text}: výsledek v krocích (${last.rightSide}) != odpověď`
      );
      if (ex.answer.kind === 'fraction') {
        assert.ok(isSimplified(ex.answer), `${ex.text} -> nekrácený výsledek`);
      }
    }
  }
});

test('rovnice se zlomky difficulty 1: x/a = b má celé řešení', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const ex = generateFractionEquation(seed, 1);
    assert.equal(ex.answer.kind, 'int', ex.text);
    assert.match(ex.text, /^x\/\d+ = \d+$/);
  }
});

/* ------------------------------------------------------------------------ */
/* Vyšší obtížnost = JINÝ a TĚŽŠÍ příklad (UCN-MATH-003, stupně 4-6)         */
/* ------------------------------------------------------------------------ */

/*
 * Kritérium těchhle testů: znak nového stupně se měří VÝSKYTEM přes stovky
 * seedů a porovnává se se stupni 1-3 - ne jedním ručně vybraným příkladem.
 * Právě tudy se totiž do návrhu dostala chyba: '3/4 + 5/6 = 19/12' vypadá jako
 * novinka a přitom je to skoro polovina příkladů obtížnosti 3. Nový stupeň
 * obstojí jen tehdy, když je jeho znak na 1-3 vzácný nebo nulový a na novém
 * stupni jistý.
 */

const SEEDS = 400;

/** Podíl seedů, u kterých má vygenerovaný příklad daný znak. */
function rate(generate, marker) {
  let hits = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    if (marker(generate(seed))) {
      hits++;
    }
  }
  return hits / SEEDS;
}

const fractionRate = (kind, difficulty, marker) =>
  rate((seed) => generateFractionExercise(seed, kind, difficulty), marker);
const equationRate = (difficulty, marker) =>
  rate((seed) => generateFractionEquation(seed, difficulty), marker);

const hasWholeOperand = (ex) => ex.operands.some((o) => o.d === 1);
const hasImproperOperand = (ex) => ex.operands.some((o) => o.n > o.d);
const hasReducingStep = (ex) => ex.steps.some((s) => s.operation.startsWith('Zkrať'));
/** Krátící/rozšiřující číslo úlohy (kolikrát se zlomek zvětšil nebo zmenšil). */
const factorOf = (ex) => {
  const [, n, d] = /(\d+)\/(\d+)/.exec(ex.text);
  const target = /\?\/(\d+)/.exec(ex.text) ?? /jmenovatele (\d+)/.exec(ex.text);
  return target ? Number(target[1]) / Number(d) : Number(d) / ex.answer.d;
};
/** Vzdálenost porovnávaných zlomků jako 1/N (větší N = blíž u sebe). */
const closeness = (ex) => {
  const [x, y] = ex.answer.options.map((text) => {
    const [n, d] = text.split('/').map(Number);
    return { n, d: d ?? 1 };
  });
  const distance = Math.abs(x.n * y.d - y.n * x.d);
  return distance === 0 ? Infinity : (x.d * y.d) / distance;
};

test('UCN-MATH-003: sčítání a odčítání má na 4-6 znak, který na 1-3 nenastane', () => {
  for (const kind of ['add', 'subtract']) {
    for (const easy of [1, 2, 3]) {
      assert.equal(fractionRate(kind, easy, hasWholeOperand), 0, `${kind} d${easy}: celý operand`);
      assert.equal(fractionRate(kind, easy, hasImproperOperand), 0, `${kind} d${easy}: nepravý operand`);
    }
    // 4 = celé číslo se zlomkem, 5 = nepravý operand, 6 = nepravý operand i krácení
    assert.equal(fractionRate(kind, 4, hasWholeOperand), 1, `${kind} d4`);
    assert.equal(fractionRate(kind, 5, hasImproperOperand), 1, `${kind} d5`);
    assert.equal(fractionRate(kind, 6, hasImproperOperand), 1, `${kind} d6`);
    assert.equal(fractionRate(kind, 6, hasReducingStep), 1, `${kind} d6: krok Zkrať`);
    // Krok 'Zkrať' na trojce naopak ubývá - na šestce je jistota, ne náhoda.
    assert.ok(fractionRate(kind, 3, hasReducingStep) < 0.5, `${kind} d3: krácení není norma`);
  }
});

test('UCN-MATH-003: krácení, rozšiřování a porovnávání rostou s obtížností', () => {
  for (const easy of [1, 2, 3]) {
    assert.equal(fractionRate('simplify', easy, (ex) => factorOf(ex) >= 7), 0, `simplify d${easy}`);
    assert.equal(fractionRate('equivalent', easy, (ex) => factorOf(ex) >= 7), 0, `equivalent d${easy}`);
    assert.equal(fractionRate('expand', easy, (ex) => targetOf(ex) > 24), 0, `expand d${easy}`);
    assert.ok(fractionRate('compare', easy, (ex) => closeness(ex) >= 24) < 0.25, `compare d${easy}`);
  }
  for (const hard of [4, 5, 6]) {
    assert.equal(fractionRate('simplify', hard, (ex) => factorOf(ex) >= 7), 1, `simplify d${hard}`);
    assert.equal(fractionRate('equivalent', hard, (ex) => factorOf(ex) >= 7), 1, `equivalent d${hard}`);
    assert.equal(fractionRate('expand', hard, (ex) => targetOf(ex) > 24), 1, `expand d${hard}`);
    assert.equal(fractionRate('compare', hard, (ex) => closeness(ex) >= 24), 1, `compare d${hard}`);
  }
  // Stupně se liší i mezi sebou, ne jen proti trojce.
  assert.ok(fractionRate('simplify', 6, (ex) => factorOf(ex) >= 11) === 1);
  assert.ok(fractionRate('simplify', 4, (ex) => factorOf(ex) >= 11) === 0);
  assert.ok(fractionRate('compare', 6, (ex) => closeness(ex) >= 48) === 1);
  assert.ok(fractionRate('compare', 4, (ex) => closeness(ex) >= 48) < 1);
});

/** Cílový jmenovatel u rozšiřování. */
function targetOf(ex) {
  return Number(/jmenovatele (\d+)/.exec(ex.text)[1]);
}

test('UCN-MATH-004: rovnice 4-6 přidávají strukturu, ne větší čísla', () => {
  const twoXTerms = (ex) => Array.isArray(ex.equation.left.terms) && ex.equation.left.terms.length >= 2;
  const xOnBothSides = (ex) => ex.equation.right.x.n !== 0;
  const nonUnitCoefficient = (ex) => ex.equation.left.x.d > 1 && ex.equation.left.x.n > 1;

  for (const easy of [1, 2, 3]) {
    assert.equal(equationRate(easy, twoXTerms), 0, `d${easy}: dva x-členy`);
    assert.equal(equationRate(easy, xOnBothSides), 0, `d${easy}: x na obou stranách`);
  }
  assert.equal(equationRate(4, twoXTerms), 1, 'd4: dva x-členy');
  assert.equal(equationRate(4, xOnBothSides), 0, 'd4: x jen vlevo');
  assert.equal(equationRate(5, xOnBothSides), 1, 'd5: x na obou stranách');
  assert.equal(equationRate(6, xOnBothSides), 1, 'd6: x na obou stranách');
  // Šestka se od pětky liší nejednotkovým koeficientem a zlomkovým x.
  assert.equal(equationRate(5, nonUnitCoefficient), 0, 'd5: jednotkové koeficienty');
  assert.equal(equationRate(6, nonUnitCoefficient), 1, 'd6: nejednotkový koeficient');
  assert.ok(equationRate(6, (ex) => ex.answer.kind === 'fraction') > 0.2, 'd6: x smí vyjít zlomek');
});

test('UCN-MATH-003/004: stupně 4-6 drží pěkná řešení a jsou deterministické', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const difficulty of [4, 5, 6]) {
      for (const kind of ['add', 'subtract']) {
        const ex = generateFractionExercise(seed, kind, difficulty);
        assert.ok(ex.answer.n > 0, `${kind} d${difficulty} seed ${seed}: nekladný výsledek ${ex.text}`);
        assert.ok(isSimplified(ex.answer), `${kind} d${difficulty}: nezkrácený výsledek ${ex.text}`);
        assert.ok(ex.steps.length >= 1 && ex.hint.length > 0, `${kind} d${difficulty}: chybí kroky/nápověda`);
        assert.deepEqual(generateFractionExercise(seed, kind, difficulty), ex, 'stejný seed, jiný příklad');
      }
      const eq = generateFractionEquation(seed, difficulty);
      const x = answerAsFraction(eq.answer);
      assert.ok(x.n > 0, `rovnice d${difficulty} seed ${seed}: nekladné x v ${eq.text}`);
      assert.ok(isSimplified(x), `rovnice d${difficulty}: nezkrácené x v ${eq.text}`);
      assert.equal(eq.steps[eq.steps.length - 1].operation, 'Výsledek', `rovnice d${difficulty}: chybí výsledek`);
      assert.deepEqual(generateFractionEquation(seed, difficulty), eq, 'stejný seed, jiná rovnice');
    }
  }
});

test('UCN-MATH-003: každý nový stupeň dítěti novou myšlenku POJMENUJE', () => {
  // Přejímací kritérium fáze: nestačí, aby se nová dovednost po dítěti chtěla -
  // musí být i místo, kde si ji přečte. Vázat vysvětlení na VÝSLEDEK nestačí:
  // 4/3 - 1/2 = 5/6 má nepravý operand, ale výsledek pod celkem, takže by
  // odčítání na stupni 5 zůstalo beze slova navíc oproti trojce.
  for (const kind of ['add', 'subtract']) {
    assert.equal(
      fractionRate(kind, 4, (ex) => /Celé číslo se dá napsat jako zlomek/.test(ex.hint)),
      1,
      `${kind} d4: nápověda nejmenuje celé číslo`
    );
    for (const difficulty of [5, 6]) {
      assert.equal(
        fractionRate(kind, difficulty, (ex) => /je víc než celek/.test(ex.hint)),
        1,
        `${kind} d${difficulty}: nápověda nejmenuje nepravý operand`
      );
    }
    // Na stupních 1-3 se text nápovědy nesmí pohnout.
    for (const easy of [1, 2, 3]) {
      assert.equal(
        fractionRate(kind, easy, (ex) => /je víc než celek|Celé číslo se dá napsat/.test(ex.hint)),
        0,
        `${kind} d${easy}: nová věta se objevila i na starém stupni`
      );
    }
  }
});

test('UCN-MATH-003: nápověda u krácení neradí čísla, která na daném stupni nemohou vyjít', () => {
  // HARDER_FACTOR je {4:[7,8], 5:[9,10], 6:[11,12]}, takže od stupně 4 není
  // dělitel NIKDY 2, 3 ani 5: rada "Zkus 2, 3, 5" tam nemůže platit ani
  // jednou (0,0 % na d4, d5 i d6 proti 58,8 % na d1-d3). Dítě, kterému
  // "Zkrať 77/88" nejde, po ní rozumně usoudí, že to neumí - je to horší než
  // mlčení. Na stupních 1-3 naopak platí a nesmí se pohnout.
  const smallTable = (ex) => ex.hint.includes('2, 3, 5');
  for (const difficulty of [4, 5, 6]) {
    assert.equal(
      fractionRate('simplify', difficulty, smallTable),
      0,
      `simplify d${difficulty}: nápověda radí malou násobilku, kde dělitel je 7-12`
    );
  }
  for (const easy of [1, 2, 3]) {
    assert.equal(
      fractionRate('simplify', easy, smallTable),
      1,
      `simplify d${easy}: nápověda se změnila i na starém stupni`
    );
  }
});

test('věta o celku se skloňuje česky (1 celek, 2-4 celky, 5+ celků)', async () => {
  const { createStepSession } = await import('../js/engine/stepSession.js');
  const solve = (whole, fraction) => {
    const session = createStepSession({
      topic: 'fractions',
      kind: 'add',
      operands: [makeFraction(whole), makeFraction(1, fraction)],
    });
    session.submitValue({ kind: 'int', value: fraction });
    session.submitValue({ kind: 'int', value: whole * fraction });
    return session.submitValue({ kind: 'int', value: whole * fraction + 1 }).note;
  };
  assert.match(solve(1, 5), /jeden celek/);
  assert.match(solve(3, 5), /3 celky/);
  assert.match(solve(5, 5), /5 celků/);
  assert.match(solve(7, 4), /7 celků/);
});

test('UCN-MATH-003: nové stupně nesmí zdegenerovat na pár tvarů', () => {
  // Druhé měřítko vedle 'jiný a těžší': PESTROST. Bez něj projde i stupeň,
  // který je sice těžší, ale pořád dokola stejný - a to je právě ta vada,
  // proti které celá fáze vznikla ('kamino-1 až boss dávají při stejném seedu
  // doslova identické příklady'), jen jinou cestou. Stalo se to v této fázi
  // DVAKRÁT: losování s odmítáním vracelo v 27 % zálohu (add/subtract d6) a
  // úzký prostor dával 22 zadání, z toho třetinu ve tvaru n/2n (simplify).
  // Proto test běží přes VŠECH ŠEST druhů, ne jen přes ty, kde se to našlo.
  //
  // Naměřeno na 800 seedech (nejhorší stupeň z 4-6): add/subtract 72,
  // simplify 60, expand 56, equivalent 118, compare 64 různých zadání;
  // nejčastější zadání nikde nepřesáhne 6,0 %. Prahy jsou pod tím s rezervou.
  const SEEDS_FOR_VARIETY = 800;
  // Práh je nižší, než by se čekalo, a má to fyzický důvod: co skončí ve
  // zlomkovém pásu, nesmí mít jmenovatel nad 72 (nad 100 se pás nevykreslí
  // vůbec), a znak stupně prostor zužuje taky. Kolik tvarů existuje, je tedy
  // dané; hlídá se hlavně to, aby žádný netrčel. Naměřeno: nejhorší je
  // compare d6 s 32 tvary, nejčastější zadání nikde nepřesáhne 4,1 %.
  const MIN_DISTINCT = 25;
  const MAX_SHARE = 0.08;
  for (const kind of ['add', 'subtract', 'simplify', 'expand', 'equivalent', 'compare']) {
    for (const difficulty of [4, 5, 6]) {
      const counts = new Map();
      for (let seed = 1; seed <= SEEDS_FOR_VARIETY; seed++) {
        const { text } = generateFractionExercise(seed, kind, difficulty);
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
      const commonest = Math.max(...counts.values()) / SEEDS_FOR_VARIETY;
      assert.ok(
        counts.size >= MIN_DISTINCT,
        `${kind} d${difficulty}: jen ${counts.size} různých zadání (čekám aspoň ${MIN_DISTINCT})`
      );
      assert.ok(
        commonest <= MAX_SHARE,
        `${kind} d${difficulty}: nejčastější zadání má ${(100 * commonest).toFixed(1)} % - stupeň degeneruje na pár tvarů`
      );
    }
  }
});

test('nejtěžší krácení není "zkrať na polovinu"', () => {
  // Tvar n/2n je nejlehčí možné krácení. Na stupních 4-6 tvořil třetinu zadání,
  // takže nejtěžší stupeň dával nejsnazší příklad svého druhu.
  for (const difficulty of [4, 5, 6]) {
    const halves = rate(
      (seed) => generateFractionExercise(seed, 'simplify', difficulty),
      (ex) => {
        const [, n, d] = /(\d+)\/(\d+)/.exec(ex.text);
        return Number(d) === 2 * Number(n);
      }
    );
    assert.equal(halves, 0, `simplify d${difficulty}: tvar n/2n se objevuje v ${100 * halves} %`);
  }
});

test('prostor základních zlomků se s obtížností NEZUŽUJE', () => {
  // Přímo za příčinu útesu u simplify: vyšší stupeň tam losoval z jmenovatelů
  // do 6, kdežto nižší z 12 - vyšší stupeň měl tedy MENŠÍ výběr než nižší.
  // Obtížnost nesou krátící čísla (7-12), pásmo jmenovatelů k ní nemá co
  // přidávat. Prostor se smí lišit jen o to, co si vynucuje sám znak stupně
  // (simplify vylučuje jmenovatel 2, expand potřebuje aspoň 4), proto 90 %.
  // `equivalent` do testu NEPATŘÍ a není to úlitba: jeho znak stupně je
  // násobitel 7-12 a cíl zároveň nesmí přerůst strop zlomkového pásu (72),
  // takže jmenovatel základu je nejvýš 72/7 = 10. Pásmo tam tedy není volbou,
  // ale důsledkem dvou tvrdých podmínek - měřitelný strop je 31 základů a
  // víc jich existovat nemůže. U simplify a expand volbou JE, proto se hlídá.
  const baseOf = {
    simplify: (ex) => `${ex.answer.n}/${ex.answer.d}`,
    expand: (ex) => /zlomek (\d+\/\d+)/.exec(ex.text)[1],
  };
  for (const [kind, base] of Object.entries(baseOf)) {
    const bases = (difficulty) => {
      const seen = new Set();
      for (let seed = 1; seed <= 1500; seed++) {
        seen.add(base(generateFractionExercise(seed, kind, difficulty)));
      }
      return seen.size;
    };
    const reference = bases(3);
    for (const difficulty of [4, 5, 6]) {
      assert.ok(
        bases(difficulty) >= 0.9 * reference,
        `${kind} d${difficulty}: jen ${bases(difficulty)} základních zlomků proti ${reference} na trojce`
      );
    }
  }
});

test('do zlomkového pásu nesmí přijít jmenovatel, který ho rozbije', () => {
  // Neplatné SVG hlídá od téhle chvíle sama komponenta (test níž), takže tenhle
  // test drží jinou vlastnost: nové stupně zůstávají ve STEJNÉ vizuální obálce,
  // jakou hra měla na stupních 1-3 (equivalent 72, add/sub 60). Nový stupeň si
  // nemá nastavovat vlastní měřítko obrázku. Prohlížeč řešení kreslí zlomky
  // z pravé strany kroků, takže mez platí na ně.
  const LIMIT = 72; // strop, který hra kreslila už na stupních 1-3
  for (const kind of ['add', 'subtract', 'simplify', 'expand', 'equivalent', 'compare']) {
    for (const difficulty of [4, 5, 6]) {
      for (let seed = 1; seed <= 300; seed++) {
        const exercise = generateFractionExercise(seed, kind, difficulty);
        for (const step of exercise.steps) {
          for (const [, , denominator] of String(step.rightSide).matchAll(/(\d+)\/(\d+)/g)) {
            assert.ok(
              Number(denominator) <= LIMIT,
              `${kind} d${difficulty} seed ${seed}: do pásu jde jmenovatel ${denominator} (${step.rightSide})`
            );
          }
        }
      }
    }
  }
});

/** Řádky pásu (nepravý zlomek se kreslí po celcích pod sebou), shora dolů. */
function barRows(createFractionBar, n, d) {
  const rows = new Map();
  for (const rect of createFractionBar({ n, d }).querySelectorAll('rect')) {
    const y = Number(rect.getAttribute('y'));
    rows.set(y, [...(rows.get(y) ?? []), rect]);
  }
  return [...rows.keys()].sort((a, b) => a - b).map((y) => rows.get(y));
}

test('UCN-MATH-003: zlomkový pás unese každý jmenovatel, který do něj hra pošle', async () => {
  // Mez v generátoru platí jen pro stupně 4-6 a `compare` posílá do pásu
  // jmenovatele až 132 na stupních 1-3 - to je cesta shodná s afb9509, na
  // kterou se kvůli determinismu sahat nesmí, takže vadu musí unést komponenta.
  // 200 px na 132 dílků dá obdélník široký -0,48 px: neplatné SVG, dítě neuvidí
  // hustý pás, ale prázdno. Proto se tu měří to, co hráč doopravdy uvidí -
  // vykreslený pás - a to na VŠECH stupních, ne jen na nových.
  const { installDom } = await import('./domStub.js');
  installDom();
  const { createFractionBar } = await import('../js/ui/fractionVisuals.js');

  // 600 seedů není zdobení: do 300 seedů se `compare` dostane nejvýš na
  // jmenovatele 99, tedy TĚSNĚ pod hranici záporné šířky, a test by tu vadu
  // minul stejně jako ten nad ním. První případ je compare d1 seed 344
  // (50/110). Proto se dole ověřuje, že projetá množina hranici opravdu
  // překročila - jinak by test tiše přestal hlídat, kvůli čemu vznikl.
  const drawn = new Set();
  let maxDenominator = 0;
  for (const kind of ['add', 'subtract', 'simplify', 'expand', 'equivalent', 'compare']) {
    for (const difficulty of [1, 2, 3, 4, 5, 6]) {
      for (let seed = 1; seed <= 600; seed++) {
        for (const step of generateFractionExercise(seed, kind, difficulty).steps) {
          for (const [, n, d] of String(step.rightSide).matchAll(/(\d+)\/(\d+)/g)) {
            if (drawn.has(`${n}/${d}`)) {
              continue;
            }
            drawn.add(`${n}/${d}`);
            maxDenominator = Math.max(maxDenominator, Number(d));
            const rects = barRows(createFractionBar, Number(n), Number(d)).flat();
            assert.ok(rects.length > 0, `${kind} d${difficulty} seed ${seed}: pás ${n}/${d} nenakreslil nic`);
            for (const rect of rects) {
              const rectWidth = Number(rect.getAttribute('width'));
              assert.ok(
                Number.isFinite(rectWidth) && rectWidth > 0,
                `${kind} d${difficulty} seed ${seed}: pás ${n}/${d} má dílek široký ${rectWidth} px`
              );
            }
          }
        }
      }
    }
  }
  assert.ok(
    maxDenominator >= 100,
    `nejvyšší projetý jmenovatel je ${maxDenominator}: sada už nepokrývá pás se zápornou šířkou, kvůli kterému test vznikl`
  );
});

test('UCN-MATH-003: poměrový pás kreslí nepravý zlomek dál po celcích', async () => {
  // Nad prahem přihrádek se pás kreslí poměrově - ale celky se kreslit
  // NEPŘESTANOU. Nepravý zlomek jako celek a zbytek je učební bod stupňů 5 a 6
  // a poměrové kreslení ho nesmí spolknout do jednoho delšího sloupce.
  const { installDom } = await import('./domStub.js');
  installDom();
  const { createFractionBar } = await import('../js/ui/fractionVisuals.js');
  const GREEN = '#7ee08c';
  const fillRatio = (row) => {
    const filled = row.find((rect) => rect.getAttribute('fill') === GREEN);
    const track = row.find((rect) => rect.getAttribute('fill') !== GREEN);
    return filled ? Number(filled.getAttribute('width')) / Number(track.getAttribute('width')) : 0;
  };

  // add d3 seed 104 ("11/12 + 3/10") vede na 73/60, tedy nepravý zlomek se
  // jmenovatelem NAD prahem - přesně případ, kvůli kterému se to hlídá.
  assert.ok(
    generateFractionExercise(104, 'add', 3).steps.some((s) => String(s.rightSide).includes('73/60')),
    'předpoklad testu se rozešel s generátorem: add d3 seed 104 už nevede na 73/60'
  );
  const wide = barRows(createFractionBar, 73, 60);
  assert.equal(wide.length, 2, '73/60 se nenakreslilo jako celek a zbytek');
  assert.equal(fillRatio(wide[0]), 1, 'první pás nepravého zlomku není celý');
  assert.ok(Math.abs(fillRatio(wide[1]) - 13 / 60) < 1e-9, `zbytek je ${fillRatio(wide[1])} místo 13/60`);

  // Pod prahem se nesmí změnit nic: 19/12 zůstává 12 přihrádek celých a 7 z 12.
  const narrow = barRows(createFractionBar, 19, 12);
  assert.deepEqual(narrow.map((row) => row.length), [12, 12], 'přihrádkový pás se přestal dělit na dílky');
  assert.deepEqual(
    narrow.map((row) => row.filter((rect) => rect.getAttribute('fill') === GREEN).length),
    [12, 7],
    'přihrádkový pás vybarvuje jiné dílky než dřív'
  );

  // Práh sám: 24 je nejvíc, co hra kreslí přihrádkově na stupních 1-3 (expand),
  // a poslední jmenovatel, kde je dílek (6,3 px) aspoň trojnásobek mezery.
  assert.equal(barRows(createFractionBar, 23, 24)[0].length, 24, 'jmenovatel 24 se má dělit na přihrádky');
  assert.equal(barRows(createFractionBar, 24, 25)[0].length, 2, 'jmenovatel 25 už má být poměrový');
});
