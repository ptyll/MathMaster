/**
 * Krokové zadávání řešení (UCV-STEP-001, UCV-STEP-002).
 * DOM vrstva nad js/engine/stepSession.js.
 *
 * Rovnice: hráč vybere operaci tlačítkem a operand na sdílené klávesnici,
 * pak dopočítá, co na stranách zbude. Celou rovnici nikdy nepíše - žádný
 * parser výrazů, na tabletu by vyráběl překlepové chyby místo matematických.
 *
 * Zlomky: každý krok je jedna otázka do stejného vstupu.
 */

import { createAnswerInput } from './answerInput.js';
import { createBalanceScale } from './balanceScale.js';
import { createNumberLine, createFractionBar } from './fractionVisuals.js';

const VIZ_NOTE_PENDING = 'Váha ukazuje stav před tímhle krokem.';

const OPERATIONS = [
  { kind: 'sub', label: '−', aria: 'Odečti od obou stran' },
  { kind: 'add', label: '+', aria: 'Přičti k oběma stranám' },
  { kind: 'mul', label: '×', aria: 'Vynásob obě strany' },
  { kind: 'div', label: '÷', aria: 'Vyděl obě strany' },
];

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.session relace z createStepSession()
 * @param {(result: object) => void} options.onFeedback hlášení pro obrazovku mise
 * @param {() => void} options.onSolved příklad dořešen
 * @returns {{ element: HTMLElement, destroy: () => void, refresh: () => void }}
 */
