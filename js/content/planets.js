/**
 * Planety a jejich mise (UCV-MAP-001).
 * Postup: Tatooine (jednoduché rovnice) -> Hoth (rovnice s násobením)
 * -> Dagobah (zlomky) -> Death Star (rovnice se zlomky) -> Coruscant (mix).
 * Poslední mise planety je vždy boss (mechanika bosse = fáze 7).
 * Grafika i názvy jsou vlastní (DEC-006) - žádné chráněné assety.
 *
 * stepMode (UCN-STEP-002): hráč zadává každou úpravu rovnice místo výsledku.
 * Zapnuto všude, kde dává smysl - zadávat postup je smysl celé hry, ne
 * odměna za pozdější misi. Úlohy s jediným krokem (krácení, rozšiřování,
 * porovnávání zlomků) si režim vypnou samy, příznak jim nevadí.
 * Krokový příklad trvá zhruba trojnásobek času, proto mají mise míň příkladů.
 */

export const PLANETS = [
  {
    id: 'tatooine',
    name: 'Tatooine',
    subtitle: 'Pouštní planeta - jednoduché rovnice',
    crystalColor: 'modrý',
    art: 'desert',
    missions: [
      { id: 'tatooine-1', title: 'První kroky', topic: 'equations', startDifficulty: 1, exerciseCount: 4, stepMode: true },
      { id: 'tatooine-2', title: 'Pouštní výzva', topic: 'equations', startDifficulty: 2, exerciseCount: 4, stepMode: true },
      { id: 'tatooine-3', title: 'Dvojité slunce', topic: 'equations', startDifficulty: 2, exerciseCount: 5, stepMode: true },
      { id: 'tatooine-boss', title: 'Inkvizitor z pouště', topic: 'equations', startDifficulty: 3, boss: true, stepMode: true },
    ],
  },
  {
    id: 'hoth',
    name: 'Hoth',
    subtitle: 'Ledová planeta - rovnice s násobením',
    crystalColor: 'bílý',
    art: 'ice',
    missions: [
      { id: 'hoth-1', title: 'Ledový start', topic: 'equations', startDifficulty: 3, exerciseCount: 4, stepMode: true },
      { id: 'hoth-2', title: 'Zamrzlé závorky', topic: 'equations', startDifficulty: 5, exerciseCount: 4, stepMode: true },
      { id: 'hoth-3', title: 'Sněhová vánice', topic: 'equations', startDifficulty: 6, exerciseCount: 4, stepMode: true },
      { id: 'hoth-boss', title: 'Inkvizitor z ledu', topic: 'equations', startDifficulty: 6, boss: true, stepMode: true },
    ],
  },
  {
    id: 'dagobah',
    name: 'Dagobah',
    subtitle: 'Bažinatá planeta - zlomky',
    crystalColor: 'zelený',
    art: 'swamp',
    missions: [
      { id: 'dagobah-1', title: 'Zlomková bažina', topic: 'fractions', startDifficulty: 1, exerciseCount: 5, stepMode: true },
      { id: 'dagobah-2', title: 'Mistrovství krácení', topic: 'fractions', startDifficulty: 2, exerciseCount: 5, stepMode: true },
      { id: 'dagobah-3', title: 'Síla společného jmenovatele', topic: 'fractions', startDifficulty: 3, exerciseCount: 5, stepMode: true },
      { id: 'dagobah-boss', title: 'Inkvizitor z bažiny', topic: 'fractions', startDifficulty: 3, boss: true, stepMode: true },
    ],
  },
  {
    id: 'deathstar',
    name: 'Hvězda smrti',
    subtitle: 'Bitevní stanice - rovnice se zlomky',
    crystalColor: 'červený',
    art: 'station',
    missions: [
      { id: 'deathstar-1', title: 'Nástup na stanici', topic: 'fractionEquations', startDifficulty: 1, exerciseCount: 4, stepMode: true },
      { id: 'deathstar-2', title: 'Reaktorové chodby', topic: 'fractionEquations', startDifficulty: 2, exerciseCount: 4, stepMode: true },
      { id: 'deathstar-boss', title: 'Temný lord', topic: 'fractionEquations', startDifficulty: 3, boss: true, stepMode: true },
    ],
  },
  {
    id: 'coruscant',
    name: 'Coruscant',
    subtitle: 'Hlavní město - finální mix všeho',
    crystalColor: 'fialový',
    art: 'city',
    missions: [
      { id: 'coruscant-1', title: 'Městká džungle', topics: ['equations', 'fractions'], startDifficulty: 2, exerciseCount: 5, stepMode: true },
      { id: 'coruscant-2', title: 'Výškové výzvy', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 5, exerciseCount: 5, stepMode: true },
      { id: 'coruscant-boss', title: 'Velký mistr', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 6, boss: true, stepMode: true },
    ],
  },
];

export function getPlanet(id) {
  return PLANETS.find((p) => p.id === id) ?? null;
}

export function getMission(id) {
  for (const planet of PLANETS) {
    const mission = planet.missions.find((m) => m.id === id);
    if (mission) {
      return { ...mission, planetId: planet.id, crystalColor: planet.crystalColor };
    }
  }
  return null;
}

/** Další mise v rámci planety, nebo null. */
export function getNextMission(id) {
  for (const planet of PLANETS) {
    const index = planet.missions.findIndex((m) => m.id === id);
    if (index >= 0) {
      return index + 1 < planet.missions.length
        ? { ...planet.missions[index + 1], planetId: planet.id, crystalColor: planet.crystalColor }
        : null;
    }
  }
  return null;
}

/** Je mise poslední (boss) mise své planety? */
export function isFinalMissionOfPlanet(id) {
  for (const planet of PLANETS) {
    const index = planet.missions.findIndex((m) => m.id === id);
    if (index >= 0) {
      return index === planet.missions.length - 1;
    }
  }
  return false;
}
