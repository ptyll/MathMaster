/**
 * Slavnost za přijetí do Rady Jedi (UCV-MAP-003): odznak, jméno hráče
 * a konfety přes mapu, jednou - po dokončení poslední planety.
 *
 * Grafika je vlastní (DEC-006) a kreslí se přes createElementNS, ne
 * innerHTML: SVG poskládané z prvků jde otestovat kus po kuse a projde
 * i minimálním DOM stubem v testech.
 */

import { createOverlay } from './overlay.js';
import { COUNCIL_PLANET_COUNT } from '../engine/titles.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Zlatá odznaku - drží 8,9:1 proti panelu dialogu (#161c3d). */
const GOLD = '#ffd94d';
const GOLD_DEEP = '#e0a92b';
const BADGE_BG = '#2b2450';

/**
 * Zlatý odznak Rady Jedi: kruh s paprsky a hvězdou uprostřed.
 * Vlastní motiv - žádný chráněný symbol.
 */
export function createCouncilBadge() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '140');
  svg.setAttribute('class', 'council-badge');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Zlatý odznak Rady Jedi');

  const disc = document.createElementNS(SVG_NS, 'circle');
  disc.setAttribute('cx', '60');
  disc.setAttribute('cy', '60');
  disc.setAttribute('r', '52');
  disc.setAttribute('fill', BADGE_BG);
  disc.setAttribute('stroke', GOLD);
  disc.setAttribute('stroke-width', '5');
  svg.appendChild(disc);

  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '60');
  ring.setAttribute('cy', '60');
  ring.setAttribute('r', '41');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', GOLD_DEEP);
  ring.setAttribute('stroke-width', '2');
  svg.appendChild(ring);

  // Dvanáct paprsků kolem dokola - 'rada' je kruh kolem stolu.
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const ray = document.createElementNS(SVG_NS, 'line');
    ray.setAttribute('class', 'council-ray');
    ray.setAttribute('x1', String(60 + Math.cos(angle) * 43));
    ray.setAttribute('y1', String(60 + Math.sin(angle) * 43));
    ray.setAttribute('x2', String(60 + Math.cos(angle) * 49));
    ray.setAttribute('y2', String(60 + Math.sin(angle) * 49));
    ray.setAttribute('stroke', GOLD);
    ray.setAttribute('stroke-width', '3');
    ray.setAttribute('stroke-linecap', 'round');
    svg.appendChild(ray);
  }

  // Hvězda uprostřed (pěticípá, spočítaná z kružnice - žádný obrázek).
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 30 : 13;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    points.push(`${(60 + Math.cos(angle) * radius).toFixed(1)},${(60 + Math.sin(angle) * radius).toFixed(1)}`);
  }
  const star = document.createElementNS(SVG_NS, 'polygon');
  star.setAttribute('class', 'council-star');
  star.setAttribute('points', points.join(' '));
  star.setAttribute('fill', GOLD);
  svg.appendChild(star);

  return svg;
}

/**
 * Konfety pro slavnostní stavy (titul na mapě i slavnost Rady).
 * Čistě dekorace - aria-hidden, a s vypnutým pohybem je CSS schová,
 * aby po obrazovce nezůstala viset sprška teček.
 */
export function createConfetti() {
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

/**
 * Slavnostní obrazovka přes mapu. Zavírací tlačítko sedí v patičce
 * sdíleného rámce, takže je vidět bez rolování i na tabletu.
 *
 * @param {HTMLElement} container kam se overlay zavěsí (musí být v dokumentu)
 * @param {object} options
 * @param {string} options.name jméno hráče
 * @param {() => void} [options.onClose]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createCouncilCelebration(container, { name, onClose }) {
  const { overlay, content, close, mount } = createOverlay('Člen rady Jedi', onClose, {
    closeLabel: 'Pokračovat na mapu',
  });
  overlay.classList.add('council-overlay');
  content.classList.add('council-celebration');

  content.appendChild(createCouncilBadge());

  const nameEl = document.createElement('p');
  nameEl.className = 'council-name';
  nameEl.textContent = name;

  // Počet planet jde z dat, ne z ruky: hláška o 'všech planetách' už
  // jednou lhala, když planety přibyly (UCV-MAP-002).
  const text = document.createElement('p');
  text.className = 'council-text';
  text.textContent = `Osvobodil jsi všech ${COUNCIL_PLANET_COUNT} planet. Rada Jedi tě přijímá mezi sebe!`;

  const hint = document.createElement('p');
  hint.className = 'council-hint';
  hint.textContent = 'Titul Člen rady Jedi tě teď doprovází na mapě i v přehledu.';

  content.append(nameEl, text, hint);
  overlay.appendChild(createConfetti());

  mount(container);

  return {
    element: overlay,
    destroy() {
      close();
    },
  };
}
