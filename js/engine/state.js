/**
 * Herní stav MathMaster - verzované schéma pro localStorage persistenci.
 * Viz UCN-SAVE-001 a datový model v analýze.
 */

export const SCHEMA_VERSION = 2;

/** Prázdné statistiky jednoho tématu. errors = { druhChyby: počet }. */
function emptyTopicStats() {
  return { solved: 0, attempts: 0, lastErrors: [], errors: {} };
}

/** Vytvoří výchozí herní stav pro nového hráče. */
export function createDefaultState() {
  return {
    version: SCHEMA_VERSION,
    profile: null, // { name, createdAt } - null dokud hráč nezadá jméno
    planets: [],   // { planetId, unlockedLevels, starsPerLevel, bestStreak }
    inventory: {
      crystals: [],  // { color, count }
      shipParts: [], // string[]
    },
    stats: {
      totalSolved: 0,
      totalAttempts: 0,
      // Rodičovský přehled (UCV-STATS-001) - schéma v2.
      missionsCompleted: 0,
      totalTimeMs: 0,
      perTopic: {
        equations: emptyTopicStats(),
        fractions: emptyTopicStats(),
        fractionEquations: emptyTopicStats(),
      },
    },
    settings: {
      sound: true,
      hintsLevel: 'full', // 'full' | 'reduced'
    },
  };
}

/**
 * Migruje starší verze uloženého stavu na aktuální schéma.
 * Zatím existuje jen verze 1 - funkce je připravená pro budoucí migrace.
 * Vrací null, pokud data nejdou zmigrovat (poškozená struktura).
 * Novější verzi schématu řeší save modul ještě před voláním migrate().
 */
export function migrate(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  if (typeof data.version !== 'number' || data.version < 1) {
    return null;
  }
  if (data.version > SCHEMA_VERSION) {
    return null;
  }
  if (!isValidShape(data)) {
    return null;
  }
  if (data.version === 1) {
    data = migrateV1toV2(data);
  }
  return data;
}

/**
 * v1 -> v2: rodičovský přehled potřebuje počty druhů chyb, odehraný čas
 * a počet dokončených misí. Postup hráče zůstává nedotčený - doplňujeme
 * jen chybějící pole, aby starý save nepřišel o hvězdy ani krystaly.
 */
function migrateV1toV2(data) {
  const stats = data.stats;
  stats.missionsCompleted ??= 0;
  stats.totalTimeMs ??= 0;
  for (const topic of ['equations', 'fractions', 'fractionEquations']) {
    stats.perTopic[topic] ??= emptyTopicStats();
    stats.perTopic[topic].errors ??= {};
    stats.perTopic[topic].lastErrors ??= [];
  }
  data.version = 2;
  return data;
}

/**
 * Ověří minimální strukturu stavu - syntakticky validní JSON může
 * pořád nést poškozený obsah (špatné typy), který by hru shodil za běhu.
 */
function isValidShape(data) {
  if (data.profile !== null && (typeof data.profile !== 'object' || Array.isArray(data.profile))) {
    return false;
  }
  if (!Array.isArray(data.planets)) {
    return false;
  }
  if (typeof data.inventory !== 'object' || data.inventory === null) {
    return false;
  }
  if (!Array.isArray(data.inventory.crystals) || !Array.isArray(data.inventory.shipParts)) {
    return false;
  }
  if (typeof data.stats !== 'object' || data.stats === null || typeof data.stats.perTopic !== 'object') {
    return false;
  }
  if (typeof data.settings !== 'object' || data.settings === null) {
    return false;
  }
  return true;
}
