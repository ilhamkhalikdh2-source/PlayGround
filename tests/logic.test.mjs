import test from 'node:test';
import assert from 'node:assert/strict';

import {
  angleTo,
  approach,
  ballisticStep,
  circleOverlap,
  clamp,
  explosionDamage,
  formatClock,
  inverseLerp,
  lerp,
  makeTrajectoryPreview,
  mulberry32,
  pick,
  pointInTriangle,
  range,
  snap,
  windToAccel,
} from '../src/logic.js';

test('clamp, lerp and inverseLerp stay inside their ranges', () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(inverseLerp(10, 20, 15), 0.5);
  assert.equal(inverseLerp(10, 10, 15), 0);
});

test('snap rounds to the nearest build cell', () => {
  assert.equal(snap(0, 80), 0);
  assert.equal(snap(39, 80), 0);
  assert.equal(snap(41, 80), 80);
  assert.equal(snap(-41, 80), -80);
});

test('seeded random is deterministic and in range', () => {
  const a = mulberry32(0xabc123);
  const b = mulberry32(0xabc123);
  for (let i = 0; i < 24; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('range and pick respect their inputs', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 20; i += 1) {
    const value = range(rng, -4, 9);
    assert.ok(value >= -4 && value <= 9);
  }
  const list = ['a', 'b', 'c'];
  for (let i = 0; i < 40; i += 1) assert.ok(list.includes(pick(rng, list)));
  assert.equal(pick(() => 0.999, list), 'c');
});

test('pointInTriangle detects interior and exterior points', () => {
  assert.equal(pointInTriangle(2, 2, 0, 0, 6, 0, 0, 6), true);
  assert.equal(pointInTriangle(5, 5, 0, 0, 6, 0, 0, 6), false);
  assert.equal(pointInTriangle(0, 3, 0, 0, 6, 0, 0, 6), true);
});

test('explosionDamage falls off and never exceeds max damage', () => {
  assert.equal(explosionDamage(0, 90, 60), 60);
  assert.equal(explosionDamage(90, 90, 60), 0);
  assert.ok(explosionDamage(30, 90, 60) < 60);
  assert.ok(explosionDamage(10, 90, 60) > explosionDamage(60, 90, 60));
});

test('ballisticStep applies gravity and wind', () => {
  const state = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
  ballisticStep(state, 0.5, 10, 4);
  assert.equal(state.vy, 5);
  assert.equal(state.vx, 2);
  assert.equal(state.x, 1);
  assert.equal(state.y, 2.5);
  assert.equal(state.life, 0.5);
});

test('formatClock renders a padded countdown', () => {
  assert.equal(formatClock(60), '01:00');
  assert.equal(formatClock(9.2), '00:10');
  assert.equal(formatClock(-5), '00:00');
  assert.equal(formatClock(125), '02:05');
});

test('circleOverlap, approach and angleTo behave consistently', () => {
  assert.equal(circleOverlap(0, 0, 5, 9, 0, 4), true);
  assert.equal(circleOverlap(0, 0, 5, 10, 0, 4), false);
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(10, 0, 3), 7);
  assert.equal(approach(10, 10, 3), 10);
  assert.equal(angleTo(0, 0, 10, 0), 0);
  assert.ok(Math.abs(angleTo(0, 0, 0, 10) - Math.PI / 2) < 1e-12);
});

test('windToAccel scales wind into horizontal acceleration', () => {
  assert.equal(windToAccel(0), 0);
  assert.equal(windToAccel(10), 14.5);
  assert.equal(windToAccel(-10), -14.5);
});

test('trajectory preview arcs, stops at solids and respects bounds', () => {
  const start = { x: 100, y: 500 };
  const points = makeTrajectoryPreview(start, -0.6, 900, 800, 0, {
    maxPoints: 160,
    maxTime: 4,
    bounds: { minX: 0, maxX: 1600, waterY: 900 },
  });
  assert.ok(points.length > 20);
  assert.ok(points[0].y < start.y, 'the arc should rise first');
  const peak = Math.min(...points.map((p) => p.y));
  assert.ok(peak < start.y - 100);
  assert.ok(points[points.length - 1].y > points[0].y, 'the arc should fall');

  const blocked = makeTrajectoryPreview(start, -0.6, 900, 800, 0, {
    maxPoints: 160,
    solidAt: (x) => x > 400,
  });
  assert.ok(blocked.every((p) => p.x <= 410));

  const offWorld = makeTrajectoryPreview(start, 0, 900, 800, 0, {
    bounds: { minX: 0, maxX: 300, waterY: 900 },
  });
  assert.ok(offWorld.every((p) => p.x <= 310));
});
