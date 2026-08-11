import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFreeEquationModel, HINT_NO_X } from '../js/ui/freeEquationModel.js';
import { parseEquation } from '../js/content/equationParse.js';
import { expr, multiTermSide, formatExpr } from '../js/content/solver.js';
import { createStepSession } from '../js/engine/stepSession.js';
import { makeFraction } from '../js/content/fractions.js';

const f = (n, d = 1) => makeFraction(n, d);
const xt = (n, d = 1) => ({ x: f(n, d), c: f(0) });

/**
 * Pomocník: odehraje zápis jako posloupnost stisků kláves.
 * Číslice = '0'-'9', symboly: 'x', '+', '−'/'-', '·', '(', ')', '/', '=', '⌫'.
 */
function play(m, script) {
  for (const key of script) {
    let result;
    if (/^[0-9]$/.test(key)) {
      result = m.pressDigit(key);
    } else if (key === 'x') {
      result = m.pressX();
    } else if (key === '+' || key === '-') {
      result = key === '+' ? m.pressOp('+') : m.pressMinus();
    } else if (key === '·') {
      result = m.pressOp('*');
    } else if (key === '(') {
      result = m.pressLparen();
    } else if (key === ')') {
      result = m.pressRparen();
    } else if (key === '/') {
      result = m.pressFractionBar();
    } else if (key === '=') {
      result = m.pressEq();
    } else if (key === '⌫') {
      m.pressBackspace();
      continue;
    } else {
      throw new Error(`Neznámá klávesa ve scénáři: ${key}`);
    }
    assert.equal(result.status, 'added', `klávesa '${key}' má projít (${JSON.stringify(m.getState().cells)})`);
  }
}

/* --- Model klávesnice -> token stream, round-trip přes parseEquation --- */

test('UCV-INPUT-004: jednoduchá rovnice projde modelem i parserem', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '+', '7', '=', '2', '5']);
  assert.deepEqual(m.getTokens(), [
    { kind: 'x' },
    { kind: 'op', op: '+' },
    { kind: 'num', n: 7 },
    { kind: 'eq' },
    { kind: 'num', n: 25 },
  ]);
  assert.equal(m.getDisplayText(), 'x + 7 = 25');
  assert.equal(m.canSubmit(), true);

  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.x, { n: 1, d: 1 });
  assert.deepEqual(res.canonical.left.c, { n: 7, d: 1 });
  assert.deepEqual(res.canonical.right.c, { n: 25, d: 1 });
});

test('UCV-INPUT-004: validace proti očekávané rovnici (match i mismatch)', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '+', '7', '=', '2', '5']);
  const expected = { left: expr(1, 1, 7, 1), right: expr(0, 1, 25, 1) };
  assert.equal(parseEquation(m.getTokens(), expected).status, 'match');
  const wrong = { left: expr(1, 1, 7, 1), right: expr(0, 1, 30, 1) };
  const res = parseEquation(m.getTokens(), wrong);
  assert.equal(res.status, 'mismatch');
  assert.equal(res.errorKind, 'equationSetup');
});

test("UCV-INPUT-004: 'x/4' klávesnice sestaví jako zlomek x lomeno 4", () => {
  const m = createFreeEquationModel();
  play(m, ['x', '/', '4', '=', '1', '5']);
  assert.equal(m.getDisplayText(), 'x/4 = 15');
  assert.deepEqual(m.getTokens(), [
    { kind: 'x' },
    { kind: 'op', op: '/' },
    { kind: 'num', n: 4 },
    { kind: 'eq' },
    { kind: 'num', n: 15 },
  ]);

  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.x, { n: 1, d: 4 }, 'čtvrtina z x');

  const expected = { left: expr(1, 1, 0, 1), right: expr(0, 1, 60, 1) };
  assert.equal(parseEquation(m.getTokens(), expected).status, 'match');
});

test("UCV-INPUT-004: '1/4 x' jde napsat i přečíst (implicitní násobení zlomkem)", () => {
  const m = createFreeEquationModel();
  play(m, ['1', '/', '4', 'x', '=', '1', '5']);
  assert.equal(m.getDisplayText(), '1/4 x = 15');
  assert.deepEqual(m.getTokens(), [
    { kind: 'num', n: 1, d: 4 },
    { kind: 'x' },
    { kind: 'eq' },
    { kind: 'num', n: 15 },
  ]);

  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.x, { n: 1, d: 4 }, 'stejná rovnice jako x/4');

  // obě varianty vedou na tentýž kanonický tvar
  const m2 = createFreeEquationModel();
  play(m2, ['x', '/', '4', '=', '1', '5']);
  assert.deepEqual(
    parseEquation(m.getTokens()).canonical,
    parseEquation(m2.getTokens()).canonical
  );
});

