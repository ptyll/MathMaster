/**
 * Save modul - jediný přístupový bod k localStorage (UCN-SAVE-001).
 * Nikde jinde v kódu se localStorage nesmí volat, aby šlo později
 * přepnout na serverové API beze změny zbytku hry.
 */

import { createDefaultState, migrate, SCHEMA_VERSION } from './state.js';

export const SAVE_KEY = 'mathmaster-save-v1';
export const BACKUP_KEY = 'mathmaster-save-v1.backup';

/**
 * Vytvoří save store nad libovolným storage (localStorage v prohlížeči,
 * in-memory objekt v testech). Storage musí mít getItem/setItem/removeItem.
 */
export function createSaveStore(storage) {
  function save(state) {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch {
      // Plná kvóta nebo zamítnutý zápis - hra běží dál, jen se neuloží.
      return false;
    }
  }

  return {
    /**
     * Načte herní stav. Vrací null, když nic uloženého není.
     * Poškozená data zálohuje stranou (BACKUP_KEY) a vrátí null - hra
     * pak startuje s novým profilem místo crashnutí. Data s novější
     * verzí schématu nechává nedotčená (downgrade nesmí smazat postup).
     */
    load() {
      let raw;
      try {
        raw = storage.getItem(SAVE_KEY);
      } catch {
        return null;
      }
      if (raw === null || raw === undefined) {
        return null;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        backupCorrupted(storage, raw);
        return null;
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof parsed.version === 'number' &&
        parsed.version > SCHEMA_VERSION
      ) {
        // Novější verze než umíme - data necháváme být, hra startuje bez nich.
        return null;
      }
      let migrated;
      try {
        migrated = migrate(parsed);
      } catch {
        // Pojistka ke kontraktu výše: load() se volá na úrovni modulu při
        // startu hry (main.js), takže výjimka z migrace by znamenala, že se
        // hra vůbec nevykreslí a hráč se nedostane ani k resetu. Žádná
        // budoucí migrace to nesmí způsobit - poškozená data proto řešíme
        // stejně jako nevalidní JSON: zálohovat a začít s novým profilem.
        migrated = null;
      }
      if (migrated === null) {
        backupCorrupted(storage, raw);
        return null;
      }
      return migrated;
    },

    /** Uloží herní stav jako jeden JSON dokument. Vrací true při úspěchu. */
    save,

    /** Smaže uložený postup (nová hra). */
    reset() {
      try {
        storage.removeItem(SAVE_KEY);
      } catch {
        // Zamítnutý přístup k úložišti - není co mazat.
      }
    },

    /** Vytvoří a uloží výchozí stav nového hráče. */
    createNew() {
      const state = createDefaultState();
      save(state);
      return state;
    },
  };
}

function backupCorrupted(storage, raw) {
  try {
    storage.setItem(BACKUP_KEY, raw);
    storage.removeItem(SAVE_KEY);
  } catch {
    // Když selže i záloha, není co řešit - hra startuje nanovo.
  }
}

/** In-memory storage se stejným rozhraním jako localStorage. */
function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

/**
 * Vytvoří výchozí store pro prohlížeč. Když je localStorage nedostupný
 * (kiosk režim, blokované cookies, Safari private), tiše přejde na
 * in-memory úložiště - hra běží, jen se postup neukládá.
 */
export function createBrowserSaveStore() {
  try {
    const probeKey = '__mathmaster_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return createSaveStore(window.localStorage);
  } catch {
    return createSaveStore(createMemoryStorage());
  }
}
