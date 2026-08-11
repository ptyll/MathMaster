/**
 * Volný zápis rovnice na rozšířené klávesnici - DOM vrstva (UCV-INPUT-004).
 * Logika (stav zápisu, pravidla kláves, výstup tokenů) je
 * v js/ui/freeEquationModel.js, validace v js/content/equationParse.js.
 *
 * Rozložení: nahoře zadání slovní úlohy, pod ním jednořádkové vstupní pole
 * se sestavenou rovnicí velkým písmem, dole klávesnice (číslice, + − ·, x,
 * závorky, zlomková čára, =, backspace, Hotovo). Na PC funguje i hardwarová
 * klávesnice. Dotykové cíle min. 56 px.
 *
 * Hotovo pošle tokeny do parseEquation(tokens, expected):
 *  - mismatch/unparseable: zvýraznění pole + zatřesení + laskavá hláška,
 *    zápis ZŮSTÁVÁ k opravě (hráč přepíše jen chybnou část),
 *  - match/ok: hláška (případná poznámka o jednodušším tvaru) a předání
 *    řízení přes onSubmit - přechod do krokového režimu řeší misní
 *    integrace (UCV-MISSION-003, pozdější fáze).
 *
 * Rozhraní pro misi (fáze 6, DEC-014): createFreeEquationInput(host, {
 *   problemText,          text zadání slovní úlohy
 *   expected,             rovnice { left, right } z generátoru (UCN-MATH-007)
 *   onSubmit(result, tokens)  zavolá se při každém Hotovo; mise podle
 *                         result.status přejde do krokového režimu
 *                         (start z result.multiTerm ?? result.canonical)
 * }) -> { element, getTokens, destroy }
 */

import { createFreeEquationModel } from './freeEquationModel.js';
import { parseEquation } from '../content/equationParse.js';

const PLACEHOLDER = 'Napiš rovnici, např. x + 7 = 25';

/** Klávesnice ve dvou řadách: číslice nahoře, symboly pod nimi. */
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => ({ label: digit, digit })),
  [
    { label: 'x', press: 'x' },
    { label: '+', press: 'op', arg: '+' },
    { label: '−', press: 'minus', aria: 'Minus' },
    { label: '·', press: 'op', arg: '*', aria: 'Krát' },
    { label: '(', press: 'lparen', aria: 'Otevřít závorku' },
    { label: ')', press: 'rparen', aria: 'Zavřít závorku' },
    { label: '/', press: 'fraction', aria: 'Zlomková čára' },
    { label: '=', press: 'eq', key: 'eq' },
    { label: '⌫', press: 'backspace', aria: 'Smazat' },
  ],
];

/**
 * @param {HTMLElement} container kam se vstup vykreslí
 * @param {object} options
 * @param {string} options.problemText text zadání slovní úlohy
 * @param {{left: object, right: object}} options.expected rovnice z generátoru
 * @param {(result: object, tokens: object[]) => void} [options.onSubmit] hák pro misi
 * @returns {{ element: HTMLElement, getTokens: () => object[], destroy: () => void }}
 */
