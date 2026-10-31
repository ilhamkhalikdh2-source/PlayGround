// Pure helpers shared by the simulation, renderer and tests.

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));

export function snap(value, step) {
  return Math.round(value / step) * step;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + (max - min) * rng();
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function explosionDamage(distance, radius, maxDamage) {
  if (distance >= radius) return 0;
  const t = clamp(1 - distance / radius, 0, 1);
  // Hits near the centre stay brutal while the edge falls away smoothly.
  return maxDamage * (0.22 + 0.78 * Math.pow(t, 0.72));
}

export function ballisticStep(state, dt, gravity, windAccel) {
  state.vy += gravity * dt;
  state.vx += windAccel * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.life += dt;
  return state;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function circleOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function windToAccel(wind) {
  return wind * 1.45;
}

export function makeTrajectoryPreview(start, angle, power, gravity, wind, options = {}) {
  const {
    maxPoints = 95,
    step = 1 / 60,
    maxTime = 4.2,
    solidAt = () => false,
    bounds = { minX: 0, maxX: Infinity, waterY: Infinity },
  } = options;
  const points = [];
  const state = {
    x: start.x,
    y: start.y,
    vx: Math.cos(angle) * power,
    vy: Math.sin(angle) * power,
    life: 0,
  };
  const windAccel = windToAccel(wind);
  for (let i = 0; i < maxPoints; i += 1) {
    ballisticStep(state, step, gravity, windAccel);
    points.push({ x: state.x, y: state.y });
    if (state.life >= maxTime) break;
    if (state.x < bounds.minX || state.x > bounds.maxX || state.y > bounds.waterY) break;
    if (solidAt(state.x, state.y)) break;
  }
  return points;
}
