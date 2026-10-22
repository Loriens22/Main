import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../src/gameplay/GameStateManager.js';
import { DestinationDisplay } from '../src/gameplay/DestinationDisplay.js';
import { StopManager } from '../src/gameplay/StopManager.js';
import { makeRoute, simulateTrip } from './helpers.js';

test('game state transitions are validated', () => {
  const g = new GameStateManager();
  g.go('menu');
  g.go('setup');
  g.go('loading');
  g.go('playing');
  g.go('paused');
  g.go('playing');
  assert.throws(() => g.go('loading'));
  g.go('menu');
  assert.deepEqual(g.history, ['boot', 'menu', 'setup', 'loading', 'playing', 'paused', 'playing', 'menu']);
});

test('destination display shows 280 and switches at the terminal', () => {
  const r = makeRoute();
  const dd = new DestinationDisplay(r, 'A');
  assert.deepEqual(dd.frontText, { number: '280', text: 'Студентски град' });
  const sm = new StopManager(r.direction('A'));
  sm.on((e) => e.type === 'terminal' && dd.onTerminal());
  simulateTrip(r.direction('A'), sm);
  assert.equal(dd.frontText.text, 'СУ Св. Климент Охридски');
  dd.onTerminal();
  assert.equal(dd.frontText.text, 'Студентски град');
});
