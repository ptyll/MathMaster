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
import { createAnswerInput } from './ui/answerInput.js';
import { generateLinearEquation } from './content/equations.js';

const store = createBrowserSaveStore();
const state = store.load() ?? store.createNew();

const app = document.getElementById('app');

/** Úklid aktuální obrazovky (destroy komponent, odposlechy) před překreslením. */
let screenCleanup = null;

const machine = createScreenMachine(initialScreenFor(state), (screen, context) => {
  render(screen, context);
});

/** Vykreslí placeholder dané obrazovky. */
function render(screen, context = {}) {
  if (screenCleanup) {
    screenCleanup();
    screenCleanup = null;
  }
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
    // Dočasné demo vstupních komponent (fáze 3) - skutečná mise je fáze 4.
    const exercise = generateLinearEquation(7, 2);
    const h1 = document.createElement('h1');
    h1.textContent = 'Zkušební mise';
    const text = document.createElement('p');
    text.className = 'exercise-text';
    text.textContent = exercise.text;
    const feedback = document.createElement('p');
    feedback.className = 'answer-feedback';
    feedback.setAttribute('aria-live', 'polite');
    el.append(h1, text, feedback);

    const inputHost = document.createElement('div');
    el.appendChild(inputHost);
    const input = createAnswerInput(inputHost, {
      expected: exercise.answer,
      mode: 'int',
      onSubmit: (result) => {
        if (result.status === 'correct') {
          feedback.textContent = 'Správně! Krystaly se blíží.';
        } else if (result.status === 'correct-unsimplified') {
          feedback.textContent = result.note;
        } else if (result.status === 'invalid') {
          feedback.textContent = result.note;
        } else {
          feedback.textContent = 'To není ono - zkus to znovu.';
        }
      },
    });
    screenCleanup = () => input.destroy();

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn-primary';
    doneBtn.textContent = 'Dokončit misi';
    doneBtn.addEventListener('click', () => {
      machine.go(SCREENS.EVALUATION);
    });
    el.appendChild(doneBtn);
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
