import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createScreenMachine,
  initialScreenFor,
  SCREENS,
} from '../js/engine/screens.js';
import { createDefaultState } from '../js/engine/state.js';

test('povolená cesta intro -> mapa -> mise -> vyhodnocení -> mapa', () => {
  const visited = [];
  const machine = createScreenMachine(SCREENS.INTRO, (screen) => visited.push(screen));

  machine.go(SCREENS.MAP);
  machine.go(SCREENS.MISSION);
  machine.go(SCREENS.EVALUATION);
  machine.go(SCREENS.MAP);

  assert.deepEqual(visited, [
    SCREENS.MAP,
    SCREENS.MISSION,
    SCREENS.EVALUATION,
    SCREENS.MAP,
  ]);
  assert.equal(machine.current, SCREENS.MAP);
});

test('nepovolený přechod hodí výjimku', () => {
  const machine = createScreenMachine(SCREENS.INTRO);

  assert.throws(() => machine.go(SCREENS.MISSION), /Nepovolený přechod/);
  assert.equal(machine.current, SCREENS.INTRO);
});

test('neznámá počáteční obrazovka hodí výjimku', () => {
  assert.throws(() => createScreenMachine('hyperspace'), /Neznámá obrazovka/);
});

test('kontext přechodu se předává do onChange', () => {
  let seen = null;
  const machine = createScreenMachine(SCREENS.MAP, (_screen, context) => {
    seen = context;
  });

  machine.go(SCREENS.MISSION, { missionId: 'tatooine-1' });
  assert.deepEqual(seen, { missionId: 'tatooine-1' });
});

test('initialScreenFor: bez profilu intro, s profilem mapa', () => {
  const fresh = createDefaultState();
  assert.equal(initialScreenFor(fresh), SCREENS.INTRO);

  const returning = createDefaultState();
  returning.profile = { name: 'Padawan', createdAt: '2026-08-09T00:00:00Z' };
  assert.equal(initialScreenFor(returning), SCREENS.MAP);

  assert.equal(initialScreenFor(null), SCREENS.INTRO);
});
