import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTileBuilderModel, MAX_NUM_DIGITS, HINT_NO_X } from '../js/ui/tileBuilderModel.js';
import { createFreeEquationModel, HINT_NO_X as FREE_HINT_NO_X } from '../js/ui/freeEquationModel.js';
import { parseEquation } from '../js/content/equationParse.js';

/** Pomocník: postaví stranu stiskem dlaždic (číslice + symboly). */
function build(m, script) {
  for (const step of script) {
    const result = /^[0-9]$/.test(step) ? m.pressDigit(step) : m.pressTile(step);
    assert.equal(result.status, 'added', `dlaždice ${step} má projít`);
  }
}

const lin = (x, c) => ({ x: { n: x, d: 1 }, c: { n: c, d: 1 } });

test('přidání dlaždice na aktivní stranu a výstup tokenů', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '5']);
  assert.deepEqual(m.getTokens(), [
    { kind: 'x' },
    { kind: 'op', op: '+' },
    { kind: 'num', n: 7 },
    { kind: 'eq' },
    { kind: 'num', n: 25 },
  ]);
});

test('číslice se skládají do víceciferného čísla, vedoucí nula se nahradí', () => {
  const m = createTileBuilderModel();
  build(m, ['4', '2']);
  assert.deepEqual(m.getState().left, [{ kind: 'num', text: '42' }]);
  m.clearSide();
  build(m, ['0', '7']);
  assert.deepEqual(m.getState().left, [{ kind: 'num', text: '7' }]);
});

test(`číslo má nejvýš ${MAX_NUM_DIGITS} číslice`, () => {
  const m = createTileBuilderModel();
  build(m, ['1', '2', '3', '4']);
  const blocked = m.pressDigit('5');
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(m.getState().left, [{ kind: 'num', text: '1234' }]);
});

test('přepnutí aktivní strany klepnutím na schránku', () => {
  const m = createTileBuilderModel();
  build(m, ['x']);
  m.setActiveSide('right');
  build(m, ['8']);
  m.setActiveSide('left');
  build(m, ['+', '3']);
  const state = m.getState();
  assert.deepEqual(state.left.map((c) => c.kind), ['x', 'op', 'num']);
  assert.deepEqual(state.right.map((c) => c.kind), ['num']);
  assert.equal(state.active, 'left');
});

test('odebrání dlaždice klikem ve schránce', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  assert.equal(m.removeCell(1), true); // odebere '+'
  assert.deepEqual(m.getState().left.map((c) => c.kind), ['x', 'num']);
  assert.equal(m.removeCell(5), false); // mimo rozsah nic nesmaže
  assert.deepEqual(m.getState().left.map((c) => c.kind), ['x', 'num']);
});

test('vymazání strany', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '5']);
  m.clearSide(); // výchozí = aktivní strana (pravá)
  assert.deepEqual(m.getState().right, []);
  assert.equal(m.getState().left.length, 3);
  m.clearSide('left');
  assert.deepEqual(m.getState().left, []);
});

test('blokace znaménka bez operandu před sebou (++, +-)', () => {
  const m = createTileBuilderModel();
  assert.equal(m.pressTile('+').status, 'blocked'); // prázdná strana
  build(m, ['x']);
  assert.equal(m.pressTile('+').status, 'added');
  assert.equal(m.pressTile('+').status, 'blocked'); // '++'
  assert.equal(m.pressTile('-').status, 'blocked'); // '+-'
  assert.equal(m.pressTile('*').status, 'blocked'); // '+·'
  assert.deepEqual(m.getState().left.map((c) => c.kind), ['x', 'op']);
});

test("blokace 'x x' a 'x' za závorkou", () => {
  const m = createTileBuilderModel();
  build(m, ['x']);
  assert.equal(m.pressTile('x').status, 'blocked'); // 'x x'
  assert.deepEqual(m.getState().left.length, 1);
  m.clearSide();
  build(m, ['(', 'x', '+', '1', ')']);
  assert.equal(m.pressTile('x').status, 'blocked'); // '(x + 1)x'
});

test('číslice za x nebo za závorkou je blokovaná (patří tam znaménko)', () => {
  const m = createTileBuilderModel();
  build(m, ['x']);
  assert.equal(m.pressDigit('3').status, 'blocked'); // 'x3'
  m.clearSide();
  build(m, ['(', 'x', '+', '1', ')']);
  assert.equal(m.pressDigit('3').status, 'blocked'); // '(x + 1)3'
});

test('závorky: zavření bez otevření i prázdná závorka jsou blokované', () => {
  const m = createTileBuilderModel();
  assert.equal(m.pressTile(')').status, 'blocked'); // bez otevření
  build(m, ['(']);
  assert.equal(m.pressTile(')').status, 'blocked'); // '()' prázdná
  build(m, ['x', '+', '1']);
  assert.equal(m.pressTile(')').status, 'added');
  // Po vyvážení už další zavření nejde
  assert.equal(m.pressTile(')').status, 'blocked');
});

