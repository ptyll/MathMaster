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
import { createMission, createBossMission } from './engine/mission.js';
import { applyMissionResult } from './engine/progress.js';
import { hasSword } from './content/crafting.js';
import { createIntroScreen } from './ui/introScreen.js';
import { createMapScreen } from './ui/mapScreen.js';
import { createMissionScreen } from './ui/missionScreen.js';
import { createEvaluationScreen } from './ui/evaluationScreen.js';
import { getMission, getNextMission, isFinalMissionOfPlanet, getPlanet, PLANETS } from './content/planets.js';

const store = createBrowserSaveStore();
const state = store.load() ?? store.createNew();

const app = document.getElementById('app');

/** Úklid aktuální obrazovky (destroy komponent, odposlechy) před překreslením. */
let screenCleanup = null;

const machine = createScreenMachine(initialScreenFor(state), (screen, context) => {
  render(screen, context);
});

/**
 * Seed mise: hash obsahu id (stejně dlouhá id mají jiné příklady)
 * + variace podle odehraných pokusů a spuštění v rámci sezení.
 */
let missionLaunchCounter = 0;
function missionSeed(missionId) {
  let h = 1000;
  for (const ch of missionId) {
    h = (h * 31 + ch.codePointAt(0)) % 1000000;
  }
  missionLaunchCounter++;
  return h + state.stats.totalAttempts * 37 + missionLaunchCounter * 7919;
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
    const screen_ = createIntroScreen(el, {
      onStart: (name) => {
        state.profile = { name, createdAt: new Date().toISOString() };
        store.save(state);
        machine.go(SCREENS.MAP);
      },
    });
    screenCleanup = () => screen_.destroy();
  } else if (screen === SCREENS.MAP) {
    const screen_ = createMapScreen(el, {
      state,
      onStartMission: startMission,
      onStateChanged: () => store.save(state),
    });
    screenCleanup = () => screen_.destroy();
  } else if (screen === SCREENS.MISSION) {
    const missionConfig = getMission(context.missionId);
    const mission = missionConfig.boss
      ? createBossMission({ ...missionConfig, seed: missionSeed(context.missionId) })
      : createMission({ ...missionConfig, seed: missionSeed(context.missionId) });
    const screen_ = createMissionScreen(el, {
      mission,
      hasSword: hasSword(state),
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
    const finishedPlanet = isFinalMissionOfPlanet(missionId);
    const planetIndex = PLANETS.findIndex((p) => p.id === summary.planetId);
    const hasNextPlanet = planetIndex >= 0 && planetIndex + 1 < PLANETS.length;

    const screen_ = createEvaluationScreen(el, {
      summary,
      granted,
      // Poslední mise planety -> nabídka další planety (ta se odemkla na mapě).
      nextLabel: next !== null ? 'Další mise' : finishedPlanet && hasNextPlanet ? `Další planeta: ${getPlanet(PLANETS[planetIndex + 1].id).name}` : null,
      onReplay: () => startMission(missionId),
      onNext: () => {
        if (next !== null) {
          startMission(next.id);
        } else {
          machine.go(SCREENS.MAP);
        }
      },
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
