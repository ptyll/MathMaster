/**
 * Vizuální vstup odpovědi (UCV-INPUT-001 + UCV-INPUT-002).
 * Kombinuje model (inputModel.js), zobrazení celého čísla / zlomku
 * (čitatel nad čarou, jmenovatel pod ní), přepínač režimu,
 * číselnou klávesnici a tlačítko Potvrdit.
 */

import { createAnswerModel, INPUT_MODES } from './inputModel.js';
import { createKeypad } from './keypad.js';

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object|null} options.expected očekávaná odpověď z generátoru (kind: int|fraction).
 *   null = vstup nevyhodnocuje a jen předá zadanou hodnotu se statusem 'value';
 *   posouzení si dělá volající (krokový režim, UCV-STEP-001).
 * @param {'int'|'fraction'} [options.mode] počáteční režim
 * @param {boolean} [options.allowModeToggle] přepínač celé číslo / zlomek
 * @param {boolean} [options.allowSign] přepínač znaménka. U operandu kroku se
 *   vypíná - směr už určuje zvolená operace a druhé znaménko by jen mátlo.
 * @param {string} [options.confirmLabel] popisek potvrzovacího tlačítka
 * @param {(result: {status: string, note: string|null, value: object|null}) => void} options.onSubmit
 *   status: 'correct' | 'correct-unsimplified' | 'wrong' | 'invalid' | 'value'
 */
