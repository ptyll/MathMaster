import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAnswerModel } from '../js/ui/inputModel.js';

test('zadání celého čísla přes číslice', () => {
  const m = createAnswerModel('int');
  m.pressDigit('1');
  m.pressDigit('2');
  assert.equal(m.numerator, '12');
  assert.deepEqual(m.getValue(), { kind: 'int', value: 12 });
});

test('vedoucí nula se nahradí a pole má max 4 číslice', () => {
  const m = createAnswerModel('int');
  m.pressDigit('0');
  m.pressDigit('7');
  assert.equal(m.numerator, '7');
  m.pressDigit('1');
  m.pressDigit('2');
  m.pressDigit('3');
  m.pressDigit('9'); // 5. číslice se ignoruje
  assert.equal(m.numerator, '7123');
});

test('minus přepíná znaménko', () => {
  const m = createAnswerModel('int');
  m.pressDigit('5');
  m.pressMinus();
  assert.deepEqual(m.getValue(), { kind: 'int', value: -5 });
  m.pressMinus();
  assert.deepEqual(m.getValue(), { kind: 'int', value: 5 });
});

test('backspace maže aktivní pole', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('1');
  m.pressDigit('2');
  m.pressBackspace();
  assert.equal(m.numerator, '1');
});

test('TDD-INPUT-002-A: zadání 3/4 přes zlomkový vstup', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('3');
  m.setActiveField('denominator');
  m.pressDigit('4');
  assert.deepEqual(m.getValue(), { kind: 'fraction', n: 3, d: 4 });
});

test('TDD-INPUT-002-B: nulový jmenovatel je odmítnut s vysvětlením', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('3');
  m.setActiveField('denominator');
  m.pressDigit('0');
  assert.equal(m.validationError(), 'Nulou se nedělí');
  assert.equal(m.getValue(), null);
  assert.equal(m.evaluate({ kind: 'int', value: 3 }).status, 'invalid');
});

test('přepínač celé číslo / zlomek zachová obsah a vrátí focus na čitatele', () => {
  const m = createAnswerModel('int');
  m.pressDigit('3');
  m.toggleMode();
  assert.equal(m.mode, 'fraction');
  assert.equal(m.numerator, '3');
  assert.equal(m.activeField, 'numerator');
});

test('prázdná odpověď a chybějící jmenovatel nejsou validní', () => {
  const m = createAnswerModel('int');
  assert.ok(m.isEmpty());
  assert.equal(m.validationError(), 'Napiš odpověď');

  m.pressDigit('3');
  m.toggleMode();
  assert.equal(m.validationError(), 'Doplň jmenovatele');
});

test('zlomek s jmenovatelem 1 se normalizuje na celé číslo', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('6');
  m.setActiveField('denominator');
  m.pressDigit('1');
  assert.deepEqual(m.getValue(), { kind: 'int', value: 6 });
});

test('evaluate: správně / špatně / nevykrácený zlomek', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('4');
  m.setActiveField('denominator');
  m.pressDigit('8');

  const expected = { kind: 'fraction', n: 1, d: 2 };
  const result = m.evaluate(expected);
  assert.equal(result.status, 'correct-unsimplified');
  assert.equal(result.note, 'Správně! A jde to ještě zkrátit?');

  const m2 = createAnswerModel('fraction');
  m2.pressDigit('1');
  m2.setActiveField('denominator');
  m2.pressDigit('2');
  assert.equal(m2.evaluate(expected).status, 'correct');

  const m3 = createAnswerModel('int');
  m3.pressDigit('5');
  assert.equal(m3.evaluate(expected).status, 'wrong');
});

test('evaluate: celé číslo proti zlomkové odpovědi a naopak', () => {
  const m = createAnswerModel('int');
  m.pressDigit('2');
  assert.equal(m.evaluate({ kind: 'fraction', n: 4, d: 2 }).status, 'correct');

  const m2 = createAnswerModel('fraction');
  m2.pressDigit('4');
  m2.setActiveField('denominator');
  m2.pressDigit('2');
  // 4/2 je správná hodnota, ale nevykrácená - odpověď se uzná s poznámkou.
  assert.equal(m2.evaluate({ kind: 'int', value: 2 }).status, 'correct-unsimplified');
});

test('záporný zlomek', () => {
  const m = createAnswerModel('fraction');
  m.pressMinus();
  m.pressDigit('1');
  m.setActiveField('denominator');
  m.pressDigit('2');
  assert.deepEqual(m.getValue(), { kind: 'fraction', n: -1, d: 2 });
});

test('clear resetuje vstup', () => {
  const m = createAnswerModel('fraction');
  m.pressMinus();
  m.pressDigit('3');
  m.setActiveField('denominator');
  m.pressDigit('4');
  m.clear();
  assert.ok(m.isEmpty());
  assert.equal(m.negative, false);
  assert.equal(m.activeField, 'numerator');
});

test('setMode nastaví režim explicitně a hodí výjimku u neznámého', () => {
  const m = createAnswerModel('int');
  m.setMode('fraction');
  assert.equal(m.mode, 'fraction');
  assert.throws(() => m.setMode('decimal'), /Neznámý režim/);
});

test('0/5 se hodnotí jako správně (nula se nekrátí)', () => {
  const m = createAnswerModel('fraction');
  m.pressDigit('0');
  m.setActiveField('denominator');
  m.pressDigit('5');
  assert.equal(m.evaluate({ kind: 'int', value: 0 }).status, 'correct');
});

test('destrukturované metody fungují (žádné this)', () => {
  const m = createAnswerModel('int');
  const { getValue, validationError } = m;
  m.pressDigit('9');
  assert.equal(validationError(), null);
  assert.deepEqual(getValue(), { kind: 'int', value: 9 });
});
