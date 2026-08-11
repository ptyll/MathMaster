/**
 * Herní stav MathMaster - verzované schéma pro localStorage persistenci.
 * Viz UCN-SAVE-001 a datový model v analýze.
 */

export const SCHEMA_VERSION = 2;

/** Prázdné statistiky jednoho tématu. errors = { druhChyby: počet }. */
function emptyTopicStats() {
  return { solved: 0, attempts: 0, lastErrors: [], errors: {} };
}

/**
 * Všechna témata, která mají mít záznam v perTopic. Rodičovský přehled
 * (UCV-STATS-001) je vykresluje v tomto pořadí.
 */
const KNOWN_TOPICS = ['equations', 'fractions', 'fractionEquations', 'wordProblems'];

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
        wordProblems: emptyTopicStats(),
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
  fillMissingTopics(data);
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
  data.version = 2;
  return data;
}

/**
 * Doplní chybějící témata v perTopic nulami. Starý save v2 bez klíče
 * wordProblems (před fází slovních úloh) by jinak neměl v přehledu
 * téma 'Slovní úlohy' a progress/stats kód by musel klíč ošetřovat všude.
 *
 * Volá se až po isValidShape(), takže perTopic i každé téma v něm jsou
 * jistě objekty. Vnitřní pole tématu (errors, lastErrors) dorovnáváme
 * i když mají špatný typ - kvůli jednomu rozbitému poli nemá smysl
 * zahodit hráči celý postup, stačí ho nahradit prázdnou hodnotou.
 */
function fillMissingTopics(data) {
  const perTopic = data.stats.perTopic;
  for (const topic of KNOWN_TOPICS) {
    perTopic[topic] ??= emptyTopicStats();
  }
  // Projíždíme i neznámá témata (save z novější verze po downgradu),
  // aby stats/progress kód nikde nenarazil na cizí typ.
  for (const topicStats of Object.values(perTopic)) {
    if (!isPlainObject(topicStats.errors)) {
      topicStats.errors = {};
    }
    if (!Array.isArray(topicStats.lastErrors)) {
      topicStats.lastErrors = [];
    }
  }
}

/** Objekt se skutečnými klíči - tedy ne null a ne pole. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ověří minimální strukturu stavu - syntakticky validní JSON může
 * pořád nést poškozený obsah (špatné typy), který by hru shodil za běhu.
 */
function isValidShape(data) {
  if (data.profile !== null && !isPlainObject(data.profile)) {
    return false;
  }
  if (!Array.isArray(data.planets)) {
    return false;
  }
  if (!isPlainObject(data.inventory)) {
    return false;
  }
  if (!Array.isArray(data.inventory.crystals) || !Array.isArray(data.inventory.shipParts)) {
    return false;
  }
  // perTopic musí být opravdová mapa témat: typeof null i typeof [] je taky
  // 'object', ale doplňování témat by nad null spadlo (TypeError) a nad polem
  // by se doplněné klíče při dalším JSON.stringify tiše ztratily.
  if (!isPlainObject(data.stats) || !isPlainObject(data.stats.perTopic)) {
    return false;
  }
  // Téma jako číslo nebo řetězec by při dorovnávání polí shodilo migraci -
  // ve strict módu je zápis vlastnosti na primitiv TypeError.
  if (!Object.values(data.stats.perTopic).every(isPlainObject)) {
    return false;
  }
  if (!isPlainObject(data.settings)) {
    return false;
  }
  return true;
}
