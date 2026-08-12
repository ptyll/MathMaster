import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDefaultState, migrate, SCHEMA_VERSION } from '../js/engine/state.js';
import { createSaveStore } from '../js/engine/save.js';
import { applyMissionResult } from '../js/engine/progress.js';
import {
  summarizeStats,
  formatPercent,
  formatDuration,
  MIN_EXERCISES_FOR_REPORT,
} from '../js/engine/stats.js';
import { describeError, allErrorKinds } from '../js/content/errorKinds.js';
import { createMission, createBossMission } from '../js/engine/mission.js';
import { createScreenMachine, SCREENS } from '../js/engine/screens.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

/** Save ve verzi 1 - tvar, jaký měla hra před fází 8. */
function legacyV1State() {
  return {
    version: 1,
    profile: { name: 'Honzik', createdAt: '2026-01-01T00:00:00.000Z' },
    planets: [{ planetId: 'tatooine', unlockedLevels: 4, starsPerLevel: { 'tatooine-1': 3 }, bestStreak: 4 }],
    inventory: { crystals: [{ color: 'modrý', count: 3 }], shipParts: ['trup'] },
    stats: {
      totalSolved: 30,
      totalAttempts: 40,
      perTopic: {
        equations: { solved: 30, attempts: 40, lastErrors: [] },
        fractions: { solved: 0, attempts: 0, lastErrors: [] },
        fractionEquations: { solved: 0, attempts: 0, lastErrors: [] },
      },
    },
    settings: { sound: true, hintsLevel: 'full' },
  };
}

/* --- schéma a migrace --- */

test('nový stav má schéma v2 a pole pro rodičovský přehled', () => {
  const state = createDefaultState();
  assert.equal(state.version, 2);
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(state.stats.missionsCompleted, 0);
  assert.equal(state.stats.totalTimeMs, 0);
  assert.deepEqual(state.stats.perTopic.equations.errors, {});
});

test('migrace v1 -> v2 doplní nová pole a nesmaže postup', () => {
  const migrated = migrate(legacyV1State());
  assert.notEqual(migrated, null);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.stats.missionsCompleted, 0);
  assert.equal(migrated.stats.totalTimeMs, 0);
  assert.deepEqual(migrated.stats.perTopic.equations.errors, {});
  // postup zůstal nedotčený
  assert.equal(migrated.planets[0].starsPerLevel['tatooine-1'], 3);
  assert.equal(migrated.inventory.crystals[0].count, 3);
  assert.deepEqual(migrated.inventory.shipParts, ['trup']);
  assert.equal(migrated.stats.totalSolved, 30);
});

test('migrace v1 doplní i téma wordProblems nulami', () => {
  const migrated = migrate(legacyV1State());
  assert.deepEqual(migrated.stats.perTopic.wordProblems, {
    solved: 0,
    attempts: 0,
    lastErrors: [],
    errors: {},
  });
});

test('save v2 bez klíče wordProblems se při načtení doplní nulami', () => {
  // Save uložený mezi nasazením slovních úloh a této fáze - verze 2,
  // ale perTopic ještě nezná wordProblems (UCN-STATS-002).
  const state = createDefaultState();
  delete state.stats.perTopic.wordProblems;
  state.stats.totalSolved = 7;
  const storage = memoryStorage();
  storage.setItem('mathmaster-save-v1', JSON.stringify(state));

  const loaded = createSaveStore(storage).load();
  assert.notEqual(loaded, null);
  assert.deepEqual(loaded.stats.perTopic.wordProblems, {
    solved: 0,
    attempts: 0,
    lastErrors: [],
    errors: {},
  });
  // zbytek statistik zůstal nedotčený
  assert.equal(loaded.stats.totalSolved, 7);
  assert.equal(loaded.version, 2);
});

test('starý save projde přes save modul a uloží se už jako v2', () => {
  const storage = memoryStorage();
  storage.setItem('mathmaster-save-v1', JSON.stringify(legacyV1State()));
  const store = createSaveStore(storage);
  const loaded = store.load();
  assert.equal(loaded.version, 2);
  assert.equal(loaded.profile.name, 'Honzik');
  store.save(loaded);
  assert.equal(JSON.parse(storage.getItem('mathmaster-save-v1')).version, 2);
});

test('poškozený stav se nezachrání migrací', () => {
  assert.equal(migrate({ version: 1 }), null);
  assert.equal(migrate({ version: 1, planets: [], inventory: null, stats: {}, settings: {} }), null);
});

/* --- zápis statistik z mise --- */