export function createFreeEquationInput(container, { problemText, expected, onSubmit = null }) {
  const model = createFreeEquationModel();

  const root = document.createElement('div');
  root.className = 'free-eq';

  const problemEl = document.createElement('p');
  problemEl.className = 'free-eq-problem';
  problemEl.textContent = problemText;

  // --- Vstupní pole: jednořádkový přehled sestavené rovnice ---
  const displayEl = document.createElement('p');
  displayEl.className = 'free-eq-display';
  displayEl.setAttribute('aria-live', 'polite');

  // Zpětná vazba patří k místu, kde hráč pracuje - pod pole, ne nahoru.
  const feedbackEl = document.createElement('p');
  feedbackEl.className = 'free-eq-feedback';
  feedbackEl.setAttribute('aria-live', 'assertive');

  // --- Klávesnice ---
  const keypadEl = document.createElement('div');
  keypadEl.className = 'free-eq-keypad';
  keypadEl.setAttribute('role', 'group');
  keypadEl.setAttribute('aria-label', 'Klávesnice pro zápis rovnice');

  /** Klávesa '=' - potřebujeme na ni odkaz pro vypnutí po prvním použití. */
  let eqBtn = null;

  for (const row of KEY_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'free-eq-keypad-row';
    for (const key of row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'free-eq-key';
      btn.textContent = key.label;
      btn.setAttribute('aria-label', key.aria ?? key.label);
      btn.addEventListener('click', () => pressKey(key));
      if (key.key === 'eq') {
        eqBtn = btn;
      }
      rowEl.appendChild(btn);
    }
    keypadEl.appendChild(rowEl);
  }

  // --- Akce dole: Hotovo + nápis u zablokovaného tlačítka ---
  const actionsEl = document.createElement('div');
  actionsEl.className = 'free-eq-actions';

  const hintEl = document.createElement('span');
  hintEl.className = 'free-eq-submit-hint';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary free-eq-submit';
  submitBtn.textContent = 'Hotovo';
  submitBtn.addEventListener('click', handleSubmit);

  actionsEl.append(hintEl, submitBtn);

  root.append(problemEl, displayEl, feedbackEl, keypadEl, actionsEl);
  container.appendChild(root);

  function pressKey(key) {
    let result;
    if (key.digit) {
      result = model.pressDigit(key.digit);
    } else {
      switch (key.press) {
        case 'x':
          result = model.pressX();
          break;
        case 'op':
          result = model.pressOp(key.arg);
          break;
        case 'minus':
          result = model.pressMinus();
          break;
        case 'lparen':
          result = model.pressLparen();
          break;
        case 'rparen':
          result = model.pressRparen();
          break;
        case 'fraction':
          result = model.pressFractionBar();
          break;
        case 'eq':
          result = model.pressEq();
          break;
        default:
          model.pressBackspace();
          result = null;
      }
    }
    if (result && result.status === 'blocked') {
      setFeedback(result.note, null);
      return;
    }
    setFeedback(null);
    // Jakýkoliv pokrok v zápisu zruší zvýraznění z minulé validace.
    displayEl.classList.remove('is-wrong');
    render();
  }

  /** Zpráva pro hráče u místa, kde právě klikal. */
  function setFeedback(text, tone) {
    feedbackEl.textContent = text ?? '';
    feedbackEl.classList.toggle('is-wrong', tone === 'wrong');
    feedbackEl.classList.toggle('is-good', tone === 'good');
  }

  function render() {
    const state = model.getState();
    if (state.displayText === '') {
      displayEl.textContent = PLACEHOLDER;
      displayEl.classList.add('is-empty');
    } else {
      displayEl.textContent = state.displayText;
      displayEl.classList.remove('is-empty');
    }
    eqBtn.disabled = state.eqUsed;
    submitBtn.disabled = !state.canSubmit;
    // Nápis u zablokovaného Hotovo ('Rovnice musí obsahovat x') - dokud hráč
    // nic nenapsal, prázdný stav mluví placeholder a nápis by byl hluk.
    hintEl.textContent = !state.canSubmit && state.displayText !== '' ? state.submitHint : '';
  }

  /** Zatřesení polem po špatné validaci - zápis zůstává k opravě. */
  function shake() {
    displayEl.classList.remove('is-shaking');
    // Restart animace, když hráč klepne Hotovo dvakrát za sebou.
    void displayEl.offsetWidth;
    displayEl.classList.add('is-shaking');
  }

  function handleSubmit() {
    if (!model.canSubmit()) {
      return;
    }
    const tokens = model.getTokens();
    const result = parseEquation(tokens, expected);
    if (result.status === 'match' || result.status === 'ok') {
      // Poznámka o jednodušším tvaru (násobek rovnice) není chyba.
      displayEl.classList.remove('is-wrong');
      setFeedback(result.note, result.note ? 'good' : null);
    } else {
      displayEl.classList.add('is-wrong');
      shake();
      setFeedback(result.note, 'wrong');
    }
    if (onSubmit) {
      onSubmit(result, tokens);
    }
  }

  // Hardwarová klávesnice na PC (Enter = Hotovo).
  const keyboardHandler = (event) => {
    const keyMap = {
      '+': () => model.pressOp('+'),
      '-': () => model.pressMinus(),
      '*': () => model.pressOp('*'),
      '(': () => model.pressLparen(),
      ')': () => model.pressRparen(),
      '/': () => model.pressFractionBar(),
      '=': () => model.pressEq(),
      x: () => model.pressX(),
      Backspace: () => model.pressBackspace(),
    };
    if (/^[0-9]$/.test(event.key)) {
      pressKey({ digit: event.key });
      event.preventDefault();
    } else if (keyMap[event.key]) {
      // Stejná cesta jako dotyk - blocked hlášky fungují i z hardwaru.
      const result = keyMap[event.key]();
      if (result && result.status === 'blocked') {
        setFeedback(result.note, null);
      } else {
        setFeedback(null);
        displayEl.classList.remove('is-wrong');
      }
      render();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      // Enter mířící na jiné tlačítko obrazovky necháme jemu.
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('button') && !root.contains(target)) {
        return;
      }
      if (!submitBtn.disabled) {
        event.preventDefault();
        handleSubmit();
      }
    }
  };
  document.addEventListener('keydown', keyboardHandler);

  displayEl.addEventListener('animationend', () => displayEl.classList.remove('is-shaking'));

  render();

  return {
    element: root,
    getTokens: () => model.getTokens(),
    destroy() {
      document.removeEventListener('keydown', keyboardHandler);
      root.remove();
    },
  };
}
