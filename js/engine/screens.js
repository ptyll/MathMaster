/**
 * Stavový stroj obrazovek: intro -> mapa -> mise -> vyhodnocení.
 * Čistá logika bez DOM - renderování řeší js/main.js.
 */

export const SCREENS = Object.freeze({
  INTRO: 'intro',
  MAP: 'map',
  MISSION: 'mission',
  EVALUATION: 'evaluation',
});

/** Povolené přechody mezi obrazovkami. */
const TRANSITIONS = Object.freeze({
  [SCREENS.INTRO]: [SCREENS.MAP],
  [SCREENS.MAP]: [SCREENS.MISSION],
  [SCREENS.MISSION]: [SCREENS.EVALUATION, SCREENS.MAP],
  [SCREENS.EVALUATION]: [SCREENS.MAP, SCREENS.MISSION],
});

/**
 * Vytvoří stroj obrazovek.
 * @param {string} initial počáteční obrazovka (jedna z SCREENS)
 * @param {(screen: string, context: object) => void} [onChange] callback při změně
 */
export function createScreenMachine(initial, onChange) {
  if (!Object.values(SCREENS).includes(initial)) {
    throw new Error(`Neznámá obrazovka: ${initial}`);
  }
  let current = initial;

  return {
    get current() {
      return current;
    },

    /** Lze přejít na cílovou obrazovku? */
    canGo(target) {
      return TRANSITIONS[current].includes(target);
    },

    /**
     * Přejde na cílovou obrazovku. Nepovolený přechod hodí výjimku.
     * @param {string} target cílová obrazovka
     * @param {object} [context] kontext přechodu (např. { missionId })
     */
    go(target, context = {}) {
      if (!this.canGo(target)) {
        throw new Error(`Nepovolený přechod: ${current} -> ${target}`);
      }
      current = target;
      if (onChange) {
        onChange(current, context);
      }
    },
  };
}

/**
 * Vybere počáteční obrazovku podle herního stavu:
 * profil existuje -> rovnou mapa, jinak intro (UCV-START-001).
 */
export function initialScreenFor(state) {
  return state && state.profile ? SCREENS.MAP : SCREENS.INTRO;
}