test('dokončená mise zapíše čas, počet misí a druhy chyb', () => {
  const state = createDefaultState();
  applyMissionResult(state, {
    missionId: 'tatooine-1',
    planetId: 'tatooine',
    crystalColor: 'modrý',
    topic: 'equations',
    topics: ['equations'],
    stars: 2,
    mistakes: 3,
    solved: 5,
    total: 5,
    hintsUsed: 0,
    errors: { arithmetic: 2, sign: 1 },
    durationMs: 5 * 60 * 1000,
  });

  assert.equal(state.stats.missionsCompleted, 1);
  assert.equal(state.stats.totalTimeMs, 300000);
  assert.deepEqual(state.stats.perTopic.equations.errors, { arithmetic: 2, sign: 1 });
  assert.equal(state.stats.perTopic.equations.solved, 5);
});

test('druhy chyb se přes více misí sčítají', () => {
  const state = createDefaultState();
  const base = {
    missionId: 'm', planetId: 'tatooine', crystalColor: 'modrý',
    topic: 'equations', topics: ['equations'], stars: 2, solved: 5, total: 5, hintsUsed: 0,
  };
  applyMissionResult(state, { ...base, mistakes: 1, errors: { arithmetic: 1 }, durationMs: 1000 });
  applyMissionResult(state, { ...base, missionId: 'm2', mistakes: 2, errors: { arithmetic: 2, strategy: 1 }, durationMs: 2000 });
  assert.deepEqual(state.stats.perTopic.equations.errors, { arithmetic: 3, strategy: 1 });
  assert.equal(state.stats.missionsCompleted, 2);
  assert.equal(state.stats.totalTimeMs, 3000);
});

test('mise bez pole errors nespadne (starší volání)', () => {
  const state = createDefaultState();
  applyMissionResult(state, {
    missionId: 'm', planetId: 'tatooine', crystalColor: 'modrý',
    topic: 'equations', topics: ['equations'], stars: 3, mistakes: 0, solved: 5, total: 5, hintsUsed: 0,
  });
  assert.deepEqual(state.stats.perTopic.equations.errors, {});
  assert.equal(state.stats.totalTimeMs, 0);
});

test('mise slovních úloh zapisuje do tématu wordProblems včetně equationSetup', () => {
  const state = createDefaultState();
  applyMissionResult(state, {
    missionId: 'mustafar-1',
    planetId: 'mustafar',
    crystalColor: 'červený',
    topic: 'wordProblems',
    topics: ['wordProblems'],
    stars: 1,
    mistakes: 2,
    solved: 4,
    total: 6,
    hintsUsed: 0,
    errors: { equationSetup: 2, arithmetic: 1 },
    durationMs: 60000,
  });

  const topic = state.stats.perTopic.wordProblems;
  assert.equal(topic.solved, 4);
  assert.equal(topic.attempts, 6);
  assert.deepEqual(topic.errors, { equationSetup: 2, arithmetic: 1 });
});

/* --- mise sbírá druhy chyb --- */

test('mise zaznamená druh chyby z odpovědi i z přeskočení', () => {
  const m = createMission({
    id: 'x', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    exerciseCount: 3, startDifficulty: 1, seed: 5,
  });
  m.recordAnswer('wrong', 'sign');
  m.recordAnswer('correct');
  m.skip();
  m.recordAnswer('correct-unsimplified', 'unsimplified');
  const summary = m.getSummary();
  assert.equal(summary.errors.sign, 1);
  assert.equal(summary.errors.skipped, 1);
  assert.equal(summary.errors.unsimplified, 1);
});

test('mise měří odehraný čas přes injektovaný clock', () => {
  let t = 1000;
  const m = createMission({
    id: 'x', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    exerciseCount: 1, startDifficulty: 1, seed: 5, clock: () => t,
  });
  t = 61000;
  assert.equal(m.getSummary().durationMs, 60000);
});

test('boss také hlásí druhy chyb a čas', () => {
  let t = 0;
  const b = createBossMission({
    id: 'boss', planetId: 'p', crystalColor: 'modrý', topic: 'equations',
    startDifficulty: 1, seed: 5, clock: () => t,
  });
  b.recordAnswer('wrong', 'arithmetic');
  t = 30000;
  const summary = b.getSummary();
  assert.equal(summary.errors.arithmetic, 1);
  assert.equal(summary.durationMs, 30000);
});

/* --- vyhodnocení pro přehled --- */

test('pod prahem dat přehled hlásí, že je brzy', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = MIN_EXERCISES_FOR_REPORT - 1;
  assert.equal(summarizeStats(state).hasEnoughData, false);
  state.stats.totalAttempts = MIN_EXERCISES_FOR_REPORT;
  assert.equal(summarizeStats(state).hasEnoughData, true);
});