test('UCV-INPUT-004: závorky a implicitní násobení (2(x + 10) = 36)', () => {
  const m = createFreeEquationModel();
  play(m, ['2', '(', 'x', '+', '1', '0', ')', '=', '3', '6']);
  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.x, { n: 2, d: 1 });
  assert.deepEqual(res.canonical.left.c, { n: 20, d: 1 });
});

/* --- Klávesa '=' se po prvním použití vypne --- */

test("UCV-INPUT-004: dvě '=' za sebou nejdou - klávesa se vypne, backspace ji zase zapne", () => {
  const m = createFreeEquationModel();
  play(m, ['x', '+', '1', '=']);
  assert.equal(m.getState().eqUsed, true);

  const again = m.pressEq();
  assert.equal(again.status, 'blocked');
  assert.match(again.note, /jen jedno rovnítko/);

  // '=' nelze ani na začátku zápisu (levá strana by byla prázdná)
  const empty = createFreeEquationModel();
  assert.equal(empty.pressEq().status, 'blocked');

  // smazání rovnítka backspacem klávesu zase zpřístupní
  play(m, ['2', '⌫', '⌫']);
  assert.equal(m.getState().eqUsed, false);
  assert.equal(m.pressEq().status, 'added');
});

/* --- Hotovo gate --- */

test('UCV-INPUT-004: Hotovo je zablokované, dokud není na obou stranách aspoň jeden člen', () => {
  const m = createFreeEquationModel();
  assert.equal(m.canSubmit(), false, 'prázdný zápis');
  assert.equal(m.submitHint(), 'Na obou stranách rovnice musí něco být.');

  play(m, ['x', '+', '7']);
  assert.equal(m.canSubmit(), false, 'bez rovnítka a pravé strany');

  play(m, ['=']);
  assert.equal(m.canSubmit(), false, 'pravá strana je prázdná');
  assert.equal(m.submitHint(), 'Na obou stranách rovnice musí něco být.');

  play(m, ['2', '5']);
  assert.equal(m.canSubmit(), true);
  assert.equal(m.submitHint(), null);
});

test("UCV-INPUT-004: zápis bez x má Hotovo zablokované s nápisem 'Rovnice musí obsahovat x'", () => {
  const m = createFreeEquationModel();
  play(m, ['3', '+', '5', '=', '8']);
  assert.equal(m.canSubmit(), false);
  assert.equal(m.submitHint(), HINT_NO_X);
  assert.equal(HINT_NO_X, 'Rovnice musí obsahovat x');

  // x stačí kdekoliv - třeba jen na pravé straně
  play(m, ['⌫', 'x']);
  assert.equal(m.canSubmit(), true);
});

test('UCV-INPUT-004: rozpracovaný zlomek bez jmenovatele Hotovo zablokuje', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '=', '5', '/']);
  assert.equal(m.canSubmit(), false);
  assert.equal(m.submitHint(), 'Dopiš jmenovatele zlomku.');

  // rovnítko za rozpracovaným zlomkem neprojde vůbec (jinak by vznikla
  // levá strana, kterou už nejde opravit jinak než smazáním všeho za ní)
  const m2 = createFreeEquationModel();
  play(m2, ['x', '/']);
  const eq = m2.pressEq();
  assert.equal(eq.status, 'blocked');
  assert.match(eq.note, /jmenovatele/);
});

test('UCV-INPUT-004: rovnítko za neuzavřenou závorkou neprojde (žádná slepá ulička)', () => {
  const m = createFreeEquationModel();
  play(m, ['2', '(', 'x', '+', '1']);
  const eq = m.pressEq();
  assert.equal(eq.status, 'blocked', 'závorka musí být zavřená dřív než rovnítko');
  assert.match(eq.note, /závorku/);
  assert.equal(m.getDisplayText(), '2(x + 1', 'zápis se stiskem nezměnil');

  // hráč závorku zavře a rovnítko projde - bez mazání čehokoliv
  play(m, [')', '=', '9']);
  assert.equal(m.getDisplayText(), '2(x + 1) = 9');
  assert.equal(m.canSubmit(), true);
  assert.equal(parseEquation(m.getTokens()).status, 'ok');
});

