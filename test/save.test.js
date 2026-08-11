import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSaveStore, SAVE_KEY, BACKUP_KEY } from '../js/engine/save.js';
import { createDefaultState, migrate, SCHEMA_VERSION } from '../js/engine/state.js';

/** In-memory storage se stejným rozhraním jako localStorage. */
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    _dump: () => Object.fromEntries(data),
  };
}

test('load() vrátí null, když nic není uložené', () => {
  const store = createSaveStore(memoryStorage());
  assert.equal(store.load(), null);
});

test('TDD-SAVE-001-A: save() a load() jsou konzistentní', () => {
  const store = createSaveStore(memoryStorage());
  const state = createDefaultState();
  state.profile = { name: 'Anakin', createdAt: '2026-08-09T00:00:00Z' };
  state.planets = [
    { planetId: 'tatooine', unlockedLevels: 2, starsPerLevel: { 1: 3 }, bestStreak: 5 },
    { planetId: 'hoth', unlockedLevels: 1, starsPerLevel: {}, bestStreak: 0 },
  ];
  store.save(state);

  assert.deepEqual(store.load(), state);
});

test('TDD-SAVE-001-B: poškozený JSON neshodí hru, zálohuje se stranou', () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, '{tohle není json');
  const store = createSaveStore(storage);

  assert.equal(store.load(), null);
  // Poškozená data jsou v záloze a hlavní klíč je uklizený.
  assert.equal(storage.getItem(BACKUP_KEY), '{tohle není json');
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('load() vrátí null u dat bez platné verze (nejdou zmigrovat)', () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ noVersion: true }));
  const store = createSaveStore(storage);

  assert.equal(store.load(), null);
  assert.ok(storage.getItem(BACKUP_KEY) !== null);
});

test('load() nechává novější verzi schématu nedotčenou (downgrade nemaže postup)', () => {
  const storage = memoryStorage();
  const raw = JSON.stringify({ version: SCHEMA_VERSION + 1, profile: { name: 'Ahsoka' } });
  storage.setItem(SAVE_KEY, raw);
  const store = createSaveStore(storage);

  assert.equal(store.load(), null);
  // Data zůstala v SAVE_KEY, nic nešlo do zálohy.
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(storage.getItem(BACKUP_KEY), null);
});

test('load() odmítne strukturálně poškozená data s platnou verzí', () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: SCHEMA_VERSION, profile: 'škola', planets: 42 }));
  const store = createSaveStore(storage);

  assert.equal(store.load(), null);
  assert.ok(storage.getItem(BACKUP_KEY) !== null);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

/**
 * Uloží stav poškozený zadanou mutací a vrátí storage, store a původní JSON.
 * Pomocník pro regresní testy poškozeného perTopic (viz níže).
 */
function poskozenySave(poskod) {
  const state = createDefaultState();
  poskod(state);
  const raw = JSON.stringify(state);
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, raw);
  return { storage, store: createSaveStore(storage), raw };
}

/**
 * Regrese: doplňování chybějících témat běží pro každou verzi save, takže
 * poškozený perTopic vyhazoval TypeError. load() se volá na úrovni modulu
 * v main.js - výjimka by shodila start celé hry a hráč by se nedostal ani
 * k resetu. Kontrakt load() říká: zálohovat a vrátit null.
 */
test('load() nespadne na perTopic = null, jen zálohuje a vrátí null', () => {
  const { storage, store, raw } = poskozenySave((s) => { s.stats.perTopic = null; });

  assert.equal(store.load(), null);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('load() nespadne na téma uložené jako číslo', () => {
  const { storage, store, raw } = poskozenySave((s) => { s.stats.perTopic.wordProblems = 5; });

  assert.equal(store.load(), null);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('load() nespadne na téma uložené jako řetězec', () => {
  const { storage, store, raw } = poskozenySave((s) => { s.stats.perTopic.equations = 'nesmysl'; });

  assert.equal(store.load(), null);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('load() odmítne perTopic jako pole (doplněné klíče by se tiše ztratily)', () => {
  // Do pole by šla témata uložit jako vlastnosti, ale JSON.stringify je při
  // dalším uložení zahodí - raději hned záloha než tichá ztráta statistik.
  const { storage, store, raw } = poskozenySave((s) => { s.stats.perTopic = []; });

  assert.equal(store.load(), null);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('migrate() na poškozeném perTopic vrátí null místo výjimky', () => {
  const poskozeneTvary = [null, [], 'nesmysl', 42];
  for (const perTopic of poskozeneTvary) {
    const state = createDefaultState();
    state.stats.perTopic = perTopic;
    assert.equal(migrate(state), null, `perTopic = ${JSON.stringify(perTopic)}`);
  }
});

test('load() spraví téma s rozbitým errors/lastErrors a zachová počty', () => {
  // Tady se postup zahazovat nemusí - téma je objekt, jen jeho vnitřní pole
  // mají špatný typ. Nahradíme je prázdnými a hráči zůstanou vyřešené příklady.
  const { store } = poskozenySave((s) => {
    s.stats.perTopic.equations = { solved: 12, attempts: 20, errors: 'nesmysl', lastErrors: 7 };
  });

  const loaded = store.load();
  assert.notEqual(loaded, null);
  assert.deepEqual(loaded.stats.perTopic.equations, {
    solved: 12,
    attempts: 20,
    errors: {},
    lastErrors: [],
  });
});

test('save() při padajícím setItem vrátí false a hra nespadne', () => {
  const brokenStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const store = createSaveStore(brokenStorage);

  assert.equal(store.save(createDefaultState()), false);
  // createNew() musí zůstat tiché i při plné kvótě.
  const state = store.createNew();
  assert.equal(state.version, SCHEMA_VERSION);
});

test('reset() smaže uložený postup', () => {
  const store = createSaveStore(memoryStorage());
  store.save(createDefaultState());
  store.reset();

  assert.equal(store.load(), null);
});

test('createNew() vytvoří a uloží výchozí stav', () => {
  const store = createSaveStore(memoryStorage());
  const state = store.createNew();

  assert.equal(state.version, SCHEMA_VERSION);
  assert.equal(state.profile, null);
  assert.deepEqual(store.load(), state);
});

test('výchozí stav má kompletní strukturu dle datového modelu', () => {
  const state = createDefaultState();

  assert.ok(Array.isArray(state.planets));
  assert.ok(Array.isArray(state.inventory.crystals));
  assert.ok(Array.isArray(state.inventory.shipParts));
  assert.equal(state.stats.totalSolved, 0);
  assert.ok(state.stats.perTopic.equations);
  assert.ok(state.stats.perTopic.fractions);
  assert.ok(state.stats.perTopic.fractionEquations);
  assert.deepEqual(state.stats.perTopic.wordProblems, {
    solved: 0,
    attempts: 0,
    lastErrors: [],
    errors: {},
  });
  assert.equal(state.settings.sound, true);
  assert.equal(state.settings.hintsLevel, 'full');
});
