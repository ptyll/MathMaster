import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSaveStore, SAVE_KEY, BACKUP_KEY } from '../js/engine/save.js';
import { createDefaultState, SCHEMA_VERSION } from '../js/engine/state.js';

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
  assert.equal(state.settings.sound, true);
  assert.equal(state.settings.hintsLevel, 'full');
});