test('nehrané téma má úspěšnost null, ne nulu', () => {
  const state = createDefaultState();
  state.stats.perTopic.equations = { solved: 8, attempts: 10, errors: {} };
  const summary = summarizeStats(state);
  const equations = summary.topics.find((t) => t.key === 'equations');
  const fractions = summary.topics.find((t) => t.key === 'fractions');
  assert.equal(equations.successRate, 0.8);
  assert.equal(fractions.successRate, null);
  assert.equal(formatPercent(fractions.successRate), '–');
});

test('nejčastější chyby jsou seřazené a nesou doporučení', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = 50;
  state.stats.totalSolved = 30;
  state.stats.perTopic.equations = { solved: 20, attempts: 30, errors: { arithmetic: 2, strategy: 7 } };
  state.stats.perTopic.fractions = { solved: 10, attempts: 20, errors: { strategy: 1, unsimplified: 4 } };

  const summary = summarizeStats(state);
  assert.equal(summary.topErrors[0].kind, 'strategy');
  assert.equal(summary.topErrors[0].count, 8);
  assert.equal(summary.topErrors[1].kind, 'unsimplified');
  assert.ok(summary.topErrors[0].advice.length > 0);
});

test('doporučení ukáže na nejslabší téma a na nejčastější chybu', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = 60;
  state.stats.totalSolved = 40;
  state.stats.perTopic.equations = { solved: 28, attempts: 30, errors: {} };
  state.stats.perTopic.fractions = { solved: 12, attempts: 30, errors: { commonDenominator: 6 } };

  const summary = summarizeStats(state);
  assert.match(summary.recommendations[0], /Zlomky/);
  assert.match(summary.recommendations[1], /jmenovatel/i);
  assert.match(summary.recommendations[2], /Rovnice se zlomky/);
});

test('při dobrých výsledcích doporučení nabídne přitvrdit', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = 40;
  state.stats.totalSolved = 36;
  state.stats.perTopic.equations = { solved: 36, attempts: 40, errors: {} };
  assert.match(summarizeStats(state).recommendations[0], /přitvrďte/i);
});

test('každý druh chyby má popisek i radu', () => {
  for (const kind of allErrorKinds()) {
    const info = describeError(kind);
    assert.ok(info.label.length > 0, kind);
    assert.ok(info.advice.length > 0, kind);
  }
  // neznámý kód nespadne
  assert.equal(describeError('nesmysl').label, 'nesmysl');
});

/* --- slovní úlohy v rodičovském přehledu (UCN-STATS-002) --- */

test('přehled obsahuje téma wordProblems s českým popiskem', () => {
  const summary = summarizeStats(createDefaultState());
  const wordProblems = summary.topics.find((t) => t.key === 'wordProblems');
  assert.ok(wordProblems);
  assert.equal(wordProblems.label, 'Slovní úlohy');
  // nehrané téma = null úspěšnost, ne falešných 0 %
  assert.equal(wordProblems.successRate, null);
});

test('equationSetup má český popisek a radu pro rodiče', () => {
  const info = describeError('equationSetup');
  assert.equal(info.label, 'Sestavení rovnice ze zadání');
  assert.ok(info.advice.length > 0);
  assert.notEqual(info.label, 'equationSetup');
});

test('rodičovský přehled ukáže equationSetup česky s počtem', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = 40;
  state.stats.totalSolved = 20;
  state.stats.perTopic.wordProblems = {
    solved: 8,
    attempts: 20,
    errors: { equationSetup: 5, arithmetic: 2 },
  };
  state.stats.perTopic.equations = { solved: 12, attempts: 20, errors: {} };

  const summary = summarizeStats(state);
  assert.equal(summary.topErrors[0].kind, 'equationSetup');
  assert.equal(summary.topErrors[0].count, 5);
  assert.equal(summary.topErrors[0].label, 'Sestavení rovnice ze zadání');
  assert.ok(summary.topErrors[0].advice.length > 0);
  // doporučení cituje český popisek, ne kód druhu chyby
  assert.match(summary.recommendations.join(' '), /sestavení rovnice ze zadání/i);
});

test('mise s nulou chyb -> žádné chyby v přehledu jako dnes', () => {
  const state = createDefaultState();
  state.stats.totalAttempts = 40;
  state.stats.totalSolved = 40;
  state.stats.perTopic.equations = { solved: 40, attempts: 40, errors: {} };
  const summary = summarizeStats(state);
  assert.deepEqual(summary.topErrors, []);
});

test('formatDuration mluví česky a v rozumných jednotkách', () => {
  assert.equal(formatDuration(0), 'méně než minuta');
  assert.equal(formatDuration(59 * 1000), 'méně než minuta');
  assert.equal(formatDuration(12 * 60 * 1000), '12 min');
  assert.equal(formatDuration(60 * 60 * 1000), '1 h');
  assert.equal(formatDuration(84 * 60 * 1000), '1 h 24 min');
});

