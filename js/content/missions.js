/**
 * Definice misí. Fáze 4: zkušební sada pro první planetu;
 * fáze 6 doplní všechny planety.
 */

export const MISSIONS = [
  {
    id: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    exerciseCount: 5,
    startDifficulty: 1,
    title: 'První kroky',
  },
  {
    id: 'tatooine-2',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    exerciseCount: 6,
    startDifficulty: 2,
    title: 'Pouštní výzva',
  },
  {
    id: 'dagobah-1',
    planetId: 'dagobah',
    crystalColor: 'zelený',
    topic: 'fractions',
    exerciseCount: 5,
    startDifficulty: 1,
    title: 'Zlomková bažina (demo)',
  },
];

export function getMission(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

export function getNextMission(id) {
  const index = MISSIONS.findIndex((m) => m.id === id);
  return index >= 0 && index + 1 < MISSIONS.length ? MISSIONS[index + 1] : null;
}
