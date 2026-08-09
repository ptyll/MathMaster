/**
 * Inventář kyber krystalů (UCV-REWARD-001) a dílna (UCV-REWARD-002).
 * Obojí jako overlay nad mapou. Krystaly se nikdy neodebírají za chyby;
 * při stavbě se spotřebují (to je cíl, ne trest).
 */

import { PLANETS } from '../content/planets.js';
import { makeDialogAccessible } from './dialogA11y.js';
import {
  PARTS,
  crystalCount,
  isCrafted,
  isUnlocked,
  missingCrystals,
  canCraft,
  craft,
  hasSword,
  hasShip,
} from '../content/crafting.js';

const CRYSTAL_COLORS = ['modrý', 'bílý', 'zelený', 'červený', 'fialový'];

/** Planeta, kde se barva získá (pro text 'Potřebuješ zelený krystal z Dagobah'). */
function planetForColor(color) {
  return PLANETS.find((p) => p.crystalColor === color)?.name ?? '';
}

function createOverlay(titleText, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'solution-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', titleText);

  const panel = document.createElement('div');
  panel.className = 'solution-panel';

  const title = document.createElement('h2');
  title.textContent = titleText;

  const content = document.createElement('div');
  content.className = 'overlay-content';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = 'Zavřít';

  panel.append(title, content, closeBtn);
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
  a11y = makeDialogAccessible(overlay, panel, close);

  return { overlay, content, closeBtn, close };
}

/**
 * Inventář krystalů: mřížka barev s počty + detail.
 * @param {object} options { state, onClose }
 */
export function createInventoryOverlay(container, { state, onClose }) {
  const { overlay, content, close } = createOverlay('Inventář krystalů', onClose);

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
      source.textContent = planetForColor(color);

      cell.append(icon, label, name, source);
      grid.appendChild(cell);
    }
    content.appendChild(grid);
  }

  container.appendChild(overlay);
  return {
    destroy() {
      close();
    },
  };
}

/**
 * Dílna: stavba meče a lodi po částech.
 * @param {object} options { state, onCrafted (po úspěšné stavbě - pro save), onClose }
 */
export function createWorkshopOverlay(container, { state, onCrafted, onClose }) {
  const { overlay, content, close } = createOverlay('Dílna', onClose);

  function render() {
    content.innerHTML = '';

    const status = document.createElement('p');
    status.className = 'workshop-status';
    if (hasShip(state)) {
      status.textContent = '🚀 Loď je kompletní! Jsi připraven na cokoliv.';
    } else if (hasSword(state)) {
      status.textContent = '⚔️ Světelný meč je hotový! Teď loď.';
    } else {
      status.textContent = 'Postav svůj světelný meč z kyber krystalů.';
    }
    content.appendChild(status);

    const list = document.createElement('div');
    list.className = 'parts-list';

    for (const part of PARTS) {
      const row = document.createElement('div');
      row.className = 'part-row';

      const name = document.createElement('span');
      name.className = 'part-name';
      name.textContent = `${part.group === 'sword' ? '⚔️' : '🚀'} ${part.name}`;

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
        row.classList.add('locked');
        const locked = document.createElement('span');
        locked.className = 'part-missing';
        locked.textContent = 'Nejdřív dokonči meč';
        row.appendChild(locked);
      } else if (canCraft(state, part)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-craft';
        btn.textContent = 'Postavit';
        btn.addEventListener('click', () => {
          if (craft(state, part.id)) {
            onCrafted?.();
            render(); // překreslit po stavbě
            // fokus na status, ať po překreslení nespadne na body
            const status = content.querySelector('.workshop-status');
            if (status) {
              status.tabIndex = -1;
              status.focus();
            }
          }
        });
        row.appendChild(btn);
      } else {
        row.classList.add('locked');
        const missing = missingCrystals(state, part);
        const miss = document.createElement('span');
        miss.className = 'part-missing';
        miss.textContent = Object.entries(missing)
          .map(([color, n]) => `Chybí ${n}× ${color} krystal (${planetForColor(color)})`)
          .join(', ');
        row.appendChild(miss);
      }

      list.appendChild(row);
    }
    content.appendChild(list);
  }

  render();
  container.appendChild(overlay);
  return {
    destroy() {
      close();
    },
  };
}
