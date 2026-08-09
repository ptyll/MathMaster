/**
 * Zápis výsledku mise do herního stavu (UCV-MISSION-002).
 * Čistá funkce nad state objektem (ten pak uloží save modul).
 *
 * Pravidla: hvězdy se přepisují na maximum; krystal jen při prvním
 * dokončení mise; bonusový krystal jen při prvním zisku 3 hvězd.
 */

/**
 * @param {object} state herní stav (viz js/engine/state.js)
 * @param {object} summary z mission.getSummary()
 * @returns {{starsGranted: number, crystalGranted: boolean, bonusGranted: boolean}}
 */
export function applyMissionResult(state, summary) {
  let planet = state.planets.find((p) => p.planetId === summary.planetId);
  if (!planet) {
    planet = { planetId: summary.planetId, unlockedLevels: 1, starsPerLevel: {}, bestStreak: 0 };
    state.planets.push(planet);
  }

  const previousStars = planet.starsPerLevel[summary.missionId] ?? 0;
  planet.starsPerLevel[summary.missionId] = Math.max(previousStars, summary.stars);

  // Krystal jen při prvním dokončení; bonus při prvním zisku 3 hvězd (i na repeatu).
  const crystalGranted = previousStars === 0;
  const bonusGranted = summary.stars === 3 && previousStars < 3;

  if (crystalGranted) {
    addCrystal(state, summary.crystalColor, 1);
  }
  if (bonusGranted) {
    addCrystal(state, summary.crystalColor, 1);
  }

  // Statistiky - globální i per téma (adaptivita i rodičovský přehled).
  state.stats.totalSolved += summary.solved;
  state.stats.totalAttempts += summary.solved + summary.mistakes;
  const topicStats = state.stats.perTopic[summary.topic];
  if (topicStats) {
    topicStats.solved += summary.solved;
    topicStats.attempts += summary.solved + summary.mistakes;
  }

  return {
    starsGranted: planet.starsPerLevel[summary.missionId],
    crystalGranted,
    bonusGranted,
  };
}

function addCrystal(state, color, count) {
  const entry = state.inventory.crystals.find((c) => c.color === color);
  if (entry) {
    entry.count += count;
  } else {
    state.inventory.crystals.push({ color, count });
  }
}