test('UCV-INPUT-004: rovnítko patří až za dokončenou levou stranu', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '+']);
  const eq = m.pressEq();
  assert.equal(eq.status, 'blocked', "'x + = 5' by šlo opravit jen smazáním celé pravé strany");
  assert.match(eq.note, /Rovnítko patří/);

  play(m, ['7', '=']);
  assert.equal(m.getState().eqUsed, true);
});

test('UCV-INPUT-004: Hotovo nepustí nedopsanou stranu ani neuzavřenou závorku', () => {
  // strana končící znaménkem
  const m = createFreeEquationModel();
  play(m, ['x', '=', '2', '+']);
  assert.equal(m.canSubmit(), false, "'x = 2 +' není dopsané");
  assert.equal(m.submitHint(), 'Rovnice není dopsaná - za znaménkem ještě něco chybí.');
  play(m, ['3']);
  assert.equal(m.canSubmit(), true);

  // neuzavřená závorka na pravé straně
  const m2 = createFreeEquationModel();
  play(m2, ['x', '+', '7', '=', '2', '(', '3']);
  assert.equal(m2.canSubmit(), false);
  assert.equal(m2.submitHint(), 'Zavři závorku - ke každé otevřené patří zavřená.');
  play(m2, [')']);
  assert.equal(m2.canSubmit(), true);
});

test('UCV-INPUT-004: co Hotovo pustí, to parser přečte (žádné unparseable)', () => {
  // Dřív tyhle zápisy prošly gate a spadly až na parseru hláškou 'nerozumím'.
  // (rozpracovaný zlomek 'x = 5/' řeší vlastní test - do tokenů se čára bez
  // jmenovatele vůbec nedostane, takže by parser četl neúplný zápis jako 'x = 5')
  const scripts = [
    ['x', '=', '2', '+'],
    ['x', '+', '7', '=', '2', '(', '3'],
    ['3', '+', '5', '=', '8'],
  ];
  for (const script of scripts) {
    const m = createFreeEquationModel();
    play(m, script);
    assert.equal(m.canSubmit(), false, `zápis ${script.join(' ')} nesmí projít gate`);
    assert.equal(parseEquation(m.getTokens()).status, 'unparseable', 'parser by ho stejně odmítl');
    assert.ok(m.submitHint(), 'hráč musí dostat konkrétní důvod');
  }
});

test('UCV-INPUT-004: kvadratický zápis (x · x) model zablokuje hned při stisku', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '·']);
  const blocked = m.pressX();
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.note, /Dvě x se nesmí násobit/);

  // i přes závorky: 2(x + 1)(x + 1)
  const m2 = createFreeEquationModel();
  play(m2, ['2', '(', 'x', '+', '1', ')', '·', '(']);
  assert.equal(m2.pressX().status, 'blocked');

  // lineární zápisy zůstávají povolené
  const ok = createFreeEquationModel();
  play(ok, ['2', '·', 'x', '+', '3', '·', 'x', '=', '1', '0']);
  assert.equal(ok.canSubmit(), true);
  assert.equal(parseEquation(ok.getTokens()).status, 'ok');

  const paren = createFreeEquationModel();
  play(paren, ['2', '(', 'x', '+', 'x', ')', '=', '8']);
  assert.equal(parseEquation(paren.getTokens()).status, 'ok', 'sčítání v závorce kvadratické není');
});

test('UCV-INPUT-004: dělení nulou dostane stejnou hlášku u zlomku i u x', () => {
  const m = createFreeEquationModel();
  play(m, ['3', '/', '0', '+', 'x', '=', '5']);
  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'unparseable');
  assert.equal(res.note, 'Nulou se nedělí.');

  const m2 = createFreeEquationModel();
  play(m2, ['x', '/', '0', '=', '5']);
  assert.equal(parseEquation(m2.getTokens()).note, res.note, 'stejný důvod, stejná hláška');
});

/* --- Unární minus na začátku strany --- */

