/**
 * Planety a jejich mise (UCV-MAP-001, UCV-MAP-002).
 * Postup: Tatooine (jednoduché rovnice) -> Hoth (rovnice s násobením)
 * -> Dagobah (zlomky) -> Death Star (rovnice se zlomky) -> Coruscant (mix)
 * -> endgame řetěz Bespin -> Kamino -> Mustafar (mix ve stylu Coruscantu)
 * -> Endor -> Geonosis -> Dathomir (slovní úlohy).
 * Poslední mise planety je vždy boss (mechanika bosse = fáze 7).
 * Grafika i názvy jsou vlastní (DEC-006) - žádné chráněné assety.
 *
 * tier: 'core' = původních pět planet, 'endgame' = rozšíření (DEC-009).
 * nameGenitive: 2. pád jména do vět typu 'krystal z Bespinu' (UCV-REWARD-003).
 * Čeština ho z 1. pádu nespočítá (Kamino -> Kamina, Hvězda smrti -> Hvězdy
 * smrti), takže patří k datům planety - ne do výčtu v obrazovce dílny.
 * Odemykání je jeden nepřerušený řetěz, takže starý uložený postup platí
 * beze změny - hráč s dokončeným Coruscantem má Bespin rovnou odemčený.
 *
 * stepMode (UCN-STEP-002): hráč zadává každou úpravu rovnice místo výsledku.
 * Zapnuto všude, kde dává smysl - zadávat postup je smysl celé hry, ne
 * odměna za pozdější misi. Úlohy s jediným krokem (krácení, rozšiřování,
 * porovnávání zlomků) si režim vypnou samy, příznak jim nevadí.
 * Krokový příklad trvá zhruba trojnásobek času, proto mají mise míň příkladů.
 * Endgame mise mají příkladů ještě míň: těžší příklad trvá dýl a mise má
 * zůstat zhruba stejně dlouhá. Slovní úloha je na tom nejhůř - hráč k ní
 * nejdřív sestavuje rovnici a teprve pak ji řeší po krocích - proto tři.
 */

