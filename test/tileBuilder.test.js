import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTileBuilderModel, MAX_NUM_DIGITS } from '../js/ui/tileBuilderModel.js';
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
