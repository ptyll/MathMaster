/**
 * Model vstupu odpovědi - čistá logika bez DOM (testovatelná v nodu).
 * DOM vrstvu řeší js/ui/answerInput.js a js/ui/keypad.js.
 *
 * Režim 'int': celé číslo (volitelně záporné).
 * Režim 'fraction': čitatel/jmenovatel, minus patří celému zlomku.
 */

import { makeFraction, fractionsEqual, isSimplified } from '../content/fractions.js';

export const INPUT_MODES = Object.freeze({ INT: 'int', FRACTION: 'fraction' });

/**
 * @param {'int'|'fraction'} [initialMode]
 */
export function createAnswerModel(initialMode = INPUT_MODES.INT) {
  let mode = initialMode;
  let negative = false;
  let numerator = '';   // v režimu int = celá hodnota
  let denominator = '';
  let activeField = 'numerator'; // 'numerator' | 'denominator'

  const active = () => (activeField === 'numerator' ? numerator : denominator);
  const setActive = (v) => {
    if (activeField === 'numerator') {
      numerator = v;
    } else {
      denominator = v;
    }
  };

  /**
   * Chybová hláška validace, nebo null když je vstup v pořádku.
   * Jmenovatel 0 -> 'Nulou se nedělí' (UCV-INPUT-002).
   */
  const validationError = () => {
    if (numerator === '') {
      return 'Napiš odpověď';
    }
    if (mode === INPUT_MODES.FRACTION) {
      if (denominator === '') {
        return 'Doplň jmenovatele';
      }
      if (denominator === '0') {
        return 'Nulou se nedělí';
      }
    }
    return null;
  };

  return {
    get mode() {
      return mode;
    },
    get negative() {
      return negative;
    },
    get numerator() {
      return numerator;
    },
    get denominator() {
      return denominator;
    },
    get activeField() {
      return activeField;
    },

    setActiveField(field) {
      if (field !== 'numerator' && field !== 'denominator') {
        throw new Error(`Neznámé pole: ${field}`);
      }
      activeField = field;
    },

    /** Přepne celé číslo / zlomek. Obsah polí se zachová. */
    toggleMode() {
      mode = mode === INPUT_MODES.INT ? INPUT_MODES.FRACTION : INPUT_MODES.INT;
      activeField = 'numerator';
    },

    /** Nastaví režim explicitně (např. při resetu na nový typ příkladu). */
    setMode(newMode) {
      if (newMode !== INPUT_MODES.INT && newMode !== INPUT_MODES.FRACTION) {
        throw new Error(`Neznámý režim: ${newMode}`);
      }
      mode = newMode;
      activeField = 'numerator';
    },

    pressDigit(digit) {
      if (!/^[0-9]$/.test(digit)) {
        throw new Error(`Neplatná číslice: ${digit}`);
      }
      const current = active();
      // Vedoucí nuly nahradíme (07 -> 7), jinak max 4 číslice na pole.
      if (current === '0') {
        setActive(digit);
      } else if (current.length < 4) {
        setActive(current + digit);
      }
    },

    /** Minus přepíná znaménko celé odpovědi. */
    pressMinus() {
      negative = !negative;
    },

    pressBackspace() {
      setActive(active().slice(0, -1));
    },

    clear() {
      negative = false;
      numerator = '';
      denominator = '';
      activeField = 'numerator';
    },

    isEmpty() {
      return numerator === '' && (mode === INPUT_MODES.INT || denominator === '');
    },

    validationError,

    /**
     * Aktuální hodnota odpovědi, nebo null při nevalidním vstupu.
     * Zlomek s jmenovatelem 1 se normalizuje na celé číslo.
     */
    getValue() {
      if (validationError() !== null) {
        return null;
      }
      const sign = negative ? -1 : 1;
      if (mode === INPUT_MODES.INT) {
        return { kind: 'int', value: sign * parseInt(numerator, 10) };
      }
      const f = makeFraction(sign * parseInt(numerator, 10), parseInt(denominator, 10));
      return f.d === 1
        ? { kind: 'int', value: f.n }
        : { kind: 'fraction', n: f.n, d: f.d };
    },

    /**
     * Vyhodnotí odpověď proti očekávané (z generátoru).
     * Nevykrácený zlomek = správně s poznámkou 'zkus zkrátit' (UCV-INPUT-002).
     * @returns {{status: 'correct'|'correct-unsimplified'|'wrong'|'invalid', note: string|null}}
     */
    evaluate(expected) {
      const error = validationError();
      if (error !== null) {
        return { status: 'invalid', note: error };
      }
      if (expected.kind === 'choice') {
        return { status: 'wrong', note: null }; // choice se hodnotí mimo tento model
      }
      const expectedFraction =
        expected.kind === 'int' ? makeFraction(expected.value) : makeFraction(expected.n, expected.d);

      const sign = negative ? -1 : 1;
      const givenN = sign * parseInt(numerator, 10);
      const givenD = mode === INPUT_MODES.FRACTION ? parseInt(denominator, 10) : 1;

      if (!fractionsEqual({ n: givenN, d: givenD }, expectedFraction)) {
        return { status: 'wrong', note: null };
      }
      // 0/cokoliv je prostě 0 - u nuly krácení nedává smysl.
      if (
        givenN !== 0 &&
        mode === INPUT_MODES.FRACTION &&
        !isSimplified({ n: givenN, d: givenD })
      ) {
        return { status: 'correct-unsimplified', note: 'Správně! A jde to ještě zkrátit?' };
      }
      return { status: 'correct', note: null };
    },
  };
}
