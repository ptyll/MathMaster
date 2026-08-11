/**
 * Inventář kyber krystalů (UCV-REWARD-001) a dílna (UCV-REWARD-002).
 * Obojí jako overlay nad mapou. Krystaly se nikdy neodebírají za chyby;
 * při stavbě se spotřebují (to je cíl, ne trest).
 */

import { PLANETS } from '../content/planets.js';
import { makeDialogAccessible } from './dialogA11y.js';
import { createPartArt } from './craftArt.js';
import {
  GROUPS,
  getPart,
  crystalCount,
  isCrafted,
  isUnlocked,
  missingCrystals,
  canCraft,
  craft,
  partsOfGroup,
  previousGroup,
  isGroupUnlocked,
  isGroupComplete,
  groupProgress,
} from '../content/crafting.js';

/**
 * Barvy krystalů v pořadí planet - odvozené z dat, ne ruční seznam.
 * Endgame (UCV-MAP-002) přidal šest barev a inventář je musí ukázat, aniž
 * by se sem sahalo; nová planeta se tak nikdy nezapomene doplnit.
 */
const CRYSTAL_COLORS = [...new Set(PLANETS.map((p) => p.crystalColor))];

/** Planeta, kde se barva krystalu získá - podle dat, ne podle výčtu v UI. */
function planetForColor(color) {
  return PLANETS.find((p) => p.crystalColor === color) ?? null;
}

/** Jméno planety zdroje ('Bespin') pro inventář. */
function planetNameForColor(color) {
  return planetForColor(color)?.name ?? '';
}

/**
 * Hláška 'Potřebuješ 2× oranžový krystal z Bespinu'. Zdroj i tvar jména
 * ve 2. pádu jdou z dat planety, takže nová planeta nebo nový díl nikdy
 * nedostane hlášku bez adresy, kam pro krystal jít.
 */
function needCrystalText(color, count) {
  const planet = planetForColor(color);
  const amount = count === 1 ? '' : `${count}× `;
  const source = planet ? ` z ${planet.nameGenitive}` : '';
  return `Potřebuješ ${amount}${color} krystal${source}`;
}

function createOverlay(titleText, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'solution-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', titleText);

  // --framed: roluje jen obsah, nadpis a patička se Zavřít zůstanou na místě.
  const panel = document.createElement('div');
  panel.className = 'solution-panel solution-panel--framed';

  const title = document.createElement('h2');
  title.textContent = titleText;

  const content = document.createElement('div');
  content.className = 'overlay-content';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = 'Zavřít';

  // Zavřít bydlí v patičce mimo rolující obsah (.overlay-footer), takže je
  // vidět hned po otevření. Dílna se čtyřmi skupinami je vyšší než tablet a
  // tlačítko na konci obsahu bylo mimo obraz - hráč bez klávesnice neměl
  // z dialogu cestu ven. V DOM zůstává poslední, cyklení fokusu se nemění.
  const footer = document.createElement('div');
  footer.className = 'overlay-footer';
  footer.appendChild(closeBtn);

  panel.append(title, content, footer);
  overlay.appendChild(panel);

  let a11y = null;
  const close = () => {
    if (a11y) {
      a11y.detach();
      a11y = null;
    }
    overlay.remove();
    onClose?.();
  };
  closeBtn.addEventListener('click', close);

  /**
   * Zavěsí dialog do dokumentu a teprve pak zapne a11y obsluhu. Pořadí je
   * podstatné: makeDialogAccessible volá title.focus(), a focus() na dosud
   * odpojeném uzlu je v prohlížeči no-op - fokus by zůstal na tlačítku,
   * které dialog otevřelo, tedy mimo modál.
   */
  function mount(container) {
    container.appendChild(overlay);
    a11y = makeDialogAccessible(overlay, panel, close);
  }

  return { overlay, content, closeBtn, close, mount };
}

/**
 * Inventář krystalů: mřížka barev s počty + detail.
 * @param {object} options { state, onClose }
 */
export function createInventoryOverlay(container, { state, onClose }) {
  const { overlay, content, close, mount } = createOverlay('Inventář krystalů', onClose);

  const total = state.inventory.crystals.reduce((s, c) => s + c.count, 0);
  if (total === 0) {
    const empty = document.createElement('p');
    empty.className = 'inventory-empty';
    empty.textContent = 'Zatím žádné krystaly - vydej se na první misi!';
    content.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'crystal-grid';
    for (const color of CRYSTAL_COLORS) {
      const count = crystalCount(state, color);
      const cell = document.createElement('div');
      cell.className = 'crystal-cell' + (count === 0 ? ' empty' : '');

      const icon = document.createElement('div');
      icon.className = `crystal crystal-${color}`;
      const label = document.createElement('span');
      label.className = 'crystal-count';
      label.textContent = `×${count}`;
      const name = document.createElement('span');
      name.className = 'crystal-name';
      name.textContent = color;
      const source = document.createElement('span');
      source.className = 'crystal-source';
      source.textContent = planetNameForColor(color);

      cell.append(icon, label, name, source);
      grid.appendChild(cell);
    }
    content.appendChild(grid);
  }

  mount(container);
  return {
    destroy() {
      close();
    },
  };
}