test('Hotovo je zablokované, dokud nejsou obě strany neprázdné', () => {
  const m = createTileBuilderModel();
  assert.equal(m.canSubmit(), false);
  build(m, ['x', '+', '7']);
  assert.equal(m.canSubmit(), false); // pravá strana prázdná
  m.setActiveSide('right');
  build(m, ['2', '5']);
  assert.equal(m.canSubmit(), true);
});

test('round-trip: složená rovnice projde parseEquation', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '5']);
  const parsed = parseEquation(m.getTokens(), { left: lin(1, 7), right: lin(0, 25) });
  assert.equal(parsed.status, 'match');
});

test('round-trip: implicitní násobení 4x + 3 = 35', () => {
  const m = createTileBuilderModel();
  build(m, ['4', 'x', '+', '3']);
  m.setActiveSide('right');
  build(m, ['3', '5']);
  const parsed = parseEquation(m.getTokens(), { left: lin(4, 3), right: lin(0, 35) });
  assert.equal(parsed.status, 'match');
});

test('round-trip: explicitní násobení a závorka 2 · (x + 1) = 8', () => {
  const m = createTileBuilderModel();
  build(m, ['2', '*', '(', 'x', '+', '1', ')']);
  m.setActiveSide('right');
  build(m, ['8']);
  const parsed = parseEquation(m.getTokens(), { left: lin(2, 2), right: lin(0, 8) });
  assert.equal(parsed.status, 'match');
});

test('mismatch: dlaždice zůstávají pro opravu jen části', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '6']); // překlep - má být 25
  const before = m.getTokens();
  const parsed = parseEquation(before, { left: lin(1, 7), right: lin(0, 25) });
  assert.equal(parsed.status, 'mismatch');
  assert.equal(parsed.errorKind, 'equationSetup');
  // Stav se validací nezměnil - dlaždice zůstaly, hráč opraví jen chybu
  assert.deepEqual(m.getTokens(), before);
  m.removeCell(0, 'right'); // odebere celé číslo 26
  build(m, ['2', '5']);
  assert.equal(parseEquation(m.getTokens(), { left: lin(1, 7), right: lin(0, 25) }).status, 'match');
});

test('getState vrací kopii - vnější mutace stav modelu nezmění', () => {
  const m = createTileBuilderModel();
  build(m, ['x']);
  const state = m.getState();
  state.left.length = 0;
  state.active = 'right';
  assert.equal(m.getState().left.length, 1);
  assert.equal(m.getState().active, 'left');
});

test('rovnítko je v tokenech vždy právě jedno (schránky ho drží pevně)', () => {
  const m = createTileBuilderModel();
  build(m, ['x']);
  m.setActiveSide('right');
  build(m, ['5']);
  const eqs = m.getTokens().filter((t) => t.kind === 'eq');
  assert.equal(eqs.length, 1);
});

test('canSubmit: strana končící znaménkem odeslání nepustí', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+']);
  m.setActiveSide('right');
  build(m, ['5']);
  assert.equal(m.canSubmit(), false);
  // Dokončená strana projde
  m.setActiveSide('left');
  build(m, ['7']);
  assert.equal(m.canSubmit(), true);
});

test('canSubmit: neuzavřená závorka odeslání nepustí', () => {
  const m = createTileBuilderModel();
  build(m, ['(', 'x']);
  m.setActiveSide('right');
  build(m, ['5']);
  assert.equal(m.canSubmit(), false);
  m.setActiveSide('left');
  build(m, [')']);
  assert.equal(m.canSubmit(), true);
});

test('canSubmit: removeCell zanechá koncové znaménko - odeslání nepustí', () => {
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '5']);
  assert.equal(m.canSubmit(), true);
  m.removeCell(2, 'left'); // odebere '7', zůstane 'x +'
  assert.equal(m.canSubmit(), false);
});

test("canSubmit: removeCell odebere ')' a rozváží závorky - odeslání nepustí", () => {
  const m = createTileBuilderModel();
  build(m, ['2', '*', '(', 'x', '+', '1', ')']);
  m.setActiveSide('right');
  build(m, ['8']);
  assert.equal(m.canSubmit(), true);
  m.removeCell(6, 'left'); // odebere ')'
  assert.equal(m.canSubmit(), false);
});

/* --- Gate je stejně přísný jako u volného zápisu (DEC-015) --- */

test('canSubmit: rovnice bez x neprojde - stejná podmínka jako volný zápis', () => {
  const m = createTileBuilderModel();
  build(m, ['3', '+', '5']);
  m.setActiveSide('right');
  build(m, ['8']);
  assert.equal(m.canSubmit(), false, "'3 + 5 = 8' je rovnice bez neznámé");
  assert.equal(m.submitHint(), HINT_NO_X);
  assert.equal(HINT_NO_X, FREE_HINT_NO_X, 'oba buildery hlásí totéž');

  // x stačí na jedné straně
  m.clearSide();
  build(m, ['x']);
  assert.equal(m.canSubmit(), true);
  assert.equal(m.submitHint(), null);
});

