import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextDifficulty, shouldOfferHint, MAX_DIFFICULTY } from '../js/content/adaptive.js';

test('TDD-MATH-006-A: 3 správné v řadě bez nápovědy zvýší obtížnost', () => {
  const history = [
    { correct: true, hintUsed: false },
    { correct: true, hintUsed: false },
    { correct: true, hintUsed: false },
  ];
  assert.equal(nextDifficulty(history, 2), 3);
});

test('série úspěchů nepřeleze strop obtížnosti', () => {
  const history = [
    { correct: true, hintUsed: false },
    { correct: true, hintUsed: false },
    { correct: true, hintUsed: false },
  ];
  // Strop je 6 kvůli rovnicím se závorkami a s x na obou stranách.
  assert.equal(nextDifficulty(history, MAX_DIFFICULTY), MAX_DIFFICULTY);
  assert.equal(nextDifficulty(history, MAX_DIFFICULTY - 1), MAX_DIFFICULTY);
});

test('úspěch s nápovědou obtížnost nezvýší', () => {
  const history = [
    { correct: true, hintUsed: false },
    { correct: true, hintUsed: true },
    { correct: true, hintUsed: false },
  ];
  assert.equal(nextDifficulty(history, 2), 2);
});

test('TDD-MATH-006-B: 2 chyby v řadě sníží obtížnost o 1', () => {
  const history = [
    { correct: true, hintUsed: false },
    { correct: false, hintUsed: false },
    { correct: false, hintUsed: false },
  ];
  assert.equal(nextDifficulty(history, 3), 2);
});

test('obtížnost nikdy neklesne pod 1', () => {
  const history = [
    { correct: false, hintUsed: false },
    { correct: false, hintUsed: false },
  ];
  assert.equal(nextDifficulty(history, 1), 1);
});

test('krátká nebo smíšená historie obtížnost nemění', () => {
  assert.equal(nextDifficulty([], 2), 2);
  assert.equal(nextDifficulty([{ correct: false, hintUsed: false }], 2), 2);
  assert.equal(
    nextDifficulty(
      [
        { correct: false, hintUsed: false },
        { correct: true, hintUsed: false },
      ],
      2
    ),
    2
  );
});

test('shouldOfferHint: po dvou chybách v řadě ano', () => {
  assert.ok(
    shouldOfferHint([
      { correct: false, hintUsed: false },
      { correct: false, hintUsed: true },
    ])
  );
  assert.ok(!shouldOfferHint([{ correct: false, hintUsed: false }]));
  assert.ok(
    !shouldOfferHint([
      { correct: false, hintUsed: false },
      { correct: true, hintUsed: false },
    ])
  );
});
