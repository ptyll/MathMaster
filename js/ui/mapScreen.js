/**
 * Galaktická mapa (UCV-MAP-001): pás planet, odemykání postupem,
 * hvězdy, panel hráče, seznam misí planety, stav 'Mistr Jedi'.
 */

import { PLANETS, CORE_PLANETS } from '../content/planets.js';
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

/** Šířka karty planety + mezera (css .planet-card min-width + .planet-strip gap). */
const PLANET_CARD_PITCH = 136;

/**
 * Hráč si vypnul animace. CSS pravidlo tady nestačí - explicitní
 * behavior: 'smooth' v JS ho přebije, takže se musíme zeptat sami.
 * V testovacím DOM bez matchMedia bereme jako 'animace jsou v pořádku'.
 */
function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

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
  // Titul se počítá jen z původní pětky (UCV-MAP-002): endgame řetěz visí
  // za ní, takže hráč, který kdysi dobyl Coruscant, o titul nesmí přijít.
  // Text proto netvrdí, že jsou osvobozené všechny planety - nejsou.
  if (isMasterJedi(state, CORE_PLANETS)) {
    const master = document.createElement('div');
    master.className = 'master-jedi';
    master.textContent = '🎉 MISTR JEDI! Základní výcvik máš za sebou - a za Coruscantem čeká další cesta. 🎉';
    root.appendChild(master);
    root.appendChild(createConfetti());
  }

  // --- Pás planet ---
  // Jedenáct planet se nevejde na žádnou cílovou šířku, takže pás musí sám
  // říct, že pokračuje: přechod u okraje, šipky a po otevření mapy posun na
  // planetu, kde hráč právě je. Bez toho viděl hráč po dokončení Coruscantu
  // pět dohraných planet a ani pixel z čerstvě odemčeného Bespinu.
  const stripWrap = document.createElement('div');
  stripWrap.className = 'planet-strip-wrap';
  const strip = document.createElement('div');
  strip.className = 'planet-strip';
  // Rolovatelná oblast musí jít ovládat z klávesnice i sama o sebe - a je to
  // místo, kam uklidíme fokus, když pod ním zmizí šipka.
  strip.tabIndex = 0;

  const prevBtn = createScrollArrow('prev');
  const nextBtn = createScrollArrow('next');
  stripWrap.append(prevBtn, strip, nextBtn);

  function createScrollArrow(direction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn planet-strip-arrow planet-strip-${direction}`;
    btn.textContent = direction === 'next' ? '›' : '‹';
    btn.setAttribute(
      'aria-label',
      direction === 'next' ? 'Posunout mapu na další planety' : 'Posunout mapu na předchozí planety'
    );
    btn.addEventListener('click', () => {
      // O necelou obrazovku, ať zůstane vidět, odkud hráč přijel.
      const step = (strip.clientWidth || 3 * PLANET_CARD_PITCH) * 0.75;
      // Explicitní behavior v JS přebíjí CSS, takže reduced-motion musíme
      // vyhodnotit sami - jinak mapa animuje i tomu, kdo si pohyb vypnul.
      strip.scrollBy?.({
        left: direction === 'next' ? step : -step,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      updateScrollAffordance();
    });
    return btn;
  }

  /**
   * Ukáže přechod a šipku jen na tu stranu, kam se dá posunout.
   * Bez rozložení (první render, testovací DOM) o pásu nic nevíme - a protože
   * se jedenáct planet nevejde nikam, počítáme s tím, že mapa pokračuje
   * doprava. Šipka navíc je menší vada než polovina mapy schovaná za okrajem.
   */
  function updateScrollAffordance() {
    const visible = strip.clientWidth ?? 0;
    const total = strip.scrollWidth ?? 0;
    const offset = strip.scrollLeft ?? 0;
    const unknownLayout = visible === 0 || total === 0;
    const canLeft = !unknownLayout && offset > 1;
    const canRight = unknownLayout || offset + visible < total - 1;
    stripWrap.classList.toggle('can-scroll-left', canLeft);
    stripWrap.classList.toggle('can-scroll-right', canRight);
    hideArrow(prevBtn, !canLeft, nextBtn);
    hideArrow(nextBtn, !canRight, prevBtn);
  }

  /**
   * Šipka na konci posunu zmizí - ale hráč, který na ni klepl klávesnicí, na
   * ní pořád drží fokus a ten by spadl na <body>. Přendáme ho na protější
   * šipku, a když je taky pryč, na pás; odtud se dá tabovat na karty dál.
   */
  function hideArrow(btn, hide, fallback) {
    if (hide && !btn.hidden && document.activeElement === btn) {
      (fallback.hidden ? strip : fallback).focus?.();
    }
    btn.hidden = hide;
  }

  strip.addEventListener('scroll', updateScrollAffordance);

  // --- Detail planety (seznam misí) ---
  const detail = document.createElement('div');
  detail.className = 'planet-detail';
  detail.hidden = true;

  const tooltip = document.createElement('p');
  tooltip.className = 'map-tooltip';
  tooltip.setAttribute('aria-live', 'polite');
  tooltip.hidden = true;

  // Karty a planeta, kde hráč právě je: poslední odemčená, tedy čelo postupu.
  // Právě ta je po návratu z mise ta zajímavá - a právě ta byla dosud za
  // okrajem obrazovky.
  const cards = [];
  let currentIndex = 0;

  PLANETS.forEach((planet, index) => {
    const unlocked = isPlanetUnlocked(state, PLANETS, index);
    const completed = isPlanetCompleted(state, planet);
    const stars = planetStars(state, planet);
    if (unlocked) {
      currentIndex = index;
    }

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

    cards.push(btn);
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

  root.append(h1, panel, stripWrap, tooltip, detail);
  container.appendChild(root);

  // Až v dokumentu - dřív prohlížeč pás nemá rozložený a posun by nikam nevedl.
  // 'nearest' svisle: jde o posun pásu, ne o skok obrazovkou.
  cards[currentIndex]?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  updateScrollAffordance();

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
