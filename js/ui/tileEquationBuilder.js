/**
 * Dlaždicové skládání rovnice - DOM vrstva (UCV-INPUT-003).
 * Logika (stav schránek, pravidla přidání/odebrání, výstup tokenů) je
 * v js/ui/tileBuilderModel.js, validace v js/content/equationParse.js.
 *
 * Rozložení: nahoře zadání slovní úlohy, pod ním dvě schránky spojené
 * pevným '=', pod nimi paleta dlaždic ve dvou řadách (min. 56 px dotyk),
 * dole tlačítko Hotovo. Dlaždice se přidá klikem z palety na konec
 * aktivní strany, klikem ve schránce se odebere; klik na schránku ji
 * aktivuje. Dlouhá strana ve schránce roluje vodorovně, dlaždice se
 * nikdy nezmenšují pod dotykové minimum.
 *
 * Hotovo pošle tokeny do parseEquation(tokens, expected):
 *  - mismatch/unparseable: zatřesení + laskavá hláška, dlaždice ZŮSTÁVAJÍ
 *    pro opravu (hráč překliká jen chybnou část),
 *  - match/ok: hláška (případná poznámka o jednodušším tvaru) a předání
 *    řízení přes onSubmit - přechod do krokového režimu řeší misní
 *    integrace (UCV-MISSION-003, pozdější fáze).
 *
 * Rozhraní pro misi (fáze 6): createTileEquationBuilder(host, {
 *   problemText,          text zadání slovní úlohy
 *   expected,             rovnice { left, right } z generátoru (UCN-MATH-007)
 *   onSubmit(result, tokens)  zavolá se při každém Hotovo; mise podle
 *                         result.status přejde do krokového režimu
 *                         (start z result.multiTerm ?? result.canonical)
 * }) -> { element, getTokens, destroy }
 */

import { createTileBuilderModel } from './tileBuilderModel.js';
import { parseEquation } from '../content/equationParse.js';

const SIDE_HINTS = { left: 'Sem slož levou stranu', right: 'Sem slož pravou stranu' };

/** Zobrazení buňky na dlaždici (UI tvary symbolů, ne parserové). */
const CELL_LABELS = { x: 'x', lparen: '(', rparen: ')' };
const OP_LABELS = { '+': '+', '-': '−', '*': '·' };

/** Paleta ve dvou řadách: číslice nahoře, symboly pod nimi. */
const PALETTE_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => ({ label: digit, digit })),
  [
    { label: 'x', symbol: 'x' },
    { label: '+', symbol: '+' },
    { label: '−', symbol: '-', aria: 'Minus' },
    { label: '·', symbol: '*', aria: 'Krát' },
    { label: '(', symbol: '(', aria: 'Otevřít závorku' },
    { label: ')', symbol: ')', aria: 'Zavřít závorku' },
  ],
];

/**
 * @param {HTMLElement} container kam se builder vykreslí
 * @param {object} options
 * @param {string} options.problemText text zadání slovní úlohy
 * @param {{left: object, right: object}} options.expected rovnice z generátoru
 * @param {(result: object, tokens: object[]) => void} [options.onSubmit] hák pro misi
 * @returns {{ element: HTMLElement, getTokens: () => object[], destroy: () => void }}
 */
