/**
 * Žebříček titulů (UCV-MAP-003) jako overlay nad mapou.
 *
 * PROČ na mapě a ne v rodičovském přehledu: odznak s titulem dítě na mapě
 * vidí vedle svého jména po každé misi, takže klepnutí na něj je jediné
 * místo, kde žebříček najde samo od sebe. Rodičovský přehled je schválně
 * za rodičovskou bránou (držet 3 s) - motivace, kterou vidí jen rodič, není
 * motivace. Odznak je proto tlačítko a tenhle dialog je jeho obsah.
 *
 * Zdrojem je výhradně TITLES z engine/titles.js: nový stupeň se přidá do
 * dat a v žebříčku se objeví sám, nikde tu není ruční výčet.
 *
 * Nepředbíháme: budoucí stupně ukazují jen svůj název a POČET planet, nikdy
 * jména planet ani oslavné hlášky (banner u titulu 'Mistr Jedi' mluví
 * o Coruscantu) - dítě se o obsahu, který ještě nevidělo, nedozví.
 */

import { createOverlay } from './overlay.js';
import { TITLES, titleFor, completedPlanetCount } from '../engine/titles.js';

/** Tvar slova 'planeta' po číslovce: 1 planeta, 2-4 planety, 5+ planet. */
export function planetWord(count) {
  if (count === 1) {
    return 'planeta';
  }
  return count >= 2 && count <= 4 ? 'planety' : 'planet';
}

/** Tvar po předložce 'od' (2. pád): od 1 planety, od 2 planet, od 11 planet. */
export function planetWordFrom(count) {
  return count === 1 ? 'planety' : 'planet';
}

/**
 * Stupně žebříčku i s tím, kde hráč stojí. Čistá funkce nad TITLES, aby
 * pravidlo 'co je hotové, co je teď a kolik chybí' žilo na jednom místě
 * a dalo se testovat bez DOM.
 *
 * @param {object} state herní stav
 * @returns {{ id, label, minPlanets, isDone, isCurrent, remaining }[]}
 */
export function titleLadderSteps(state) {
  const completed = completedPlanetCount(state);
  const current = titleFor(state);
  return TITLES.map((title) => ({
    id: title.id,
    label: title.label,
    minPlanets: title.minPlanets,
    isCurrent: title.id === current.id,
    isDone: completed >= title.minPlanets && title.id !== current.id,
    remaining: Math.max(0, title.minPlanets - completed),
  }));
}

/**
 * Overlay se žebříčkem titulů. Rámec je sdílený (overlay.js), takže Zavřít
 * sedí v patičce mimo rolující obsah a je vidět bez rolování i na nízkém
 * okně tabletu.
 *
 * @param {HTMLElement} container kam se overlay zavěsí (musí být v dokumentu)
 * @param {object} options
 * @param {object} options.state herní stav
 * @param {() => void} [options.onClose]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createTitleLadderOverlay(container, { state, onClose }) {
  const { overlay, content, close, mount } = createOverlay('Žebříček titulů', onClose);
  overlay.classList.add('title-ladder-overlay');
  content.classList.add('title-ladder');

  const completed = completedPlanetCount(state);
  const steps = titleLadderSteps(state);
  const current = steps.find((s) => s.isCurrent);
  const next = steps.find((s) => s.remaining > 0);

  const summary = document.createElement('p');
  summary.className = 'title-ladder-summary';
  // Bez skloňování za číslovkou: 'Dokončené planety: 1' je správně česky
  // pro každý počet, kdežto 'Máš 1 dokončenou planetu' by potřebovalo
  // tvary, které z dat nespočítáme.
  summary.textContent = `Dokončené planety: ${completed}. Tvůj titul: ${current.label}.`;

  const nextLine = document.createElement('p');
  nextLine.className = 'title-ladder-next';
  nextLine.textContent = next
    ? `Do titulu ${next.label} ti chybí ještě ${next.remaining} ${planetWord(next.remaining)}.`
    : 'Vyšší titul už není - stojíš na vrcholu žebříčku.';

  const list = document.createElement('ol');
  list.className = 'title-ladder-list';
  // Seznam bez odrážek (list-style: none) ztrácí v Safari s VoiceOverem
  // sémantiku seznamu - explicitní role ji vrátí, aniž by se sáhlo na styl.
  list.setAttribute('role', 'list');
  for (const step of steps) {
    list.appendChild(createStepRow(step));
  }

  content.append(summary, nextLine, list);
  mount(container);

  return {
    element: overlay,
    destroy() {
      close();
    },
  };
}

/**
 * Řádek žebříčku. Zamčený stupeň se pozná rámečkem a akcentem (CSS), ne
 * ztlumeným textem - právě to, co dítě ještě čeká, potřebuje přečíst
 * nejlíp. Značky (✔ 🔒) jsou dekorace, stav nese text vedle nich.
 */
function createStepRow(step) {
  const row = document.createElement('li');
  row.className =
    'title-step' + (step.isCurrent ? ' is-current' : step.isDone ? ' is-done' : ' is-locked');
  if (step.isCurrent) {
    row.setAttribute('aria-current', 'step');
  }

  const mark = document.createElement('span');
  mark.className = 'title-step-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = step.isCurrent ? '⭐' : step.isDone ? '✔' : '🔒';

  const name = document.createElement('span');
  name.className = 'title-step-name';
  name.textContent = step.label;

  // Práh i nulový stupeň mluví stejnou formou ('od ...'), jinak by dítě
  // vidělo vedle sebe dvě holá čísla ('8 planet' a 'ještě 3 planety')
  // a musela by hádat, které z nich je meta.
  const need = document.createElement('span');
  need.className = 'title-step-need';
  need.textContent =
    step.minPlanets === 0
      ? 'od začátku cesty'
      : `od ${step.minPlanets} ${planetWordFrom(step.minPlanets)}`;

  const stateText = document.createElement('span');
  stateText.className = 'title-step-state';
  stateText.textContent = step.isCurrent
    ? 'Tady jsi'
    : step.isDone
      ? 'Splněno'
      : `ještě ${step.remaining} ${planetWord(step.remaining)}`;

  row.append(mark, name, need, stateText);
  return row;
}