test("kvadratický zápis 'x · x' se zablokuje hned při kliku", () => {
  const m = createTileBuilderModel();
  build(m, ['x', '*']);
  const blocked = m.pressTile('x');
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.note, /Dvě x se nesmí násobit/);
  assert.deepEqual(m.getState().left.map((c) => c.kind), ['x', 'op'], 'dlaždice se nepřidala');

  // i přes závorky: 2 · (x + 1) · (x + 1)
  const m2 = createTileBuilderModel();
  build(m2, ['2', '*', '(', 'x', '+', '1', ')', '*', '(']);
  assert.equal(m2.pressTile('x').status, 'blocked');

  // lineární součiny zůstávají povolené
  const ok = createTileBuilderModel();
  build(ok, ['2', '*', 'x', '+', '3', '*', 'x']);
  assert.equal(ok.getState().left.length, 7);
  const paren = createTileBuilderModel();
  build(paren, ['2', '*', '(', 'x', '+', 'x', ')']);
  assert.equal(paren.getState().left.length, 7, 'sčítání v závorce kvadratické není');
});

test('canSubmit: removeCell uprostřed strany odeslání nepustí (unparseable nevznikne)', () => {
  // '+ 7 = 25' po odebrání x
  const m = createTileBuilderModel();
  build(m, ['x', '+', '7']);
  m.setActiveSide('right');
  build(m, ['2', '5']);
  m.removeCell(0, 'left');
  assert.equal(m.canSubmit(), false, 'strana začínající znaménkem');
  assert.equal(parseEquation(m.getTokens()).status, 'unparseable', 'parser by ji odmítl');

  // 'x · 2 3 · x' po odebrání '+' je součin dvou x (kvadratický zápis)
  const m2 = createTileBuilderModel();
  build(m2, ['x', '*', '2', '+', '3', '*', 'x']);
  m2.setActiveSide('right');
  build(m2, ['1', '0']);
  assert.equal(m2.canSubmit(), true);
  m2.removeCell(3, 'left');
  assert.equal(m2.canSubmit(), false);
  assert.match(m2.submitHint(), /Dvě x se nesmí násobit/);
  assert.equal(parseEquation(m2.getTokens()).status, 'unparseable');

  // '()' po odebrání obsahu závorky
  const m3 = createTileBuilderModel();
  build(m3, ['2', '(', 'x', ')']);
  m3.setActiveSide('right');
  build(m3, ['8']);
  m3.removeCell(2, 'left');
  assert.equal(m3.canSubmit(), false, 'prázdná závorka');
  assert.equal(parseEquation(m3.getTokens()).status, 'unparseable');
});

test('DEC-015: oba buildery sestaví z x + 7 = 25 identické tokeny a status match', () => {
  const tiles = createTileBuilderModel();
  build(tiles, ['x', '+', '7']);
  tiles.setActiveSide('right');
  build(tiles, ['2', '5']);

  const free = createFreeEquationModel();
  for (const key of ['x', '+', '7', '=', '2', '5']) {
    const result = /^[0-9]$/.test(key)
      ? free.pressDigit(key)
      : key === 'x'
        ? free.pressX()
        : key === '+'
          ? free.pressOp('+')
          : free.pressEq();
    assert.equal(result.status, 'added');
  }

  assert.deepEqual(free.getTokens(), tiles.getTokens(), 'stejný token stream');
  assert.equal(tiles.canSubmit(), true);
  assert.equal(free.canSubmit(), true);
  const expected = { left: lin(1, 7), right: lin(0, 25) };
  assert.equal(parseEquation(tiles.getTokens(), expected).status, 'match');
  assert.equal(parseEquation(free.getTokens(), expected).status, 'match');
});

test('submitHint: hlášky jsou konkrétní, české a nikdy neprozradí rovnici', () => {
  const cases = [
    { script: [], hint: 'Na obou stranách rovnice musí něco být.' },
    { script: ['x', '+'], hint: 'Rovnice není dopsaná - za znaménkem ještě něco chybí.' },
    { script: ['2', '(', 'x'], hint: 'Zavři závorku - ke každé otevřené patří zavřená.' },
    { script: ['3'], hint: HINT_NO_X },
  ];
  for (const { script, hint } of cases) {
    const m = createTileBuilderModel();
    build(m, script);
    m.setActiveSide('right');
    build(m, ['5']);
    assert.equal(m.submitHint(), hint, `scénář ${script.join(' ') || '(prázdno)'}`);
    assert.doesNotMatch(m.submitHint(), /\d/, 'hláška nesmí obsahovat čísla ze zadání');
  }
});
