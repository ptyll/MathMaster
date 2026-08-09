/**
 * Galaktická mapa (UCV-MAP-001): pás planet, odemykání postupem,
 * hvězdy, panel hráče, seznam misí planety, stav 'Mistr Jedi'.
 */

import { PLANETS, getMission } from '../content/planets.js';
import {
  isPlanetUnlocked,
  isPlanetCompleted,
  planetStars,
  planetMaxStars,
  isMasterJedi,
  starsFor,
  totalCrystals,
} from '../engine/unlock.js';
import { createPlanetArt, createStarfield } from './planetArt.js';
import { createInventoryOverlay, createWorkshopOverlay } from './workshopScreen.js';
import { createParentGate } from './parentGate.js';

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.state herní stav
 * @param {(missionId: string) => void} options.onStartMission
 * @param {() => void} [options.onStateChanged] po změně stavu (crafting) - pro uložení
 * @param {() => void} [options.onParentArea] vstup do rodičovského přehledu (UCV-STATS-001)
 */
export function createMapScreen(container, { state, onStartMission, onStateChanged, onParentArea }) {
  const root = document.createElement('div');
  root.className = 'map';

  root.appendChild(createStarfield());

  const h1 = document.createElement('h1');
  h1.textContent = 'Galaktická mapa';

  // --- Panel hráče ---
  const panel = document.createElement('div');
  panel.className = 'map-player';
  const name = document.createElement('span');
  name.className = 'map-player-name';
  name.textContent = state.profile?.name ?? 'Padawan';
  const crystalsBtn = document.createElement('button');
  crystalsBtn.type = 'button';
  crystalsBtn.className = 'btn btn-ghost btn-crystals';
  crystalsBtn.textContent = `💎 ${totalCrystals(state)}`;
  crystalsBtn.setAttribute('aria-label', 'Inventář krystalů');
  const workshopBtn = document.createElement('button');
  workshopBtn.type = 'button';
  workshopBtn.className = 'btn btn-ghost';
  workshopBtn.textContent = '🔧 Dílna';
  panel.append(name, crystalsBtn, workshopBtn);

  // Rodičovská brána - drží se 3 s, aby na přehled nespadlo dítě omylem.
  let parentGate = null;
  if (onParentArea) {
    parentGate = createParentGate(panel, { onUnlocked: onParentArea });
  }

  // Overlaye inventáře a dílny
  let overlay = null;
  const closeOverlay = () => {
    if (overlay) {
      overlay.destroy();
      overlay = null;
    }
  };
  crystalsBtn.addEventListener('click', () => {
    closeOverlay();
    overlay = createInventoryOverlay(root, {
      state,
      onClose: () => {
        overlay = null;
        crystalsBtn.focus();
      },
    });
  });
  workshopBtn.addEventListener('click', () => {
    closeOverlay();
    overlay = createWorkshopOverlay(root, {
      state,
      onCrafted: () => {
        onStateChanged?.();
        crystalsBtn.textContent = `💎 ${totalCrystals(state)}`; // refresh po spotřebování
      },
      onClose: () => {
        overlay = null;
        workshopBtn.focus();
      },
    });
  });

  // --- Mistr Jedi stav ---
  if (isMasterJedi(state, PLANETS)) {
    const master = document.createElement('div');
    master.className = 'master-jedi';
    master.textContent = '🎉 MISTR JEDI! Všechny planety jsou osvobozené! 🎉';
    root.appendChild(master);
    root.appendChild(createConfetti());
  }

  // --- Pás planet ---
  const strip = document.createElement('div');
  strip.className = 'planet-strip';

  // --- Detail planety (seznam misí) ---
  const detail = document.createElement('div');
  detail.className = 'planet-detail';
  detail.hidden = true;

  const tooltip = document.createElement('p');
  tooltip.className = 'map-tooltip';
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.hidden = true;

  PLANETS.forEach((planet, index) => {
    const unlocked = isPlanetUnlocked(state, PLANETS, index);
    const completed = isPlanetCompleted(state, planet);
    const stars = planetStars(state, planet);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'planet-card' + (unlocked ? '' : ' locked') + (completed ? ' completed' : '');
    btn.setAttribute(
      'aria-label',
      unlocked
        ? `${planet.name}, ${stars} z ${planetMaxStars(planet)} hvězd`
        : `${planet.name}, zamčeno`
    );

    btn.appendChild(createPlanetArt(planet.art, { locked: !unlocked }));

    const nameEl = document.createElement('span');
    nameEl.className = 'planet-name';
    nameEl.textContent = planet.name;
    const starsEl = document.createElement('span');
    starsEl.className = 'planet-stars';
    starsEl.textContent = unlocked ? `★ ${stars}/${planetMaxStars(planet)}` : '🔒';
    btn.append(nameEl, starsEl);

    btn.addEventListener('click', () => {
      if (!unlocked) {
        tooltip.textContent = 'Dokonči nejdřív předchozí planetu.';
        tooltip.hidden = false;
        detail.hidden = true;
        return;
      }
      tooltip.hidden = true;
      renderPlanetDetail(planet);
    });

    strip.appendChild(btn);
  });

  function renderPlanetDetail(planet) {
    detail.innerHTML = '';
    detail.hidden = false;

    const title = document.createElement('h2');
    title.textContent = planet.name;
    const subtitle = document.createElement('p');
    subtitle.className = 'planet-subtitle';
    subtitle.textContent = planet.subtitle;
    detail.append(title, subtitle);

    const list = document.createElement('div');
    list.className = 'mission-list';
    planet.missions.forEach((m, i) => {
      const stars = starsFor(state, planet.id, m.id);
      // Mise je dostupná, když je první, nebo předchozí mise má hvězdu.
      const prevDone = i === 0 || starsFor(state, planet.id, planet.missions[i - 1].id) > 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn mission-btn' + (prevDone ? ' btn-primary' : ' btn-ghost');
      btn.disabled = !prevDone;
      const starText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      btn.textContent = `${m.boss ? '👾 ' : ''}${m.title}  ${starText}`;
      btn.addEventListener('click', () => onStartMission(m.id));
      list.appendChild(btn);
    });
    detail.appendChild(list);
  }

  root.append(h1, panel, strip, tooltip, detail);
  container.appendChild(root);

  return {
    element: root,
    destroy() {
      closeOverlay();
      parentGate?.destroy();
      root.remove();
    },
  };
}

/** Jednoduché CSS konfety pro stav Mistr Jedi. */
function createConfetti() {
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  wrap.setAttribute('aria-hidden', 'true');
  const colors = ['#ffd94d', '#4da3ff', '#7ee08c', '#ff8a8a', '#c58aff'];
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${(i * 37) % 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(i % 8) * 0.35}s`;
    wrap.appendChild(piece);
  }
  return wrap;
}