/* --- stavový stroj --- */

test('na přehled se dá jen z mapy a vede z něj jen zpět na mapu', () => {
  const machine = createScreenMachine(SCREENS.MAP);
  assert.equal(machine.canGo(SCREENS.STATS), true);
  machine.go(SCREENS.STATS);
  assert.equal(machine.current, SCREENS.STATS);
  assert.equal(machine.canGo(SCREENS.MISSION), false);
  assert.equal(machine.canGo(SCREENS.MAP), true);
});

/* --- Profil hráče v přehledu (UCV-MAP-003) -------------------------------
 *
 * Přehled je jediné místo mimo mapu, kde se titul ukazuje ('v profilu'),
 * takže se testuje přes DOM stub - kdyby ho obrazovka jen počítala a
 * nevykreslila, model by byl pořád zelený.
 */

const { installDom, createContainer } = await import('./domStub.js');
installDom(); // až po statických importech výš - engine na document nesahá
const { createStatsScreen } = await import('../js/ui/statsScreen.js');
const { PLANETS } = await import('../js/content/planets.js');
const { COUNCIL_PLANET_COUNT } = await import('../js/engine/titles.js');

/** Stav s dokončenými planetami a dost daty na vyhodnocení. */
function stateForReport(completedCount, name = 'Rey') {
  const state = createDefaultState();
  state.profile = { name, createdAt: '2026-01-01T00:00:00Z' };
  state.planets = PLANETS.slice(0, completedCount).map((p) => ({
    planetId: p.id,
    unlockedLevels: p.missions.length,
    starsPerLevel: Object.fromEntries(p.missions.map((m) => [m.id, m.boss ? 1 : 3])),
    bestStreak: 3,
  }));
  state.stats.totalAttempts = 60;
  state.stats.totalSolved = 45;
  state.stats.perTopic.equations = { solved: 45, attempts: 60, lastErrors: [], errors: { sign: 4 } };
  return state;
}

test('TDD-MAP-003-L: přehled pro rodiče ukazuje jméno hráče, titul a postup', () => {
  const container = createContainer();
  createStatsScreen(container, { state: stateForReport(5), onBack: () => {} });
  const profile = container.querySelector('.stats-profile');
  assert.ok(profile, 'přehled neukazuje profil hráče');
  assert.ok(profile.textContent.includes('Rey'), 'chybí jméno hráče');
  assert.equal(profile.querySelector('.stats-profile-title').textContent, 'Mistr Jedi');
  assert.ok(
    profile.textContent.includes(`5 z ${COUNCIL_PLANET_COUNT} planet`),
    `postup planetami chybí: "${profile.textContent}"`
  );
  // Počet musí jít z téhož zdroje jako titul Rady. Chováním to dnes rozlišit
  // NELZE - PLANETS.length i COUNCIL_PLANET_COUNT jsou shodně 11, takže by
  // vykreslený text vyšel stejně tak i tak a assert výš by prošel naprázdno.
  // Rozdíl se projeví až dvanáctou planetou ('5 z 12' vedle Rady počítané
  // z 11), proto se ptáme rovnou na zdroj.
  const statsSource = readFileSync(new URL('../js/ui/statsScreen.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, ''); // komentáře pryč - mluví se v nich i o tom, co se tu zakazuje
  assert.match(
    statsSource,
    /COUNCIL_PLANET_COUNT/,
    'přehled nepočítá planety ze stejného zdroje jako titul Rady'
  );
  assert.equal(
    /PLANETS\.length/.test(statsSource),
    false,
    'přehled si počet planet dopočítává z PLANETS.length - po přidání planety se rozejde s titulem Rady'
  );

  // Titul patří i k novému hráči, kde se vyhodnocení ještě nezapnulo -
  // rodič otevře přehled dřív, než dítě nasbírá dost příkladů.
  const early = createContainer();
  const fresh = createDefaultState();
  fresh.profile = { name: 'Nový', createdAt: '2026-08-01T00:00:00Z' };
  createStatsScreen(early, { state: fresh, onBack: () => {} });
  assert.ok(early.querySelector('.stats-early'), 'předpoklad testu: málo dat na vyhodnocení');
  assert.equal(early.querySelector('.stats-profile-title').textContent, 'Padawan');
  assert.ok(early.querySelector('.stats-profile').textContent.includes(`0 z ${PLANETS.length} planet`));

  // Dohraná hra: nejvyšší titul.
  const done = createContainer();
  createStatsScreen(done, { state: stateForReport(PLANETS.length, 'Ahsoka'), onBack: () => {} });
  assert.equal(done.querySelector('.stats-profile-title').textContent, 'Člen rady Jedi');
});
