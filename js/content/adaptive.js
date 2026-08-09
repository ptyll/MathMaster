/**
 * Adaptivní obtížnost (UCN-MATH-006, DEC-007).
 * Skrytá před hráčem - žádné "jde ti to špatně", jen se tiše
 * přizpůsobí další příklad. Obtížnost se mění max o 1 úroveň.
 */

export const MIN_DIFFICULTY = 1;
/**
 * Šest stupňů kvůli rovnicím: 1-2 jednoduché, 3 ax=b, 4 ax+b=c,
 * 5 závorky, 6 x na obou stranách. Zlomky si stupnici samy zkracují
 * na 3 (viz generateForTopic), takže je vyšší strop neovlivní.
 */
export const MAX_DIFFICULTY = 6;

/**
 * Doporučí obtížnost dalšího příkladu.
 * @param {{correct: boolean, hintUsed: boolean}[]} history poslední odpovědi v tématu
 * @param {number} currentDifficulty aktuální obtížnost
 * @returns {number} doporučená obtížnost (1-4)
 */
export function nextDifficulty(history, currentDifficulty) {
  const last3 = history.slice(-3);
  if (
    last3.length === 3 &&
    last3.every((h) => h.correct && !h.hintUsed) &&
    currentDifficulty < MAX_DIFFICULTY
  ) {
    return currentDifficulty + 1;
  }

  const last2 = history.slice(-2);
  if (
    last2.length === 2 &&
    last2.every((h) => !h.correct) &&
    currentDifficulty > MIN_DIFFICULTY
  ) {
    return currentDifficulty - 1;
  }

  return currentDifficulty;
}

/** Po dvou chybách v řadě se má automaticky nabídnout nápověda. */
export function shouldOfferHint(history) {
  const last2 = history.slice(-2);
  return last2.length === 2 && last2.every((h) => !h.correct);
}