export function createTileEquationBuilder(container, { problemText, expected, onSubmit = null }) {
  const model = createTileBuilderModel();

  const root = document.createElement('div');
  root.className = 'tile-builder';

  const problemEl = document.createElement('p');
  problemEl.className = 'tile-problem';
  problemEl.textContent = problemText;

  // --- Schránky levá = pravá ---
  const boxesEl = document.createElement('div');
  boxesEl.className = 'tile-boxes';
  boxesEl.setAttribute('role', 'group');
  boxesEl.setAttribute('aria-label', 'Sestav rovnici z dlaždic');

  const eqEl = document.createElement('span');
  eqEl.className = 'tile-eq';
  eqEl.textContent = '=';
  eqEl.setAttribute('aria-hidden', 'true');

  /** @type {{ left: HTMLElement, right: HTMLElement }} */
  const boxEls = {};
  for (const sideName of ['left', 'right']) {
    const box = document.createElement('div');
    box.className = 'tile-box';
    box.dataset.side = sideName;
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', sideName === 'left' ? 'Levá strana rovnice' : 'Pravá strana rovnice');
    // Klik na dlaždici ve schránce ji odebere, kamkoliv jinam (včetně
    // textu podmětu) schránku jen aktivuje - poznáme to podle cíle události.
    box.addEventListener('click', (event) => {
      if (!event.target.closest('.tile-cell')) {
        activateSide(sideName);
      }
    });
    box.addEventListener('keydown', (event) => {
      if (event.target === box && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        activateSide(sideName);
      }
    });
    boxEls[sideName] = box;
  }
  boxesEl.append(boxEls.left, eqEl, boxEls.right);

  // Zpětná vazba patří k místu, kde hráč pracuje - pod schránky, ne nahoru.
  const feedbackEl = document.createElement('p');
  feedbackEl.className = 'tile-feedback';
  feedbackEl.setAttribute('aria-live', 'assertive');

  // --- Paleta dlaždic ---
  const paletteEl = document.createElement('div');
  paletteEl.className = 'tile-palette';
  paletteEl.setAttribute('role', 'group');
  paletteEl.setAttribute('aria-label', 'Paleta dlaždic');
  for (const row of PALETTE_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'tile-palette-row';
    for (const tile of row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile-key';
      btn.textContent = tile.label;
      btn.setAttribute('aria-label', tile.aria ?? tile.label);
      btn.addEventListener('click', () => {
        const result = tile.digit ? model.pressDigit(tile.digit) : model.pressTile(tile.symbol);
        if (result.status === 'blocked') {
          setFeedback(result.note, null);
          return;
        }
        setFeedback(null);
        renderBoxes();
      });
      rowEl.appendChild(btn);
    }
    paletteEl.appendChild(rowEl);
  }

  // --- Akce dole: vymazat stranu + Hotovo ---
  const actionsEl = document.createElement('div');
  actionsEl.className = 'tile-actions';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-ghost tile-clear';
  clearBtn.textContent = 'Vymazat stranu';
  clearBtn.addEventListener('click', () => {
    model.clearSide();
    setFeedback(null);
    renderBoxes();
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary tile-submit';
  submitBtn.textContent = 'Hotovo';
  submitBtn.addEventListener('click', handleSubmit);

  actionsEl.append(clearBtn, submitBtn);

  root.append(problemEl, boxesEl, feedbackEl, paletteEl, actionsEl);
  container.appendChild(root);

  /** Zpráva pro hráče u místa, kde právě klikal. */
  function setFeedback(text, tone) {
    feedbackEl.textContent = text ?? '';
    feedbackEl.classList.toggle('is-wrong', tone === 'wrong');
    feedbackEl.classList.toggle('is-good', tone === 'good');
  }

  function activateSide(name) {
    model.setActiveSide(name);
    renderBoxes();
  }

  /** Překreslí obě schránky podle stavu modelu. */
  function renderBoxes() {
    const state = model.getState();
    for (const sideName of ['left', 'right']) {
      const box = boxEls[sideName];
      box.innerHTML = '';
      const cells = state[sideName];
      if (cells.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'tile-box-hint';
        hint.textContent = SIDE_HINTS[sideName];
        box.appendChild(hint);
      }
      cells.forEach((cell, index) => {
        const cellBtn = document.createElement('button');
        cellBtn.type = 'button';
        cellBtn.className = 'tile-cell';
        cellBtn.textContent =
          cell.kind === 'num' ? cell.text : cell.kind === 'op' ? OP_LABELS[cell.op] : CELL_LABELS[cell.kind];
        cellBtn.setAttribute('aria-label', `Odebrat ${cellBtn.textContent}`);
        cellBtn.addEventListener('click', () => {
          model.removeCell(index, sideName);
          setFeedback(null);
          renderBoxes();
        });
        box.appendChild(cellBtn);
      });
      box.classList.toggle('is-active', state.active === sideName);
      box.setAttribute('aria-pressed', String(state.active === sideName));
    }
    submitBtn.disabled = !state.canSubmit;
  }

  /** Zatřesení schránkami po špatné validaci - dlaždice zůstávají pro opravu. */
  function shake() {
    boxesEl.classList.remove('is-shaking');
    // Restart animace, když hráč klepne Hotovo dvakrát za sebou.
    void boxesEl.offsetWidth;
    boxesEl.classList.add('is-shaking');
  }

  function handleSubmit() {
    if (!model.canSubmit()) {
      return;
    }
    const tokens = model.getTokens();
    const result = parseEquation(tokens, expected);
    if (result.status === 'match' || result.status === 'ok') {
      // Poznámka o jednodušším tvaru (násobek rovnice) není chyba.
      setFeedback(result.note, result.note ? 'good' : null);
    } else {
      shake();
      setFeedback(result.note, 'wrong');
    }
    if (onSubmit) {
      onSubmit(result, tokens);
    }
  }

  boxesEl.addEventListener('animationend', () => boxesEl.classList.remove('is-shaking'));

  renderBoxes();

  return {
    element: root,
    getTokens: () => model.getTokens(),
    destroy() {
      root.remove();
    },
  };
}
