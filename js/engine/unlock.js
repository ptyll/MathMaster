/**
 * Odemykání planet a dokončenost (UCV-MAP-001). Čisté funkce nad stavem.
 * Planeta se odemkne dokončením poslední (boss) mise předchozí planety.
 */

/**
 * @param {object} state herní stav
 * @param {object[]} planets pole planet z content/planets.js
 * @param {number} index pořadí planety
 */
export function isPlanetUnlocked(state, planets, index) {
  if (index === 0) {
    return true;
  }
  return isPlanetCompleted(state, planets[index - 1]);
}

/** Planeta je dokončená, když její poslední (boss) mise má aspoň 1 hvězdu. */
export function isPlanetCompleted(state, planet) {
  const lastMission = planet.missions[planet.missions.length - 1];
  return starsFor(state, planet.id, lastMission.id) > 0;
}

/** Hvězdy konkrétní mise. */
export function starsFor(state, planetId, missionId) {
  const planet = state.planets.find((p) => p.planetId === planetId);
  return planet?.starsPerLevel?.[missionId] ?? 0;
}

/** Součet hvězd planety (přes všechny její mise). */
export function planetStars(state, planet) {
  return planet.missions.reduce((sum, m) => sum + starsFor(state, planet.id, m.id), 0);
}

/** Maximální možný počet hvězd planety. */
export function planetMaxStars(planet) {
  return planet.missions.length * 3;
}

/** Všechny planety dokončené -> stav 'Mistr Jedi'. */
export function isMasterJedi(state, planets) {
  return planets.every((p) => isPlanetCompleted(state, p));
}

/** Celkový počet krystalů v inventáři. */
export function totalCrystals(state) {
  return state.inventory.crystals.reduce((sum, c) => sum + c.count, 0);
}