test('UCV-INPUT-004: klávesa − na začátku strany funguje jako unární mínus', () => {
  const m = createFreeEquationModel();
  play(m, ['-', '3', '=', 'x']);
  // Unární mínus se lepí k operandu - '−3', ne '− 3' (binární má mezery).
  assert.equal(m.getDisplayText(), '−3 = x');
  const res = parseEquation(m.getTokens());
  assert.equal(res.status, 'ok');
  assert.deepEqual(res.canonical.left.c, { n: -3, d: 1 });

  // minus i na začátku pravé strany a za otevřenou závorkou
  const m2 = createFreeEquationModel();
  play(m2, ['x', '=', '-', '5']);
  assert.equal(parseEquation(m2.getTokens()).status, 'ok');
  assert.deepEqual(parseEquation(m2.getTokens()).canonical.right.c, { n: -5, d: 1 });

  const m3 = createFreeEquationModel();
  play(m3, ['2', '(', '-', 'x', '+', '4', ')', '=', '1']);
  assert.equal(parseEquation(m3.getTokens()).status, 'ok');

  // minus za jiným znaménkem ale ne - 'x + −' nedává smysl
  const m4 = createFreeEquationModel();
  play(m4, ['x', '+']);
  assert.equal(m4.pressMinus().status, 'blocked');
});

test('UCV-INPUT-004: unární mínus za rovnítkem a v závorce nedělá dvojitou mezeru', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '=', '-', '5']);
  assert.equal(m.getDisplayText(), 'x = −5', 'za rovnítkem je jen jedna mezera');

  const m2 = createFreeEquationModel();
  play(m2, ['2', '(', '-', 'x', '+', '4', ')', '=', '1']);
  assert.equal(m2.getDisplayText(), '2(−x + 4) = 1', 'v závorce se mínus lepí k x');

  // binární mínus mezery ponechává
  const m3 = createFreeEquationModel();
  play(m3, ['x', '-', '4', '=', '1']);
  assert.equal(m3.getDisplayText(), 'x − 4 = 1');
});

/* --- Zlomek: čitatel / jmenovatel --- */

test('UCV-INPUT-004: zlomek se zadává čitatel, čára, jmenovatel (jako UCV-INPUT-002)', () => {
  const m = createFreeEquationModel();
  play(m, ['3', '/']);
  assert.equal(m.getDisplayText(), '3/', 'rozpracovaný zlomek je vidět');
  play(m, ['4']);
  assert.equal(m.getDisplayText(), '3/4');
  assert.deepEqual(m.getTokens(), [{ kind: 'num', n: 3, d: 4 }]);

  // další číslice pokračuje do jmenovatele
  play(m, ['2']);
  assert.equal(m.getDisplayText(), '3/42');

  // druhá čára u téhož čísla nejde
  const again = m.pressFractionBar();
  assert.equal(again.status, 'blocked');

  // čára bez čitatele nejde (ani za znaménkem)
  const bare = createFreeEquationModel();
  assert.equal(bare.pressFractionBar().status, 'blocked');
  play(bare, ['x', '+']);
  assert.equal(bare.pressFractionBar().status, 'blocked');
});

/* --- Smazání znaku --- */

test('UCV-INPUT-004: backspace maže znak po znaku - jmenovatele, čáru, číslice, buňky', () => {
  const m = createFreeEquationModel();
  play(m, ['1', '2', '/', '3']);
  play(m, ['⌫']);
  assert.equal(m.getDisplayText(), '12/', 'smazala se číslice jmenovatele');
  play(m, ['⌫']);
  assert.equal(m.getDisplayText(), '12', 'smazala se zlomková čára');
  play(m, ['⌫']);
  assert.equal(m.getDisplayText(), '1', 'mažou se číslice čitatele');
  play(m, ['⌫']);
  assert.equal(m.getDisplayText(), '', 'prázdná buňka zmizí');

  // u x s čárou stejně: x/4 -> x/ -> x -> (prázdno)
  const m2 = createFreeEquationModel();
  play(m2, ['x', '/', '4']);
  play(m2, ['⌫', '⌫', '⌫']);
  assert.equal(m2.getDisplayText(), '');

  // backspace na prázdném zápisu nic nedělá
  m2.pressBackspace();
  assert.equal(m2.getDisplayText(), '');

  // smazání znaménka / závorky / rovnítka = smazání celé buňky
  const m3 = createFreeEquationModel();
  play(m3, ['x', '+']);
  play(m3, ['⌫']);
  assert.equal(m3.getDisplayText(), 'x');
});