export const PLANETS = [
  {
    id: 'tatooine',
    tier: 'core',
    name: 'Tatooine',
    nameGenitive: 'Tatooinu',
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
    tier: 'core',
    name: 'Hoth',
    nameGenitive: 'Hothu',
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
    tier: 'core',
    name: 'Dagobah',
    nameGenitive: 'Dagobahu',
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
    tier: 'core',
    name: 'Hvězda smrti',
    nameGenitive: 'Hvězdy smrti',
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
    tier: 'core',
    name: 'Coruscant',
    nameGenitive: 'Coruscantu',
    subtitle: 'Hlavní město - finální mix všeho',
    crystalColor: 'fialový',
    art: 'city',
    missions: [
      { id: 'coruscant-1', title: 'Městká džungle', topics: ['equations', 'fractions'], startDifficulty: 2, exerciseCount: 5, stepMode: true },
      { id: 'coruscant-2', title: 'Výškové výzvy', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 4, exerciseCount: 5, stepMode: true },
      { id: 'coruscant-boss', title: 'Velký mistr', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 6, boss: true, stepMode: true },
    ],
  },
  {
    id: 'bespin',
    tier: 'endgame',
    name: 'Bespin',
    nameGenitive: 'Bespinu',
    subtitle: 'Město v oblacích - rovnice a zlomky',
    crystalColor: 'oranžový',
    art: 'clouds',
    missions: [
      { id: 'bespin-1', title: 'Přístav v mracích', topics: ['equations', 'fractions'], startDifficulty: 3, exerciseCount: 4, stepMode: true },
      { id: 'bespin-2', title: 'Plovoucí plošiny', topics: ['equations', 'fractions'], startDifficulty: 4, exerciseCount: 4, stepMode: true },
      { id: 'bespin-3', title: 'Vichr nad městem', topics: ['equations', 'fractions'], startDifficulty: 5, exerciseCount: 4, stepMode: true },
      { id: 'bespin-boss', title: 'Správce oblačného města', topics: ['equations', 'fractions'], startDifficulty: 5, boss: true, stepMode: true },
    ],
  },
  {
    id: 'kamino',
    tier: 'endgame',
    name: 'Kamino',
    nameGenitive: 'Kamina',
    subtitle: 'Oceánská planeta - zlomky a rovnice se zlomky',
    crystalColor: 'tyrkysový',
    art: 'ocean',
    missions: [
      { id: 'kamino-1', title: 'Déšť nad hladinou', topics: ['fractions', 'fractionEquations'], startDifficulty: 4, exerciseCount: 4, stepMode: true },
      { id: 'kamino-2', title: 'Plošina v bouři', topics: ['fractions', 'fractionEquations'], startDifficulty: 5, exerciseCount: 4, stepMode: true },
      { id: 'kamino-3', title: 'Hlubinná laboratoř', topics: ['fractions', 'fractionEquations'], startDifficulty: 6, exerciseCount: 4, stepMode: true },
      { id: 'kamino-boss', title: 'Lovec z oceánu', topics: ['fractions', 'fractionEquations'], startDifficulty: 6, boss: true, stepMode: true },
    ],
  },
  {
    id: 'mustafar',
    tier: 'endgame',
    name: 'Mustafar',
    nameGenitive: 'Mustafaru',
    subtitle: 'Lávová planeta - všechno dohromady',
    crystalColor: 'žlutý',
    art: 'lava',
    missions: [
      { id: 'mustafar-1', title: 'Lávové řeky', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 5, exerciseCount: 4, stepMode: true },
      { id: 'mustafar-2', title: 'Těžební plošina', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 6, exerciseCount: 4, stepMode: true },
      // Obtížnost 7 je nad stropem všech generátorů - znamená 'každé téma na
      // svém maximu' (viz generateForTopic v js/engine/mission.js).
      { id: 'mustafar-3', title: 'Ohnivá zkouška', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 7, exerciseCount: 4, stepMode: true },
      { id: 'mustafar-boss', title: 'Pán ohně', topics: ['equations', 'fractions', 'fractionEquations'], startDifficulty: 7, boss: true, stepMode: true },
    ],
  },
  {
    id: 'endor',
    tier: 'endgame',
    name: 'Endor',
    nameGenitive: 'Endoru',
    subtitle: 'Lesní měsíc - slovní úlohy',
    crystalColor: 'růžový',
    art: 'forest',
    missions: [
      { id: 'endor-1', title: 'Stezka mezi stromy', topic: 'wordProblems', startDifficulty: 2, exerciseCount: 3, stepMode: true },
      { id: 'endor-2', title: 'Vesnice v korunách', topic: 'wordProblems', startDifficulty: 3, exerciseCount: 3, stepMode: true },
      { id: 'endor-3', title: 'Past na průzkumníky', topic: 'wordProblems', startDifficulty: 4, exerciseCount: 3, stepMode: true },
      { id: 'endor-boss', title: 'Strážce lesa', topic: 'wordProblems', startDifficulty: 4, boss: true, stepMode: true },
    ],
  },
  {
    id: 'geonosis',
    tier: 'endgame',
    name: 'Geonosis',
    nameGenitive: 'Geonosisu',
    subtitle: 'Rudé kaňony - slovní úlohy',
    crystalColor: 'bronzový',
    art: 'canyon',
    missions: [
      { id: 'geonosis-1', title: 'Prach nad kaňonem', topic: 'wordProblems', startDifficulty: 3, exerciseCount: 3, stepMode: true },
      { id: 'geonosis-2', title: 'Slévárna droidů', topic: 'wordProblems', startDifficulty: 4, exerciseCount: 3, stepMode: true },
      { id: 'geonosis-3', title: 'Aréna', topic: 'wordProblems', startDifficulty: 5, exerciseCount: 3, stepMode: true },
      { id: 'geonosis-boss', title: 'Architekt arény', topic: 'wordProblems', startDifficulty: 5, boss: true, stepMode: true },
    ],
  },
  {
    id: 'dathomir',
    tier: 'endgame',
    name: 'Dathomir',
    nameGenitive: 'Dathomiru',
    subtitle: 'Temná planeta - slovní úlohy',
    crystalColor: 'černý',
    art: 'dark',
    missions: [
      { id: 'dathomir-1', title: 'Rudá mlha', topic: 'wordProblems', startDifficulty: 4, exerciseCount: 3, stepMode: true },
      { id: 'dathomir-2', title: 'Trnitá pláň', topic: 'wordProblems', startDifficulty: 5, exerciseCount: 3, stepMode: true },
      { id: 'dathomir-3', title: 'Poslední zkouška', topic: 'wordProblems', startDifficulty: 6, exerciseCount: 3, stepMode: true },
      { id: 'dathomir-boss', title: 'Vládkyně stínů', topic: 'wordProblems', startDifficulty: 6, boss: true, stepMode: true },
    ],
  },
];

/**
 * Původních pět planet. Titul Mistr Jedi patří pořád jim (UCV-MAP-002):
 * endgame řetěz se přidává ZA ně, takže hráči, který doletěl na Coruscant,
 * nesmí titul zpětně zmizet. Odměna za všech 11 planet je samostatná
 * (UCV-MAP-003) a tenhle seznam se jí netýká.
 */
export const CORE_PLANETS = PLANETS.filter((p) => p.tier === 'core');

/**
 * Planety cesty k titulu Člen rady Jedi (UCV-MAP-003) - dnes core + endgame,
 * tedy všech jedenáct.
 *
 * Seznam je vázaný na TIERY, ne na celé PLANETS, přesně z důvodu, proč
 * vznikl CORE_PLANETS: titul za "všechno" se nesmí sám odebrat, až se hra
 * rozšíří. Kdyby se počítal z PLANETS, dostal by hráč s hotovým Dathomirem
 * po přidání dvanácté planety zpátky nižší titul.
 *
 * Až tedy příště přibude planeta, dej jí NOVÝ tier a odměnu za ni řeš
 * novým titulem - do 'core' ani 'endgame' ji nepřidávej.
 */
export const COUNCIL_PLANETS = PLANETS.filter((p) => p.tier === 'core' || p.tier === 'endgame');

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
