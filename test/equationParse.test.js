import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEquation,
  canonicalize,
  equationsMatch,
  EQUATION_SETUP_ERROR,
  NOTE_SIMPLER,
} from '../js/content/equationParse.js';
import { generateWordProblem } from '../js/content/wordProblems.js';
import { expr, factoredExpr, effectiveX, effectiveC, isFactored, formatExpr } from '../js/content/solver.js';
import { makeFraction, fractionsEqual, multiplyFractions } from '../js/content/fractions.js';

// --- Pomocníci pro skládání tokenů ------------------------------------------

const T = {
  x: Object.freeze({ kind: 'x' }),
  eq: Object.freeze({ kind: 'eq' }),
  lp: Object.freeze({ kind: 'lparen' }),
  rp: Object.freeze({ kind: 'rparen' }),
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
    body = [T.num(mag.n), T.x]; // implicitní násobení 3x
  } else if (mag.n === 1) {
    body = [T.x, T.op('/'), T.num(mag.d)]; // x/d
  } else {
    body = [T.num(mag.n, mag.d), T.x]; // (p/q)x
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

const eqTokens = (left, right) => [...sideTokens(left), T.eq, ...sideTokens(right)];

/** Lineární tvar { x, c } strany ze solverovského výrazu (roznásobí závorku). */
const linearOf = (e) => ({ x: effectiveX(e), c: effectiveC(e) });

const assertCoeff = (actual, n, d, msg) => {
  assert.ok(fractionsEqual(actual, makeFraction(n, d)), `${msg}: čekám ${n}/${d}, mám ${actual.n}/${actual.d}`);
};

// --- A: parsování všech forem vstupu ----------------------------------------

test('TDD-STEP-004-A: parser přečte všechny formy zápisu do kanonického tvaru', () => {
  const cases = [
    // [tokeny, levá x, levá c, pravá x, pravá c, popis]
    [[T.x, T.op('+'), T.num(7), T.eq, T.num(25)], [1, 1], [7, 1], [0, 1], [25, 1], 'x + 7 = 25'],
    [[T.num(8), T.op('+'), T.x, T.eq, T.num(25)], [1, 1], [8, 1], [0, 1], [25, 1], '8 + x = 25 (komutativita)'],
    [[T.num(2), T.x, T.eq, T.num(14)], [2, 1], [0, 1], [0, 1], [14, 1], '2x = 14 (implicitní násobení)'],
    [[T.num(2), T.op('*'), T.x, T.op('+'), T.num(3), T.eq, T.num(9)], [2, 1], [3, 1], [0, 1], [9, 1], '2 · x + 3 = 9'],
    [[T.num(3, 4), T.x, T.eq, T.num(12)], [3, 4], [0, 1], [0, 1], [12, 1], '(3/4)x = 12'],
    [[T.x, T.op('/'), T.num(4), T.op('+'), T.num(3), T.eq, T.num(8)], [1, 4], [3, 1], [0, 1], [8, 1], 'x/4 + 3 = 8'],
    [[T.x, T.op('-'), T.x, T.op('/'), T.num(4), T.eq, T.num(15)], [3, 4], [0, 1], [0, 1], [15, 1], 'x − x/4 = 15'],
    [[T.num(12), T.op('-'), T.x, T.eq, T.num(5)], [-1, 1], [12, 1], [0, 1], [5, 1], '12 − x = 5'],
    [[T.op('-'), T.x, T.op('+'), T.num(12), T.eq, T.num(5)], [-1, 1], [12, 1], [0, 1], [5, 1], '−x + 12 = 5 (unární minus)'],
    [[T.num(2), T.lp, T.x, T.op('+'), T.num(10), T.rp, T.eq, T.num(36)], [2, 1], [20, 1], [0, 1], [36, 1], '2(x + 10) = 36'],
    [[T.lp, T.x, T.op('+'), T.num(10), T.rp, T.op('*'), T.num(2), T.eq, T.num(36)], [2, 1], [20, 1], [0, 1], [36, 1], '(x + 10) · 2 = 36'],
    [[T.lp, T.x, T.op('+'), T.num(8), T.rp, T.op('/'), T.num(2), T.eq, T.num(10)], [1, 2], [4, 1], [0, 1], [10, 1], '(x + 8)/2 = 10'],
    [[T.num(2), T.x, T.op('+'), T.num(3), T.eq, T.x, T.op('+'), T.num(9)], [2, 1], [3, 1], [1, 1], [9, 1], '2x + 3 = x + 9'],
    [[T.num(8), T.op('/'), T.num(2), T.eq, T.x], [0, 1], [4, 1], [1, 1], [0, 1], '8/2 = x (konstantní zlomek)'],
  ];
  for (const [tokens, lx, lc, rx, rc, label] of cases) {
    const r = parseEquation(tokens);
    assert.equal(r.status, 'ok', `${label}: status ${r.status}, note: ${r.note}`);
    assert.equal(r.note, null, label);
    assertCoeff(r.canonical.left.x, lx[0], lx[1], `${label} levá x`);
    assertCoeff(r.canonical.left.c, lc[0], lc[1], `${label} levá c`);
    assertCoeff(r.canonical.right.x, rx[0], rx[1], `${label} pravá x`);
    assertCoeff(r.canonical.right.c, rc[0], rc[1], `${label} pravá c`);
    // Kanonický tvar je solverovský výraz bez závorky - start krokového režimu.
    assert.deepEqual(r.canonical.left.f, { n: 1, d: 1 }, label);
    assert.deepEqual(r.canonical.right.f, { n: 1, d: 1 }, label);
  }
});

test('TDD-STEP-004-B: canonicalize roznásobí součinový tvar a krátí zlomky', () => {
  const expanded = canonicalize(factoredExpr(2, 1, 1, 1, 10, 1)); // 2(x + 10)
  assertCoeff(expanded.x, 2, 1, 'x po roznásobení');
  assertCoeff(expanded.c, 20, 1, 'c po roznásobení');
  assert.deepEqual(expanded.f, { n: 1, d: 1 });

  const reduced = canonicalize({ x: { n: 6, d: 8 }, c: { n: 4, d: 2 } });
  assertCoeff(reduced.x, 3, 4, 'x po zkrácení');
  assertCoeff(reduced.c, 2, 1, 'c po zkrácení');

  const plain = canonicalize(expr(3, 1, 4, 1));
  assert.deepEqual(plain, { f: { n: 1, d: 1 }, x: { n: 3, d: 1 }, c: { n: 4, d: 1 } });
});

// --- C: sémantické porovnání -------------------------------------------------

test('TDD-STEP-004-C: komutativita a přehození stran jsou čistý match', () => {
  const expected = { left: expr(1, 1, 8, 1), right: expr(0, 1, 25, 1) }; // x + 8 = 25

  for (const [tokens, label] of [
    [[T.x, T.op('+'), T.num(8), T.eq, T.num(25)], 'kanonicky'],
    [[T.num(8), T.op('+'), T.x, T.eq, T.num(25)], 'komutativita 8 + x'],
    [[T.num(25), T.eq, T.x, T.op('+'), T.num(8)], 'přehození stran'],
    [[T.num(25), T.eq, T.num(8), T.op('+'), T.x], 'přehození stran + komutativita'],
  ]) {
    const r = parseEquation(tokens, expected);
    assert.equal(r.status, 'match', `${label}: ${r.status}`);
    assert.equal(r.note, null, `${label}: bez poznámky (${r.note})`);
    assert.ok(!('errorKind' in r), label);
  }
});

test('TDD-STEP-004-D: násobek rovnice je match s poznámkou o jednodušším zápisu', () => {
  const expected = { left: expr(1, 1, 7, 1), right: expr(0, 1, 25, 1) }; // x + 7 = 25

  const doubled = parseEquation(
    [T.num(2), T.x, T.op('+'), T.num(14), T.eq, T.num(50)], // 2x + 14 = 50
    expected
  );
  assert.equal(doubled.status, 'match');
  assert.equal(doubled.note, NOTE_SIMPLER);
  assert.equal(doubled.note, 'Správně! Jde to napsat i jednodušeji.');
  // Canonical nese HRÁČOVU rovnici (z ní startuje krokový režim, DEC-011).
  assertCoeff(doubled.canonical.left.x, 2, 1, 'kanonický násobek x');

  // Záporný násobek (−2x − 14 = −50) je taky násobek, ne přehození stran.
  const negative = parseEquation(
    [T.op('-'), T.num(2), T.x, T.op('-'), T.num(14), T.eq, T.op('-'), T.num(50)],
    expected
  );
  assert.equal(negative.status, 'match');
  assert.equal(negative.note, NOTE_SIMPLER);

  // equationsMatch přímo: trojnásobek i prohození stran.
  const triple = equationsMatch(
    { left: expr(3, 1, 21, 1), right: expr(0, 1, 75, 1) },
    expected
  );
  assert.deepEqual(triple, { status: 'match', note: NOTE_SIMPLER });
  const swapped = equationsMatch(
    { left: expr(0, 1, 25, 1), right: expr(1, 1, 7, 1) },
    expected
  );
  assert.deepEqual(swapped, { status: 'match', note: null });
});

test('TDD-STEP-004-D2: jednodušší tvar než reference je čistý match bez poznámky', () => {
  // Součinový tvar z generátoru obtížnost 4 (závorka): 2(x + 7) = 36.
  const expected = { left: factoredExpr(2, 1, 1, 1, 7, 1), right: expr(0, 1, 36, 1) };

  // Hráč rovnici zkrátil a napsal minimální tvar x + 7 = 18 (k = 1/2, |k| < 1).
  // Poznámka "jde to napsat i jednodušeji" patří jen násobku, ne zkrácení.
  const minimal = parseEquation([T.x, T.op('+'), T.num(7), T.eq, T.num(18)], expected);
  assert.equal(minimal.status, 'match');
  assert.equal(minimal.note, null, `|k| < 1 nesmí dostat NOTE_SIMPLER (${minimal.note})`);

  // Záporný podíl |k| < 1: −x − 7 = −18 (k = −1/2).
  const negative = parseEquation(
    [T.op('-'), T.x, T.op('-'), T.num(7), T.eq, T.op('-'), T.num(18)],
    expected
  );
  assert.equal(negative.status, 'match');
  assert.equal(negative.note, null, `záporný |k| < 1 nesmí dostat NOTE_SIMPLER (${negative.note})`);

  // Přímo equationsMatch: rozepsaný očekávaný tvar 2x + 14 = 36, hráč x + 7 = 18.
  const direct = equationsMatch(
    { left: expr(1, 1, 7, 1), right: expr(0, 1, 18, 1) },
    { left: expr(2, 1, 14, 1), right: expr(0, 1, 36, 1) }
  );
  assert.deepEqual(direct, { status: 'match', note: null });

  // Defensivita: degenerované očekávání (0x = 0) nesmí skončit dělením nulou.
  const degenerate = equationsMatch(
    { left: expr(1, 1, 7, 1), right: expr(0, 1, 18, 1) },
    { left: expr(0, 1, 0, 1), right: expr(0, 1, 0, 1) }
  );
  assert.deepEqual(degenerate, { status: 'match', note: null });
});

test('TDD-STEP-004-E: x − x/4 je sémanticky totéž jako 3/4 x', () => {
  // Očekávaný tvar, jak ho vrací generátor (thinkNthPart).
  const expected = { left: expr(3, 4, 0, 1), right: expr(0, 1, 15, 1) };
  const r = parseEquation([T.x, T.op('-'), T.x, T.op('/'), T.num(4), T.eq, T.num(15)], expected);
  assert.equal(r.status, 'match');
  assert.equal(r.note, null); // přesně kanonický tvar, žádný násobek
  assertCoeff(r.canonical.left.x, 3, 4, 'x − x/4 = 3/4 x');
});

// --- F: neúplné a nečitelné zápisy -------------------------------------------

test('TDD-STEP-004-F: neúplné zápisy jsou unparseable s nápovědou, ne chybou', () => {
  const cases = [
    [[], 'prázdný vstup'],
    [[T.num(5)], 'samotné číslo'],
    [[T.x, T.op('+'), T.num(3)], 'chybí ='],
    [[T.x, T.eq, T.num(3), T.eq, T.num(2)], 'dvě ='],
    [[T.eq, T.num(5)], 'prázdná levá strana'],
    [[T.x, T.eq], 'prázdná pravá strana'],
    [[T.x, T.op('+'), T.eq, T.num(5)], 'visící operátor'],
    [[T.lp, T.x, T.op('+'), T.num(3), T.eq, T.num(9)], 'nezavřená závorka'],
    [[T.num(3), T.op('+'), T.num(5), T.eq, T.num(8)], 'rovnice bez x'],
    [[T.x, T.op('*'), T.x, T.eq, T.num(9)], 'x · x není lineární'],
    [[T.x, T.op('/'), T.x, T.eq, T.num(1)], 'dělení x-členem'],
    [{ kind: 'emoji', value: '🚀' }, 'neznámý token'],
  ];
  for (const [tokens, label] of cases) {
    const r = parseEquation(tokens, { left: expr(1, 1, 7, 1), right: expr(0, 1, 25, 1) });
    assert.equal(r.status, 'unparseable', `${label}: ${r.status}`);
    assert.equal(r.canonical, null, label);
    assert.equal(typeof r.note, 'string', label);
    assert.ok(r.note.length > 0, label);
    assert.ok(!('errorKind' in r), `${label}: unparseable nesmí do statistik`);
  }

  // Konkrétní nápovědy u typických situací.
  assert.match(parseEquation([T.x, T.op('+'), T.num(3)]).note, /rovnítka/);
  assert.match(parseEquation([T.x, T.eq, T.num(3), T.eq, T.num(2)]).note, /jedno rovnítko/);
  assert.match(parseEquation([T.num(5)]).note, /rovnítka/);
  assert.match(parseEquation([T.num(3), T.eq, T.num(8)]).note, /neznámá x/);
  // Psané x, které se vynulovalo (x − x = 0), nehlásí "chybí neznámá x".
  assert.match(parseEquation([T.x, T.op('-'), T.x, T.eq, T.num(0)]).note, /vynulovala/);
  assert.match(parseEquation([T.x, T.op('/'), T.num(0), T.eq, T.num(5)]).note, /Nulou se nedělí/);
});

// --- G: špatně sestavená rovnice ---------------------------------------------

test('TDD-STEP-004-G: dobře zapsaná rovnice mimo zadání je mismatch + equationSetup', () => {
  const expected = { left: expr(1, 1, 8, 1), right: expr(0, 1, 25, 1) }; // x + 8 = 25

  const wrongConst = parseEquation([T.x, T.op('+'), T.num(8), T.eq, T.num(26)], expected);
  assert.equal(wrongConst.status, 'mismatch');
  assert.equal(wrongConst.errorKind, EQUATION_SETUP_ERROR);
  assert.equal(wrongConst.errorKind, 'equationSetup');
  assert.equal(typeof wrongConst.note, 'string');
  // Mismatch nese hráčovu kanonickou rovnici (pro zobrazení/krokový režim).
  assertCoeff(wrongConst.canonical.right.c, 26, 1, 'mismatch canonical');

  // Degenerované rovnice (x = x, x = x + 1) jsou mismatch, ne unparseable.
  for (const tokens of [
    [T.x, T.eq, T.x],
    [T.x, T.eq, T.x, T.op('+'), T.num(1)],
  ]) {
    const r = parseEquation(tokens, expected);
    assert.equal(r.status, 'mismatch', `degenerace: ${r.status}`);
    assert.equal(r.errorKind, EQUATION_SETUP_ERROR);
  }
});

test('TDD-STEP-004-H: žádná hláška neprozradí správnou rovnici', () => {
  const expected = { left: expr(2, 1, 14, 1), right: expr(0, 1, 50, 1) }; // 2x + 14 = 50
  const expectedText = `${formatExpr(expected.left)} = ${formatExpr(expected.right)}`;

  const notes = [
    parseEquation([T.x, T.op('+'), T.num(8), T.eq, T.num(27)], expected).note, // mismatch
    parseEquation([T.num(2), T.x, T.op('+'), T.num(14)], expected).note, // unparseable
    parseEquation([T.num(4), T.x, T.op('+'), T.num(28), T.eq, T.num(100)], expected).note, // násobek
    parseEquation([], expected).note,
  ];
  for (const note of notes) {
    assert.equal(typeof note, 'string');
    // Žádné číslice - hlášky jsou pevné texty, kanonický tvar se neprozradí.
    assert.ok(!/\d/.test(note), `hláška obsahuje číslo: ${note}`);
    assert.ok(!note.includes(expectedText), note);
  }
});

// --- I: round-trip s generátorem ---------------------------------------------

test('TDD-STEP-004-I: round-trip - ekvivalentní zápisy generovaných rovnic jsou match', () => {
  let sawFactored = 0;
  let sawFractionCoef = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (const difficulty of [2, 3, 4, 5, 6]) {
      const p = generateWordProblem(seed, difficulty);
      const expected = p.equation;
      const left = linearOf(expected.left);
      const right = linearOf(expected.right);

      // 1) Kanonický zápis očekávané rovnice.
      const canonical = parseEquation(eqTokens(left, right), expected);
      assert.equal(canonical.status, 'match', `${p.text} (seed ${seed}, d${difficulty})`);
      assert.equal(canonical.note, null, p.text);
      assert.ok(fractionsEqual(canonical.canonical.left.x, left.x), p.text);
      assert.ok(fractionsEqual(canonical.canonical.left.c, left.c), p.text);

      // 2) Přehozené strany.
      const swapped = parseEquation(eqTokens(right, left), expected);
      assert.equal(swapped.status, 'match', p.text);
      assert.equal(swapped.note, null, p.text);

      // 3) Dvojnásobek rovnice -> match s poznámkou.
      const k = makeFraction(2);
      const scaledLeft = { x: multiplyFractions(left.x, k), c: multiplyFractions(left.c, k) };
      const scaledRight = { x: multiplyFractions(right.x, k), c: multiplyFractions(right.c, k) };
      const scaled = parseEquation(eqTokens(scaledLeft, scaledRight), expected);
      assert.equal(scaled.status, 'match', p.text);
      assert.equal(scaled.note, NOTE_SIMPLER, p.text);

      // 4) Zlomkový koeficient jako "x − zbytek x": (p/d)x ≡ x − ((d−p)/d)x.
      //    Jen když levá strana je čistý x-člen se jmenovatelem > 1.
      if (left.c.n === 0 && left.x.d > 1 && left.x.n > 0 && right.x.n === 0) {
        sawFractionCoef++;
        const remainder = makeFraction(left.x.d - left.x.n, left.x.d);
        const tokens = [T.x, T.op('-'), ...termTokens(remainder, true).body, T.eq, ...sideTokens(right)];
        const parts = parseEquation(tokens, expected);
        assert.equal(parts.status, 'match', `${p.text}: x − ${remainder.n}/${remainder.d}x`);
        assertCoeff(parts.canonical.left.x, left.x.n, left.x.d, p.text);
      }

      // 5) Závorkový tvar a(x + b) = c, když ho generátor produkuje.
      if (isFactored(expected.left)) {
        sawFactored++;
        const a = expected.left.f;
        const inner = { x: expected.left.x, c: expected.left.c };
        const bracketTokens = [
          ...(a.n === 1 && a.d === 1 ? [] : [T.num(a.n, a.d)]),
          T.lp,
          ...sideTokens(inner),
          T.rp,
          T.eq,
          ...sideTokens(right),
        ];
        const bracket = parseEquation(bracketTokens, expected);
        assert.equal(bracket.status, 'match', `${p.text}: závorkový tvar`);
        assert.equal(bracket.note, null, p.text);
      }
    }
  }
  assert.ok(sawFactored > 0, 'v round-tripu se má objevit i součinový tvar');
  assert.ok(sawFractionCoef > 0, 'v round-tripu se má objevit i zlomkový koeficient');
});