/**
 * Dílna: stavba meče, lodi, droida a světelného brnění po částech.
 * Skupiny i jejich pořadí jdou z GROUPS (UCV-REWARD-003) - žádný výčet
 * v obrazovce, další skupina se přidá jedním záznamem v datech.
 * @param {object} options { state, onCrafted (po úspěšné stavbě - pro save), onClose }
 */
export function createWorkshopOverlay(container, { state, onCrafted, onClose }) {
  const { overlay, content, close, mount } = createOverlay('Dílna', onClose);

  /**
   * Postavit díl a překreslit dílnu. Fokus po překreslení míří na nadpis
   * skupiny (ne na body a ne na začátek dialogu): přečte se '🤖 Droid 2/3',
   * takže hráč slyší, že díl přibyl, a dílna se čtyřmi skupinami mu
   * neuteče zpátky nahoru.
   */
  function buildPart(partId) {
    if (!craft(state, partId)) {
      return;
    }
    const part = getPart(partId);
    onCrafted?.();
    render();
    const section = content.querySelector(`.part-group-${part.group}`);
    const heading = section?.querySelector('.part-group-title');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  function createPartRow(part) {
    const row = document.createElement('div');
    row.className = 'part-row';

    // Ilustrace nese i identitu dílu (.part-art-<id>) - podle ní ho najde
    // test i člověk v inspektoru, jméno se mezi skupinami opakuje (Trup).
    row.appendChild(createPartArt(part.id));

    const name = document.createElement('span');
    name.className = 'part-name';
    name.textContent = part.name;

    const req = document.createElement('span');
    req.className = 'part-requirements';
    req.textContent = Object.entries(part.requires)
      .map(([color, n]) => `${n}× ${color}`)
      .join(' + ');

    row.append(name, req);

    if (isCrafted(state, part.id)) {
      row.classList.add('crafted');
      const done = document.createElement('span');
      done.className = 'part-done';
      done.textContent = '✔ Hotovo';
      row.appendChild(done);
    } else if (!isUnlocked(state, part)) {
      // Text zamčené skupiny nese hlavička, na řádku by se opakoval třikrát.
      row.classList.add('locked');
    } else if (canCraft(state, part)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-craft';
      btn.textContent = 'Postavit';
      btn.setAttribute('aria-label', `Postavit díl ${part.name}`);
      btn.addEventListener('click', () => buildPart(part.id));
      row.appendChild(btn);
    } else {
      row.classList.add('locked');
      const miss = document.createElement('span');
      miss.className = 'part-missing';
      miss.textContent = Object.entries(missingCrystals(state, part))
        .map(([color, n]) => needCrystalText(color, n))
        .join(', ');
      row.appendChild(miss);
    }
    return row;
  }

  function createGroupSection(group) {
    const section = document.createElement('section');
    section.className = `part-group part-group-${group.id}`;

    const heading = document.createElement('h3');
    heading.className = 'part-group-title';
    const progress = groupProgress(state, group.id);
    heading.textContent = `${group.icon} ${group.name} ${progress.built}/${progress.total}`;
    section.appendChild(heading);

    const previous = previousGroup(group.id);
    if (!isGroupUnlocked(state, group.id) && previous) {
      section.classList.add('locked');
      const hint = document.createElement('p');
      hint.className = 'part-group-hint';
      hint.textContent = `🔒 Postav nejdřív ${previous.buildHint}`;
      section.appendChild(hint);
    }

    const list = document.createElement('div');
    list.className = 'parts-list';
    for (const part of partsOfGroup(group.id)) {
      list.appendChild(createPartRow(part));
    }
    section.appendChild(list);
    return section;
  }

  function render() {
    content.innerHTML = '';

    // Pobídka patří první nehotové skupině; hotovo = všechny skupiny stojí.
    const nextGroup = GROUPS.find((g) => !isGroupComplete(state, g.id));
    const status = document.createElement('p');
    status.className = 'workshop-status';
    status.textContent = nextGroup
      ? nextGroup.prompt
      : '🏆 Meč, loď, droid i brnění - dílna je hotová!';
    content.appendChild(status);

    for (const group of GROUPS) {
      content.appendChild(createGroupSection(group));
    }
  }

  render();
  mount(container);
  return {
    destroy() {
      close();
    },
  };
}
