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
  // Mixované mise (topics[]) přičítají podíl každému tématu.
  state.stats.totalSolved += summary.solved;
  state.stats.totalAttempts += summary.solved + summary.mistakes;
  const topics = summary.topics ?? [summary.topic];
  const shareSolved = Math.round(summary.solved / topics.length);
  const shareAttempts = Math.round((summary.solved + summary.mistakes) / topics.length);
  for (const topic of topics) {
    const topicStats = state.stats.perTopic[topic];
    if (topicStats) {
      topicStats.solved += shareSolved;
      topicStats.attempts += shareAttempts;
      // Druhy chyb pro rodičovský přehled (UCV-STATS-001). U mixované mise
      // nevíme, ke kterému tématu chyba patřila - připíšeme ji všem tématům
      // mise, protože přehled hledá vzorec, ne přesnou bilanci.
      topicStats.errors ??= {};
      for (const [kind, count] of Object.entries(summary.errors ?? {})) {
        topicStats.errors[kind] = (topicStats.errors[kind] ?? 0) + count;
      }
    }
  }

  state.stats.missionsCompleted = (state.stats.missionsCompleted ?? 0) + 1;
  state.stats.totalTimeMs = (state.stats.totalTimeMs ?? 0) + (summary.durationMs ?? 0);

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
