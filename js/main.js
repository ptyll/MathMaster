/**
 * MathMaster - vstupní bod hry.
 * Spojuje save modul a stavový stroj obrazovek, renderuje placeholder
 * obrazovky (skutečný obsah přibývá v dalších fázích plánu).
 *
 * Konvence: dynamický obsah (jméno hráče, skóre, ...) se do DOM vkládá
 * výhradně přes textContent/createElement - innerHTML jen pro statické
 * šablony bez interpolace.
 */

import { createBrowserSaveStore } from './engine/save.js';
import { createScreenMachine, initialScreenFor, SCREENS } from './engine/screens.js';

const store = createBrowserSaveStore();
const state = store.load() ?? store.createNew();

const app = document.getElementById('app');

const machine = createScreenMachine(initialScreenFor(state), (screen, context) => {
  render(screen, context);
});

/** Vykreslí placeholder dané obrazovky. */
function render(screen, context = {}) {
  app.innerHTML = '';
  const el = document.createElement('section');
  el.className = `screen screen-${screen}`;

  if (screen === SCREENS.INTRO) {
    el.innerHTML = `
      <h1>MathMaster</h1>
      <p>Řád rytířů potřebuje tvoji pomoc. Síla plyne skrz matematiku.</p>
      <button class="btn btn-primary" id="start-btn">Začít výcvik</button>
    `;
    el.querySelector('#start-btn').addEventListener('click', () => {
      machine.go(SCREENS.MAP);
    });
  } else if (screen === SCREENS.MAP) {
    el.innerHTML = `
      <h1>Galaktická mapa</h1>
      <p>Zde bude mapa planet (fáze 6).</p>
      <button class="btn btn-primary" id="mission-btn">Zkušební mise</button>
    `;
    el.querySelector('#mission-btn').addEventListener('click', () => {
      machine.go(SCREENS.MISSION, { missionId: 'test' });
    });
  } else if (screen === SCREENS.MISSION) {
    el.innerHTML = `
      <h1>Mise</h1>
      <p>Zde poběží příklady (fáze 4).</p>
      <button class="btn btn-primary" id="eval-btn">Dokončit misi</button>
    `;
    el.querySelector('#eval-btn').addEventListener('click', () => {
      machine.go(SCREENS.EVALUATION);
    });
  } else if (screen === SCREENS.EVALUATION) {
    el.innerHTML = `
      <h1>Vyhodnocení</h1>
      <p>Zde budou hvězdy a odměny (fáze 4).</p>
      <button class="btn btn-primary" id="map-btn">Zpět na mapu</button>
    `;
    el.querySelector('#map-btn').addEventListener('click', () => {
      machine.go(SCREENS.MAP);
    });
  }

  app.appendChild(el);

  // Po přechodu přesunout fokus na nadpis nové obrazovky - klávesový
  // uživatel a screen reader jinak "ztratí půdu pod nohama".
  const heading = el.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

render(machine.current);
