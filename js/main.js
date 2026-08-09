/**
 * MathMaster - vstupní bod hry.
 * Spojuje save modul, stavový stroj obrazovek a jednotlivé obrazovky.
 *
 * Konvence: dynamický obsah (jméno hráče, skóre, ...) se do DOM vkládá
 * výhradně přes textContent/createElement - innerHTML jen pro statické
 * šablony bez interpolace.
 */

import { createBrowserSaveStore } from './engine/save.js';
import { createScreenMachine, initialScreenFor, SCREENS } from './engine/screens.js';
import { createMission } from './engine/mission.js';
import { applyMissionResult } from './engine/progress.js';
import { createMissionScreen } from './ui/missionScreen.js';
import { createEvaluationScreen } from './ui/evaluationScreen.js';
import { getMission, getNextMission, MISSIONS } from './content/missions.js';

const store = createBrowserSaveStore();
const state = store.load() ?? store.createNew();

const app = document.getElementById('app');

/** Úklid aktuální obrazovky (destroy komponent, odposlechy) před překreslením. */
let screenCleanup = null;

const machine = createScreenMachine(initialScreenFor(state), (screen, context) => {
  render(screen, context);
});

/** Seed mise: pokaždé jiná sada příkladů, ale deterministická v rámci stavu. */
function missionSeed(missionId) {
  const planet = state.planets.find((p) => p.planetId === missionId.split('-')[0]);
  const plays = Object.keys(planet?.starsPerLevel ?? {}).length;
  return 1000 + state.stats.totalAttempts + plays * 37;
}

function startMission(missionId) {
  machine.go(SCREENS.MISSION, { missionId });
}

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
    // Plná mapa planet je fáze 6 - zatím seznam dostupných misí.
    const h1 = document.createElement('h1');
    h1.textContent = 'Galaktická mapa';
    const note = document.createElement('p');
    note.textContent = 'Plná mapa planet dorazí ve fázi 6.';
    el.append(h1, note);

    for (const missionConfig of MISSIONS) {
      const planet = state.planets.find((p) => p.planetId === missionConfig.planetId);
      const stars = planet?.starsPerLevel?.[missionConfig.id] ?? 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = `${missionConfig.title} ${'★'.repeat(stars)}`;
      btn.addEventListener('click', () => startMission(missionConfig.id));
      el.appendChild(btn);
    }
  } else if (screen === SCREENS.MISSION) {
    const missionConfig = getMission(context.missionId);
    const mission = createMission({ ...missionConfig, seed: missionSeed(context.missionId) });
    const screen_ = createMissionScreen(el, {
      mission,
      onExit: () => machine.go(SCREENS.MAP),
      onFinish: (summary) => {
        const granted = applyMissionResult(state, summary);
        store.save(state);
        machine.go(SCREENS.EVALUATION, { summary, granted, missionId: context.missionId });
      },
    });
    screenCleanup = () => screen_.destroy();
  } else if (screen === SCREENS.EVALUATION) {
    const { summary, granted, missionId } = context;
    const next = getNextMission(missionId);
    const screen_ = createEvaluationScreen(el, {
      summary,
      granted,
      hasNextMission: next !== null,
      onReplay: () => startMission(missionId),
      onNext: () => startMission(next.id),
      onMap: () => machine.go(SCREENS.MAP),
    });
    screenCleanup = () => screen_.destroy();
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