export function createAnswerInput(
  container,
  {
    expected = null,
    mode = 'int',
    allowModeToggle = true,
    allowSign = true,
    confirmLabel = 'Potvrdit',
    onSubmit,
  }
) {
  const model = createAnswerModel(mode);
  let submitted = false; // pojistka proti dvojitému odeslání

  const root = document.createElement('div');
  root.className = 'answer-input';

  // --- Zobrazení odpovědi (číslo nebo zlomek) ---
  const display = document.createElement('div');
  display.className = 'answer-display';

  const signEl = document.createElement('button');
  signEl.type = 'button';
  signEl.className = 'answer-sign';
  signEl.setAttribute('aria-pressed', 'false');

  const numBtn = document.createElement('button');
  numBtn.type = 'button';
  numBtn.className = 'answer-field answer-numerator';

  const bar = document.createElement('div');
  bar.className = 'fraction-bar';

  const denBtn = document.createElement('button');
  denBtn.type = 'button';
  denBtn.className = 'answer-field answer-denominator';

  const fractionWrap = document.createElement('div');
  fractionWrap.className = 'fraction-fields';
  fractionWrap.append(numBtn, bar, denBtn);

  display.append(signEl, fractionWrap);

  // --- Přepínač režimu ---
  let toggleBtn = null;
  if (allowModeToggle) {
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-toggle-mode';
    display.appendChild(toggleBtn);
  }

  // --- Chybová hláška validace ---
  const errorEl = document.createElement('p');
  errorEl.className = 'answer-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;

  // --- Klávesnice + potvrdit ---
  const keypadHost = document.createElement('div');
  const keypad = createKeypad(keypadHost, {
    onDigit: (d) => {
      model.pressDigit(d);
      afterInput();
    },
    onMinus: () => {
      if (!allowSign) {
        return; // znaménko je vypnuté, klávesa i tlačítko musí být bez efektu
      }
      model.pressMinus();
      afterInput();
    },
    onBackspace: () => {
      model.pressBackspace();
      afterInput();
    },
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary btn-confirm';
  confirmBtn.textContent = confirmLabel;
  confirmBtn.disabled = true;

  root.append(display, errorEl, keypadHost, confirmBtn);
  container.appendChild(root);

  function render() {
    const isFraction = model.mode === INPUT_MODES.FRACTION;
    signEl.hidden = !allowSign;
    signEl.textContent = model.negative ? '−' : '+';
    signEl.classList.toggle('is-negative', model.negative);
    signEl.setAttribute('aria-pressed', String(model.negative));
    signEl.setAttribute(
      'aria-label',
      model.negative ? 'Znaménko: minus, klepnutím přepneš na plus' : 'Znaménko: plus, klepnutím přepneš na minus'
    );

    numBtn.textContent = model.numerator || '?';
    numBtn.classList.toggle('is-empty', model.numerator === '');
    numBtn.classList.toggle('is-active', isFraction && model.activeField === 'numerator');
    numBtn.setAttribute('aria-label', `${isFraction ? 'Čitatel' : 'Odpověď'}: ${model.numerator || 'prázdné'}`);
    numBtn.setAttribute('aria-current', isFraction && model.activeField === 'numerator' ? 'true' : 'false');

    bar.hidden = !isFraction;
    denBtn.hidden = !isFraction;
    denBtn.textContent = model.denominator || '?';
    denBtn.classList.toggle('is-empty', model.denominator === '');
    denBtn.classList.toggle('is-active', isFraction && model.activeField === 'denominator');
    denBtn.setAttribute('aria-label', `Jmenovatel: ${model.denominator || 'prázdné'}`);
    denBtn.setAttribute('aria-current', isFraction && model.activeField === 'denominator' ? 'true' : 'false');

    if (toggleBtn) {
      toggleBtn.textContent = isFraction ? 'Celé číslo' : 'Zlomek';
      toggleBtn.setAttribute(
        'aria-label',
        isFraction ? 'Přepnout na celé číslo' : 'Přepnout na zlomek'
      );
    }

    const error = model.validationError();
    const showError = error !== null && error !== 'Napiš odpověď';
    errorEl.hidden = !showError;
    errorEl.textContent = showError ? error : '';

    // Nevalidní (neúplný špatný) vstup nejde odeslat vůbec.
    confirmBtn.disabled = model.validationError() !== null || submitted;
  }

  function afterInput() {
    submitted = false;
    render();
  }

  signEl.addEventListener('click', () => {
    model.pressMinus();
    afterInput();
  });
  numBtn.addEventListener('click', () => {
    model.setActiveField('numerator');
    render();
  });
  denBtn.addEventListener('click', () => {
    model.setActiveField('denominator');
    render();
  });
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      model.toggleMode();
      afterInput();
    });
  }
  confirmBtn.addEventListener('click', () => {
    if (confirmBtn.disabled) {
      return;
    }
    if (expected === null) {
      // Vyhodnocení si dělá volající; zamkneme proti dvojímu odeslání
      // a odemkne se přes unlock() nebo reset().
      submitted = true;
      const value = model.getValue();
      render();
      onSubmit({ status: 'value', note: null, value });
      return;
    }
    const result = model.evaluate(expected);
    if (result.status === 'correct' || result.status === 'correct-unsimplified') {
      submitted = true; // po správné odpovědi zamknout (dvojité klepnutí odešle jednou)
    }
    render();
    onSubmit({ status: result.status, note: result.note, value: model.getValue() });
  });

  // Hardwarová klávesnice na PC (Enter = potvrdit).
  const detachKeyboard = keypad.attachKeyboard(document);
  const enterHandler = (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    // Enter mířící na jiné tlačítko obrazovky necháme jemu (např. "Dokončit misi").
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button') && !root.contains(target)) {
      return;
    }
    if (!confirmBtn.disabled) {
      event.preventDefault();
      confirmBtn.click();
    }
  };
  document.addEventListener('keydown', enterHandler);

  render();

  return {
    element: root,
    model,
    /** Reset pro další příklad; volitelně nastaví režim nového příkladu. */
    reset(newMode) {
      model.clear();
      if (newMode) {
        model.setMode(newMode);
      }
      submitted = false;
      render();
    },
    /** Odemkne po odeslání, ale nechá zadanou hodnotu - hráč ji jen opraví. */
    unlock() {
      submitted = false;
      render();
    },
    /** Vrátí fokus na potvrzení - po chybě ať hráč nehledá, kde pokračovat. */
    focus() {
      numBtn.focus();
    },
    /** Uvolní posluchače klávesnice. */
    destroy() {
      detachKeyboard();
      document.removeEventListener('keydown', enterHandler);
      root.remove();
    },
  };
}