/* --- Zápis zůstává po špatné validaci --- */

test('UCV-INPUT-004: po mismatch zápis zůstává k opravě (validace model nemění)', () => {
  const m = createFreeEquationModel();
  play(m, ['x', '+', '7', '=', '2', '5']);
  const before = m.getTokens();

  const wrong = { left: expr(1, 1, 7, 1), right: expr(0, 1, 30, 1) };
  assert.equal(parseEquation(m.getTokens(), wrong).status, 'mismatch');

  assert.deepEqual(m.getTokens(), before, 'tokeny se validací nezměnily');
  assert.equal(m.getDisplayText(), 'x + 7 = 25');
  assert.equal(m.canSubmit(), true, 'opravený zápis jde hned znovu odeslat');

  // hráč opraví jen konec a rovnice projde
  play(m, ['⌫', '⌫', '3', '0']);
  const expected = { left: expr(1, 1, 7, 1), right: expr(0, 1, 30, 1) };
  assert.equal(parseEquation(m.getTokens(), expected).status, 'match');
});

/* --- DEC-013: terms-aware render v krokovém režimu --- */

test('DEC-013: formatExpr vykresluje nesčtené členy, ne jejich součet', () => {
  const side = multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]);
  assert.deepEqual(side.x, { n: 1, d: 4 }, 'invariant: součet členů drží');
  assert.equal(formatExpr(side), 'x - x/2 - x/4', 'render ukazuje členy, ne x/4');

  // výraz bez členů se formátuje jako dosud
  assert.equal(formatExpr(expr(3, 1, 4, 1)), '3x + 4');
});

test('DEC-013: kroková relace ukazuje v rovnici i historii nesčtené členy', () => {
  // x − x/2 − x/4 = 15, start z multiTerm výstupu parseru (DEC-011/012)
  const s = createStepSession({
    equation: { left: multiTermSide([xt(1), xt(-1, 2), xt(-1, 4)]), right: expr(0, 1, 15, 1) },
  });
  assert.equal(s.equationText, 'x - x/2 - x/4 = 15', 'živá rovnice není tichá kanonizace');

  // Operace před sečtením škáluje členy a render je ukáže všechny. Dopočet
  // jde PO ČLENECH, ne přes jejich součet - ten v rovnici nikde nestojí.
  s.submitOperation({ kind: 'mul', operand: f(4) });
  s.submitValue({ kind: 'int', value: 4 });   // x × 4
  s.submitValue({ kind: 'int', value: -2 });  // -x/2 × 4
  s.submitValue({ kind: 'int', value: -1 });  // -x/4 × 4
  s.submitValue({ kind: 'int', value: 60 });  // pravá strana
  assert.equal(s.equationText, '4x - 2x - x = 60');
  assert.equal(s.history[0].equationText, '4x - 2x - x = 60', 'historie vykresluje členy');

  // po dobrovolném sečtení teprve součet
  s.submitOperation({ kind: 'combine', side: 'left' });
  s.submitValue({ kind: 'int', value: 1 });
  assert.equal(s.equationText, 'x = 60');
});

/* --- Blokované kombinace --- */

test('UCV-INPUT-004: neplatné kombinace model zablokuje hned při stisku', () => {
  const m = createFreeEquationModel();
  assert.equal(m.pressOp('+').status, 'blocked', 'znaménko bez hodnoty před sebou');

  play(m, ['x']);
  assert.equal(m.pressX().status, 'blocked', 'dvě x vedle sebe');
  assert.equal(m.pressDigit('3').status, 'blocked', 'číslo za x bez znaménka');

  play(m, ['+', '2']);
  assert.equal(m.pressRparen().status, 'blocked', 'zavření bez otevření');

  // dvě znaménka vedle sebe: 'x +' a pak další operace
  play(m, ['⌫']);
  assert.equal(m.pressOp('*').status, 'blocked', 'znaménko za znaménkem');

  play(m, ['2', '=']);
  assert.equal(m.pressLparen().status, 'added');
  play(m, ['x']);
  assert.equal(m.pressLparen().status, 'blocked', 'závorka za x');
  play(m, [')']);
  assert.equal(m.pressLparen().status, 'blocked', 'závorka za závorkou');
});
