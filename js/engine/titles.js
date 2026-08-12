/**
 * Tituly hráče (UCV-MAP-003): Padawan -> ... -> Mistr Jedi -> Člen rady Jedi.
 *
 * Titul je čistě za dokončené planety (boss s aspoň jednou hvězdou),
 * crafting do něj nemluví - droid a brnění jsou motivace navrch.
 *
 * Prahy jsou ČÍSLA ZMRAZENÁ K DNEŠNÍMU STAVU DAT (délky CORE_PLANETS a
 * COUNCIL_PLANETS), ne 'všechny planety v PLANETS'. Kdyby se počítaly ze
 * všech planet, přišel by hráč o titul, jakmile hra dostane další planetu -
 * přesně to už jednou hrozilo Mistru Jedimu (UCV-MAP-002). Nový obsah
 * proto dostane vlastní tier a vlastní titul, tyhle prahy zůstanou.
 *
 * Odemykání planet je jeden nepřerušený řetěz, takže 'dokončených N planet'
 * a 'dokončených prvních N planet' je totéž - prahy tedy stačí jako počty.
 */

import { PLANETS, CORE_PLANETS, COUNCIL_PLANETS } from '../content/planets.js';
import { isPlanetCompleted } from './unlock.js';

/** Kolik planet musí hráč dokončit pro titul Člen rady Jedi (dnes 11). */
export const COUNCIL_PLANET_COUNT = COUNCIL_PLANETS.length;

/**
 * Žebříček titulů od nejnižšího po nejvyšší. `minPlanets` = počet
 * dokončených planet, od kterého titul platí.
 */
export const TITLES = [
  { id: 'padawan', label: 'Padawan', minPlanets: 0 },
  { id: 'senior-padawan', label: 'Zkušený padawan', minPlanets: 2 },
  { id: 'knight', label: 'Rytíř Jedi', minPlanets: 4 },
  // Mistr Jedi = celý základní výcvik, tedy původní pětka (UCV-MAP-002).
  {
    id: 'master',
    label: 'Mistr Jedi',
    minPlanets: CORE_PLANETS.length,
    banner: '🎉 MISTR JEDI! Základní výcvik máš za sebou - a za Coruscantem čeká další cesta. 🎉',
  },
  // Mezistupeň v endgame řetězu, ať šest planet za Coruscantem není
  // beze změny titulu (Bespin, Kamino, Mustafar).
  {
    id: 'guardian',
    label: 'Strážce Řádu',
    minPlanets: CORE_PLANETS.length + 3,
    banner: '🎉 STRÁŽCE ŘÁDU! Půlka endgame cesty je za tebou. 🎉',
  },
  {
    id: 'council',
    label: 'Člen rady Jedi',
    minPlanets: COUNCIL_PLANET_COUNT,
    banner: `🏆 ČLEN RADY JEDI! Všech ${COUNCIL_PLANET_COUNT} planet je volných. 🏆`,
  },
];

/** Počet dokončených planet (boss mise má aspoň jednu hvězdu). */
export function completedPlanetCount(state, planets = PLANETS) {
  return planets.filter((p) => isPlanetCompleted(state, p)).length;
}

/**
 * Nejvyšší dosažený titul hráče. Vrací celý záznam z TITLES,
 * takže volající nemusí znát pořadí ani prahy.
 */
export function titleFor(state, planets = PLANETS) {
  const completed = completedPlanetCount(state, planets);
  let current = TITLES[0];
  for (const title of TITLES) {
    if (completed >= title.minPlanets) {
      current = title;
    }
  }
  return current;
}

/** Má hráč nejvyšší titul, tedy dokončené všechny planety cesty Rady? */
export function isJediCouncil(state, planets = PLANETS) {
  return completedPlanetCount(state, planets) >= COUNCIL_PLANET_COUNT;
}

/**
 * Viděl už hráč slavnostní obrazovku za přijetí do Rady? Slavnost je
 * jednorázová, takže si ji stav musí pamatovat - titul sám se pořád počítá
 * z dokončených planet, tohle je jen značka 'konfety už proběhly'.
 *
 * Čte se přes volitelný přístup: starý save klíč nemá a nesmí kvůli tomu
 * spadnout ani potřebovat migraci - hráč, který mezitím dohrál všechno,
 * slavnost prostě uvidí při nejbližším otevření mapy.
 */
export function hasSeenCouncilCelebration(state) {
  return state.awards?.councilCelebrated === true;
}

/** Zapíše, že slavnost proběhla. Volající pak stav uloží. */
export function markCouncilCelebrationSeen(state) {
  // Poškozený nebo starý save může mít pod 'awards' cokoliv (nebo nic).
  // Zápis vlastnosti na primitiv je ve strict módu TypeError a tenhle kód
  // běží při vykreslení mapy, tedy na kritické cestě hry.
  if (typeof state.awards !== 'object' || state.awards === null || Array.isArray(state.awards)) {
    state.awards = {};
  }
  state.awards.councilCelebrated = true;
}