export function createStepInput(container, { session, onFeedback, onSolved }) {
  const root = document.createElement('div');
  root.className = 'step-input';

  // --- Cesta, kterou hráč ušel ---
  const historyEl = document.createElement('ol');
  historyEl.className = 'step-history';
  historyEl.setAttribute('aria-label', 'Provedené kroky');

  // Zvolená operace během dopočítávání. Bez ní si hráč musí pamatovat,
  // co vlastně zadal - a přesně tomu má krokový režim předcházet.
  const opChip = document.createElement('p');
  opChip.className = 'step-operation-chip';
  opChip.hidden = true;

  // --- Aktuální stav rovnice / úlohy ---
  const stateEl = document.createElement('p');
  stateEl.className = 'step-equation';
  stateEl.setAttribute('aria-live', 'polite');

  // --- Vizualizace (váha nebo číselná osa), jen u rovnic ---
  const vizHost = document.createElement('div');
  vizHost.className = 'step-viz';
  const scale = session.kind === 'equation' ? createBalanceScale() : null;

  // Během dopočítávání ukazuje váha ještě stav PŘED krokem - bez popisku
  // to vedle rovnice s otazníkem mate.
  const vizNote = document.createElement('p');
  vizNote.className = 'step-viz-note';
  vizNote.textContent = VIZ_NOTE_PENDING;
  vizNote.hidden = true;

  // --- Otázka aktuálního kroku ---
  const promptEl = document.createElement('p');
  promptEl.className = 'step-prompt';
  promptEl.setAttribute('aria-live', 'polite');

  // Zpětná vazba patří k akci, ne na druhý konec obrazovky - hráč
  // potvrzuje dole a nahoru se nedívá.
  const feedbackEl = document.createElement('p');
  feedbackEl.className = 'step-feedback';
  feedbackEl.setAttribute('aria-live', 'assertive');

  // --- Výběr operace (jen rovnice) ---
  const opRow = document.createElement('div');
  opRow.className = 'step-operations';
  opRow.setAttribute('role', 'group');
  opRow.setAttribute('aria-label', 'Vyber operaci');

  const termToggle = document.createElement('button');
  termToggle.type = 'button';
  termToggle.className = 'btn btn-term-toggle';

  // --- Hostitel vstupu hodnoty ---
  const inputHost = document.createElement('div');
  inputHost.className = 'step-value-input';

  // --- Zpět o krok / zrušit operaci ---
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-ghost btn-step-back';

  // Zadání jako první položka cesty - jinak by se rovnice na obrazovce
  // objevila dvakrát (statická v kartě a živá tady).
  const originEl = document.createElement('li');
  originEl.className = 'step-history-origin';
  const originLabel = document.createElement('span');
  originLabel.className = 'step-history-op';
  originLabel.textContent = 'Zadání';
  const originValue = document.createElement('span');
  originValue.className = 'step-history-eq';
  originValue.textContent = session.equationText;
  originEl.append(originLabel, originValue);

  // Dva sloupce v DOM, ne přes grid-areas: vlevo kam se hráč dostal,
  // vpravo čím pokračuje. Na úzké obrazovce se jen složí pod sebe.
  const leftCol = document.createElement('div');
  leftCol.className = 'step-col step-col-state';
  leftCol.append(historyEl, opChip, stateEl, vizHost, vizNote);

  const rightCol = document.createElement('div');
  rightCol.className = 'step-col step-col-controls';
  rightCol.append(promptEl, feedbackEl, opRow, termToggle, inputHost, backBtn);

  root.append(leftCol, rightCol);
  container.appendChild(root);

  let input = null;
  let selectedKind = null;
  let term = 'const';
  const opButtons = [];

  function destroyInput() {
    if (input) {
      input.destroy();
      input = null;
    }
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    historyEl.appendChild(originEl);
    for (const entry of session.history) {
      const li = document.createElement('li');
      const op = document.createElement('span');
      op.className = 'step-history-op';
      op.textContent = entry.operationText;
      li.appendChild(op);
      if (entry.equationText) {
        const eq = document.createElement('span');
        eq.className = 'step-history-eq';
        eq.textContent = entry.equationText;
        li.appendChild(eq);
      }
      historyEl.appendChild(li);
    }
    // Než hráč udělá první krok, je zadání totéž co živá rovnice -
    // ukazovat obojí by bylo jen zdvojení.
    historyEl.hidden = session.history.length === 0;
  }

  /** Zpráva pro hráče u místa, kde právě klikal. */
  function setFeedback(text, tone) {
    feedbackEl.textContent = text ?? '';
    feedbackEl.classList.toggle('is-wrong', tone === 'wrong');
    feedbackEl.classList.toggle('is-good', tone === 'good');
  }

  function renderVisualization() {
    if (session.kind === 'fraction') {
      // Zlomkové pásy v tvaru, ve kterém hráč právě je (UCV-STEP-002).
      vizHost.hidden = false;
      vizNote.hidden = true;
      vizHost.innerHTML = '';
      // Pásy pod sebou, ne vedle sebe - jde o porovnání velikostí.
      vizHost.classList.add('step-viz--bars');
      for (const f of session.bars) {
        vizHost.appendChild(createFractionBar(f, `${f.n}/${f.d}`));
      }
      return;
    }
    vizHost.classList.remove('step-viz--bars');
    if (session.kind !== 'equation') {
      vizHost.hidden = true;
      vizNote.hidden = true;
      return;
    }
    vizHost.innerHTML = '';
    const state = session.equationState;
    const hasNegative =
      state.left.c.n < 0 || state.right.c.n < 0 || state.left.x.n < 0 || state.right.x.n < 0;
    if (hasNegative) {
      // Váha záporné množství neunese - stejné pravidlo jako v solutionViewer.
      // Osa značí hodnotu té strany, která je čisté číslo; když taková není,
      // nemáme co pravdivě ukázat a vizualizaci vynecháme. Nikdy nekreslíme
      // řešení rovnice - to by prozradilo odpověď.
      const plainSide =
        state.right.x.n === 0 ? state.right.c : state.left.x.n === 0 ? state.left.c : null;
      if (plainSide === null) {
        // x je na obou stranách - váha ani osa to poctivě neukážou.
        // Místo obrázku řekneme proč a co s tím, ať sloupec nezeje prázdnotou.
        vizHost.hidden = true;
        vizNote.hidden = false;
        vizNote.textContent = 'Váhu tu nenakreslíme - x je na obou stranách. Nejdřív ho dostaň jen na jednu.';
        return;
      }
      vizHost.hidden = false;
      vizNote.hidden = session.phase !== 'values';
      vizNote.textContent = VIZ_NOTE_PENDING;
      vizHost.appendChild(createNumberLine(plainSide.n / plainSide.d));
      return;
    }
    vizHost.hidden = false;
    vizNote.hidden = session.phase !== 'values';
    vizNote.textContent = VIZ_NOTE_PENDING;
    vizHost.appendChild(scale.element);
    const [leftText, rightText] = session.equationText.split(' = ');
    scale.show(leftText, rightText);
  }

  function renderOperationPhase() {
    stateEl.textContent = session.equationText;
    promptEl.textContent = 'Co uděláš s oběma stranami?';
    opChip.hidden = true;
    opRow.hidden = false;
    termToggle.hidden = false;
    backBtn.hidden = !session.canUndo;
    backBtn.textContent = '↩ Zpět o krok';

    renderTermToggle();
    destroyInput();
    inputHost.innerHTML = '';
    if (selectedKind === null) {
      return;
    }
    input = createAnswerInput(inputHost, {
      expected: null,
      mode: 'int',
      allowSign: false, // směr určuje zvolená operace
      confirmLabel: 'Proveď na obou stranách',
      onSubmit: (result) => handleOperand(result.value),
    });
  }

  function renderTermToggle() {
    // Násobit a dělit x-členem nejde - přepínač dává smysl jen u + a −.
    const allowX = selectedKind === 'add' || selectedKind === 'sub';
    termToggle.hidden = !allowX;
    if (!allowX) {
      term = 'const';
      return;
    }
    termToggle.textContent = term === 'x' ? 'Pracuju s x' : 'Pracuju s číslem';
    termToggle.setAttribute('aria-pressed', String(term === 'x'));
    termToggle.setAttribute(
      'aria-label',
      term === 'x' ? 'Operand je x-člen, klepnutím přepneš na číslo' : 'Operand je číslo, klepnutím přepneš na x'
    );
  }

  function renderValuePhase() {
    const preview = session.pendingPreview;
    stateEl.textContent = preview ? `${preview.left} = ${preview.right}` : session.equationText;
    promptEl.textContent = session.question ? session.question.prompt : '';

    // Odvození musí být vidět celé: odkud jdu (poslední řádek cesty),
    // co jsem zvolil (chip) a co z toho vyjde (rovnice s otazníkem).
    // Cesta se proto ukáže i před prvním krokem, kdy nese zadání.
    opChip.hidden = false;
    opChip.textContent = `↓ ${session.pendingOperationText}`;
    historyEl.hidden = false;

    opRow.hidden = true;
    termToggle.hidden = true;
    backBtn.hidden = false;
    backBtn.textContent = '✕ Zvolit jinou operaci';

    destroyInput();
    inputHost.innerHTML = '';
    input = createAnswerInput(inputHost, {
      expected: null,
      mode: session.question?.mode === 'fraction' ? 'fraction' : 'int',
      confirmLabel: 'Potvrdit',
      onSubmit: (result) => handleValue(result.value),
    });
  }

  function renderFractionPhase() {
    stateEl.textContent = session.equationText;
    opChip.hidden = true;
    promptEl.textContent = session.question ? session.question.prompt : '';
    opRow.hidden = true;
    termToggle.hidden = true;
    backBtn.hidden = true;

    destroyInput();
    inputHost.innerHTML = '';
    input = createAnswerInput(inputHost, {
      expected: null,
      mode: session.question?.mode === 'fraction' ? 'fraction' : 'int',
      confirmLabel: 'Potvrdit',
      onSubmit: (result) => handleValue(result.value),
    });
  }

  function render() {
    renderHistory();
    renderVisualization();
    if (session.isDone) {
      opRow.hidden = true;
      termToggle.hidden = true;
      opChip.hidden = true;
      backBtn.hidden = true;
      destroyInput();
      inputHost.innerHTML = '';
      promptEl.textContent = '';
      return;
    }
    if (session.kind === 'fraction') {
      renderFractionPhase();
      return;
    }
    if (session.phase === 'values') {
      renderValuePhase();
      return;
    }
    renderOperationPhase();
  }

  function handleOperand(value) {
    if (value === null) {
      return;
    }
    // Operand je vždy kladná velikost - směr určuje zvolená operace,
    // jinak by '− -3' znamenalo totéž co '+ 3' a hráče to jen mate.
    const magnitude =
      value.kind === 'int'
        ? { n: Math.abs(value.value), d: 1 }
        : { n: Math.abs(value.n), d: value.d };

    const result = session.submitOperation({ kind: selectedKind, operand: magnitude, term });
    if (result.status === 'invalid' || result.status === 'noProgress' || result.status === 'notEquivalent') {
      setFeedback(result.note, result.status === 'invalid' ? null : 'wrong');
      onFeedback({ status: result.status, note: result.note });
      if (input) {
        input.unlock();
      }
      return;
    }
    setFeedback(null);
    onFeedback({ status: 'accepted', note: null });
    selectedKind = null;
    term = 'const';
    if (result.status === 'solved') {
      render();
      onSolved();
      return;
    }
    render();
  }

  function handleValue(value) {
    const result = session.submitValue(value);
    if (result.status === 'wrong') {
      setFeedback(result.note, 'wrong');
      onFeedback({ status: 'wrong', note: result.note });
      if (input) {
        input.unlock();
      }
      return;
    }
    setFeedback(result.note, result.note ? 'good' : null);
    onFeedback({ status: result.status === 'solved' ? 'solved' : 'accepted', note: result.note });
    if (result.status === 'solved') {
      render();
      onSolved();
      return;
    }
    render();
  }

  // --- Tlačítka operací ---
  for (const operation of OPERATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-operation';
    btn.textContent = operation.label;
    btn.setAttribute('aria-label', operation.aria);
    btn.addEventListener('click', () => {
      selectedKind = selectedKind === operation.kind ? null : operation.kind;
      // Přepínač x/číslo patří k právě zvolené operaci. Bez resetu si drží
      // stav z minulého kroku a hráči se tiše změní '+ 7' na '+ 7x'.
      term = 'const';
      updateOperationSelection();
      renderOperationPhase();
      if (input) {
        input.focus();
      }
    });
    opButtons.push(btn);
    opRow.appendChild(btn);
  }

  function updateOperationSelection() {
    opButtons.forEach((btn, i) => {
      const active = OPERATIONS[i].kind === selectedKind;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  termToggle.addEventListener('click', () => {
    term = term === 'x' ? 'const' : 'x';
    renderTermToggle();
  });

  backBtn.addEventListener('click', () => {
    if (session.phase === 'values') {
      session.cancelOperation();
      selectedKind = null;
      updateOperationSelection();
    } else {
      session.undo();
      selectedKind = null;
      updateOperationSelection();
    }
    setFeedback(null);
    onFeedback({ status: 'reverted', note: null });
    render();
  });

  updateOperationSelection();
  render();

  return {
    element: root,
    refresh: render,
    destroy() {
      destroyInput();
      root.remove();
    },
  };
}
