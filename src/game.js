import { Terrain } from './terrain.js';
import { Particles } from './particles.js';
import {
  angleTo,
  approach,
  clamp,
  explosionDamage,
  makeTrajectoryPreview,
  mulberry32,
  pick,
  pointInTriangle,
  range,
  snap,
  windToAccel,
} from './logic.js';

export const WORLD = { width: 1600, height: 900, waterY: 868 };
export const BUILD_GRID = 80;
export const BUILD_RANGE = 430;
export const TURN_TIME = 60;

const GRAVITY = 900;
const WATER = WORLD.waterY;
const WORM_SPEED = 122;
const JUMP_SPEED = 362;

const COST = { wall: 20, floor: 15, ramp: 25 };
const SIZE = {
  wall: { w: 80, h: 80 },
  floor: { w: 80, h: 14 },
  ramp: { w: 80, h: 80 },
};
const MATERIAL_HP = { wood: 95, brick: 175, metal: 285 };

const WEAPONS = {
  bazooka: { speed: 1010, gravity: 730, blast: 86, damage: 56, radius: 7, name: 'BAZOOKA' },
  grenade: { speed: 840, gravity: 840, blast: 98, damage: 68, radius: 8, fuse: 2.15, name: 'GRENADE' },
  cluster: { speed: 890, gravity: 760, blast: 72, damage: 42, radius: 7, name: 'CLUSTER' },
  pickaxe: { name: 'PICKAXE' },
};

const NAMES = {
  0: ['PIP', 'NIBBLES', 'BOLT'],
  1: ['REX', 'VEX', 'NYX'],
};

const AI_LINES = [
  'STORM SQUAD IS LINING UP A SHOT',
  'ENEMY WORM HAS A CLEAR ARC',
  'INCOMING ARTILLERY',
  'THE STORM SQUAD IS BUILDING UP',
];

function pieceRect(piece) {
  return { x: piece.x, y: piece.y, w: piece.w, h: piece.h };
}

function rectCircle(x, y, w, h, cx, cy, r) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function rectDistance(x, y, w, h, cx, cy) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return Math.hypot(cx - nx, cy - ny);
}

export class Game {
  constructor({ audio, onEvent } = {}) {
    this.audio = audio;
    this.onEvent = onEvent || (() => {});
    this.particles = new Particles();
    this.terrain = new Terrain(WORLD.width, WORLD.height);
    this.keys = { left: false, right: false, jump: false };
    this.mouse = { x: 800, y: 420, active: false, down: false };
    this.worms = [];
    this.buildings = [];
    this.projectiles = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
    this.hitVignette = 0;
    this.time = 0;
    this.phase = 'menu';
    this.isOver = false;
    this.buildGrid = BUILD_GRID;
    this.buildRange = BUILD_RANGE;
    this.chargePower = 0;
    this.charging = false;
    this.buildMode = false;
    this.selectedBuild = 'wall';
    this.selectedWeapon = ['bazooka', 'bazooka'];
    this.currentWeapon = 'bazooka';
    this.material = 'wood';
    this.buildsLeft = 4;
    this.timer = TURN_TIME;
    this.wind = 0;
    this.turn = 1;
    this.currentTeam = 0;
    this.currentWorm = null;
    this.wormCursor = [0, 0];
    this.aiState = 'idle';
    this.aiTimer = 0;
    this.aiTarget = null;
    this.shotActive = false;
    this.endDelay = 0;
    this.harvestCooldown = 0;
    this.turnEnding = false;
    this.rng = mulberry32(1);
    this.seed = 1;
    this.stats = { shots: [0, 0], damage: [0, 0], builds: [0, 0], turns: 0 };
    this.newMatch(Date.now() & 0x7fffffff, true);
  }

  setAudio(audio) {
    this.audio = audio;
  }

  newMatch(seed = Date.now() & 0x7fffffff, menu = false) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.terrain.generate(this.rng, this.seed);
    this.particles.clear();
    this.buildings = [];
    this.projectiles = [];
    this.floaters = [];
    this.worms = [];
    this.isOver = false;
    this.phase = menu ? 'menu' : 'player';
    this.turn = 1;
    this.currentTeam = 0;
    this.wormCursor = [0, 0];
    this.wind = 0;
    this.timer = TURN_TIME;
    this.chargePower = 0;
    this.charging = false;
    this.buildMode = false;
    this.selectedBuild = 'wall';
    this.selectedWeapon = ['bazooka', 'bazooka'];
    this.currentWeapon = 'bazooka';
    this.buildsLeft = 4;
    this.material = 'wood';
    this.shotActive = false;
    this.endDelay = 0;
    this.turnEnding = false;
    this.aiState = 'idle';
    this.aiTimer = 0;
    this.shake = 0;
    this.flash = 0;
    this.hitVignette = 0;
    this.stats = { shots: [0, 0], damage: [0, 0], builds: [0, 0], turns: 0 };

    this.materials = [
      { wood: 160, brick: 90, metal: 45 },
      { wood: 160, brick: 90, metal: 45 },
    ];
    this.ammo = [
      { bazooka: Infinity, grenade: 3, cluster: 1 },
      { bazooka: Infinity, grenade: 3, cluster: 1 },
    ];

    const spawns = {
      0: [286, 370, 454],
      1: [1314, 1230, 1146],
    };
    for (const team of [0, 1]) {
      spawns[team].forEach((x, index) => {
        const ground = this.terrain.groundBelow(x, 0, this.terrain.height);
        const y = Math.min(ground ?? 640, WATER - 30) - 1;
        const facing = team === 0 ? 1 : -1;
        this.worms.push({
          team,
          index,
          name: NAMES[team][index],
          x,
          y,
          spawnX: x,
          spawnY: y,
          vx: 0,
          vy: 0,
          onGround: true,
          health: 100,
          maxHealth: 100,
          dead: false,
          facing,
          aimAngle: team === 0 ? -0.55 : Math.PI + 0.55,
          phase: this.rng() * Math.PI * 2,
          hurtTimer: 0,
          showPlate: 4,
          fallStart: y,
          weapon: 'bazooka',
          grave: null,
          recoil: 0,
        });
      });
    }

    this.currentWorm = this.worms[0];
    this.currentWorm.showPlate = 999;
    this.emit('refresh');
    this.emit('teams');
  }

  start() {
    if (this.phase === 'over') this.newMatch(Date.now() & 0x7fffffff, false);
    this.beginTurn(0, true);
  }

  emit(type, detail = {}) {
    this.onEvent({ type, ...detail });
  }

  toast(text, bad = false) {
    this.emit('toast', { text, bad });
  }

  playSound(name) {
    this.audio?.play?.(name);
  }

  // -------------------------------------------------------------------------
  // Turn flow
  // -------------------------------------------------------------------------

  beginTurn(team, first = false) {
    if (this.isOver) return;
    const alive = this.worms.filter((w) => w.team === team && !w.dead);
    if (!alive.length) {
      this.endMatch(1 - team);
      return;
    }
    this.currentTeam = team;
    let guard = 0;
    let worm = null;
    while (!worm && guard < 6) {
      const candidate = this.worms.find((w) => w.team === team && w.index === this.wormCursor[team]);
      if (candidate && !candidate.dead) worm = candidate;
      this.wormCursor[team] = (this.wormCursor[team] + 1) % 3;
      guard += 1;
    }
    if (!worm) worm = alive[0];

    for (const w of this.worms) {
      if (!w.dead) w.showPlate = w === worm ? 999 : 0;
    }
    this.currentWorm = worm;
    this.currentWorm.showPlate = 999;
    this.currentWorm.weapon = this.selectedWeapon[team];
    this.currentWeapon = this.currentWorm.weapon;
    this.phase = team === 0 ? 'player' : 'ai';
    this.timer = TURN_TIME;
    this.buildsLeft = 4;
    this.buildMode = false;
    this.chargePower = 0;
    this.charging = false;
    this.turnEnding = false;
    this.shotActive = false;
    this.endDelay = 0;
    this.harvestCooldown = 0;
    this.materials[team].wood = Math.min(999, this.materials[team].wood + 10);
    this.wind = Math.round(range(this.rng, -58, 58));
    if (first) this.wind = Math.round(range(this.rng, -24, 24));
    this.turn += first ? 0 : 1;
    this.stats.turns += 1;

    // Face the nearest enemy so the idle pose reads clearly.
    const enemies = this.worms.filter((w) => w.team !== team && !w.dead);
    const target = enemies.reduce((best, w) => {
      if (!best) return w;
      return Math.abs(w.x - worm.x) < Math.abs(best.x - worm.x) ? w : best;
    }, null);
    if (target) {
      worm.aimAngle = angleTo(worm.x, worm.y - 42, target.x, target.y - 20);
      worm.facing = target.x >= worm.x ? 1 : -1;
    }
    this.mouse.active = false;

    if (team === 0) {
      this.playSound('turn');
      this.toast(first ? 'YOUR TURN — BUILD, HARVEST, FIRE' : `YOUR TURN — ${worm.name} IS UP`);
      this.emit('turn');
    } else {
      this.aiState = 'think';
      this.aiTimer = 1.15;
      this.aiTarget = null;
      this.toast(pick(this.rng, AI_LINES), true);
      this.playSound('turn');
      this.emit('turn');
    }
    this.emit('refresh');
  }

  endTurn(manual = false) {
    if (!['player', 'ai', 'resolving'].includes(this.phase)) return;
    if (this.shotActive) return;
    this.charging = false;
    this.chargePower = 0;
    if (manual && this.phase === 'player') this.toast('TURN PASSED');
    this.phase = 'switching';
    this.turnEnding = true;
    this.endDelay = 0.55;
    this.pendingTeam = 1 - this.currentTeam;
    this.emit('refresh');
  }

  updateTurnFlow(dt) {
    if (this.turnEnding) {
      this.endDelay -= dt;
      if (this.endDelay <= 0 && this.phase === 'switching') {
        this.turnEnding = false;
        this.beginTurn(this.pendingTeam ?? 1 - this.currentTeam);
      }
      return;
    }
    if (this.shotActive) {
      const hasLiveProjectiles = this.projectiles.length > 0;
      if (!hasLiveProjectiles) {
        this.shotActive = false;
        this.endDelay = 1.25;
        this.phase = 'resolving';
      }
      return;
    }
    if (this.phase === 'resolving') {
      this.endDelay -= dt;
      if (this.endDelay <= 0 && !this.isOver) this.endTurn(false);
      return;
    }
    if (this.phase === 'player') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.toast('OUT OF TIME', true);
        this.endTurn(false);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  update(dt) {
    dt = clamp(dt, 0, 1 / 24);
    this.time += dt;
    if (this.charging && this.phase === 'player') {
      this.chargePower = Math.min(1, this.chargePower + dt / 1.05);
    }
    this.shake = Math.max(0, this.shake - dt * 1.9);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.hitVignette = Math.max(0, this.hitVignette - dt * 1.25);
    this.harvestCooldown = Math.max(0, this.harvestCooldown - dt);

    this.particles.update(dt, this.terrain);
    this.updateFloaters(dt);
    this.updateBuildings(dt);
    this.updateWorms(dt);
    this.updateProjectiles(dt);
    this.updateTurnFlow(dt);

    if (this.phase === 'ai' && !this.isOver) this.updateAI(dt);

    // Ambient island details
    if (this.phase === 'menu') {
      this.timer = TURN_TIME;
    }
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.94, dt * 60);
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  addFloater(x, y, text, color = '#ffe14a', size = 15) {
    this.floaters.push({ x, y, text, color, size, life: 1.25, maxLife: 1.25, vy: -52 });
  }

  updateBuildings(dt) {
    for (let i = this.buildings.length - 1; i >= 0; i -= 1) {
      const b = this.buildings[i];
      b.age = Math.min(1, b.age + dt * 7);
      if (b.fading) {
        b.life -= dt * 3;
        if (b.life <= 0) this.buildings.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Worms
  // -------------------------------------------------------------------------

  updateWorms(dt) {
    for (const worm of this.worms) {
      if (worm.dead) continue;
      worm.hurtTimer = Math.max(0, worm.hurtTimer - dt);
      worm.recoil = Math.max(0, worm.recoil - dt * 5);
      if (worm.showPlate > 0 && worm.showPlate < 900) worm.showPlate -= dt;

      const controllable = this.phase === 'player' && worm === this.currentWorm;
      if (controllable) {
        let dir = 0;
        if (this.keys.left) dir -= 1;
        if (this.keys.right) dir += 1;
        if (dir !== 0 && !this.turnEnding) {
          worm.vx = approach(worm.vx, dir * WORM_SPEED, 980 * dt);
          worm.facing = dir;
        } else {
          worm.vx = approach(worm.vx, 0, 1250 * dt);
        }
        if (this.keys.jump && worm.onGround && !this.turnEnding) {
          worm.vy = -JUMP_SPEED;
          worm.onGround = false;
          worm.fallStart = worm.y;
          this.keys.jump = false;
          this.audio?.play('jump');
          this.particles.dust(worm.x, worm.y, 5);
        }
        if (this.mouse.active) {
          worm.aimAngle = angleTo(worm.x, worm.y - 42, this.mouse.x, this.mouse.y);
        }
      } else {
        worm.vx = approach(worm.vx, 0, 1320 * dt);
      }
      if (!worm.onGround) worm.vy = Math.min(1150, worm.vy + GRAVITY * dt);
      this.moveWorm(worm, dt);
    }
  }

  moveWorm(worm, dt) {
    const wasGround = worm.onGround;
    // Horizontal with small step-up support.
    if (Math.abs(worm.vx) > 0.5) {
      const nx = worm.x + worm.vx * dt;
      const probe = this.groundAt(nx, worm.y - 16, 30);
      let targetY = worm.y;
      if (probe !== null && probe >= worm.y - 15 && probe < worm.y - 0.5) targetY = probe;
      const tooHigh = probe !== null && probe < worm.y - 15;
      const blocked = this.blockedAt(nx, targetY, worm);
      if (!tooHigh && !blocked) {
        worm.x = nx;
        if (targetY < worm.y) worm.y = targetY;
      } else {
        worm.vx = 0;
      }
    }

    worm.x = clamp(worm.x, 12, WORLD.width - 12);

    // Vertical.
    const ny = worm.y + worm.vy * dt;
    if (worm.vy >= 0) {
      const drop = Math.max(4, ny - worm.y + 6);
      const support = this.groundAt(worm.x, worm.y - 3, drop);
      if (support !== null && ny >= support) {
        if (!wasGround) {
          const fall = support - worm.fallStart;
          if (fall > 175) {
            const dmg = Math.round((fall - 150) * 0.14);
            if (dmg > 0) this.damageWorm(worm, dmg, 'fall', true);
            this.shake = Math.max(this.shake, 0.15);
            this.particles.dust(worm.x, worm.y, 9);
            this.audio?.play('land');
          } else if (fall > 35) {
            this.particles.dust(worm.x, worm.y, 4);
          }
        }
        worm.y = support;
        worm.vy = 0;
        worm.onGround = true;
        worm.fallStart = support;
      } else {
        if (wasGround) worm.fallStart = worm.y;
        worm.y = ny;
        worm.onGround = false;
      }
    } else {
      worm.y = ny;
      worm.onGround = false;
      // stop upward motion if the head enters solid ground or a wall
      if (this.blockedAt(worm.x, worm.y, worm, true)) {
        worm.vy = 12;
      }
    }

    if (worm.y > WATER - 5) this.drownWorm(worm);
  }

  groundAt(x, fromY, maxDrop) {
    if (x < 0 || x > WORLD.width) return null;
    let best = null;
    const terrainY = this.terrain.groundBelow(x, Math.max(0, fromY), Math.min(WORLD.height, fromY + maxDrop));
    if (terrainY !== null) best = terrainY - 1;

    for (const b of this.buildings) {
      if (b.fading) continue;
      if (b.type === 'ramp') {
        if (x < b.x || x > b.x + b.w) continue;
        const t = (x - b.x) / b.w;
        const lineY = b.flip ? b.y + t * b.h : b.y + b.h - t * b.h;
        if (lineY >= fromY - 1 && lineY <= fromY + maxDrop) {
          const support = lineY - 1;
          if (best === null || support < best) best = support;
        }
      } else if (x >= b.x - 2 && x <= b.x + b.w + 2) {
        if (b.y >= fromY - 1 && b.y <= fromY + maxDrop) {
          const support = b.y - 1;
          if (best === null || support < best) best = support;
        }
      }
    }
    return best;
  }

  blockedAt(x, feetY, worm = null, ceiling = false) {
    if (x < 8 || x > WORLD.width - 8) return true;
    const points = ceiling
      ? [[x, feetY - 26], [x - 6, feetY - 20], [x + 6, feetY - 20]]
      : [[x - 6, feetY - 6], [x + 6, feetY - 6], [x - 6, feetY - 18], [x + 6, feetY - 18], [x, feetY - 30]];
    for (const [px, py] of points) {
      if (this.terrain.solidAt(px, py)) return true;
    }
    for (const b of this.buildings) {
      if (b.fading || b.type === 'floor' || b.type === 'ramp') continue;
      if (rectCircle(b.x, b.y, b.w, b.h, x, feetY - 18, 10)) return true;
    }
    return false;
  }

  drownWorm(worm) {
    if (worm.dead) return;
    worm.dead = true;
    worm.health = 0;
    worm.grave = null;
    this.particles.splash(worm.x, WATER + 2);
    this.particles.death(worm.x, WATER - 10, worm.team === 0 ? '#6ce9ac' : '#ff8790');
    this.playSound('splash');
    this.toast(`${worm.name} WENT SWIMMING`, true);
    this.emit('teams');
    this.checkTeamWipe();
  }

  // -------------------------------------------------------------------------
  // Projectiles and explosions
  // -------------------------------------------------------------------------

  muzzleFor(worm) {
    const angle = worm.aimAngle;
    return {
      x: worm.x + Math.cos(angle) * 30,
      y: worm.y - 42 + Math.sin(angle) * 26,
    };
  }

  fire() {
    if (this.phase !== 'player' && this.phase !== 'ai') return false;
    const worm = this.currentWorm;
    if (!worm || worm.dead) return false;
    const weaponName = worm.weapon || this.currentWeapon;
    if (weaponName === 'pickaxe') return false;
    const ammo = this.ammo[worm.team][weaponName];
    if (ammo <= 0) {
      this.toast('NO AMMO LEFT', true);
      this.playSound('deny');
      this.charging = false;
      return false;
    }
    const config = WEAPONS[weaponName];
    const power = clamp(this.chargePower, 0.16, 1);
    const muzzle = this.muzzleFor(worm);
    const speed = config.speed * power;
    const kind = weaponName === 'bazooka' ? 'rocket' : weaponName;
    this.projectiles.push({
      kind,
      x: muzzle.x,
      y: muzzle.y,
      vx: Math.cos(worm.aimAngle) * speed,
      vy: Math.sin(worm.aimAngle) * speed,
      gravity: config.gravity,
      blast: config.blast,
      damage: config.damage,
      radius: config.radius,
      ownerTeam: worm.team,
      owner: worm,
      life: 0,
      fuse: config.fuse ?? 0,
      spin: 0,
      trail: 0,
      ignore: 0.12,
      minis: kind === 'cluster' ? 4 : 0,
    });
    if (ammo !== Infinity) this.ammo[worm.team][weaponName] -= 1;
    this.stats.shots[worm.team] += 1;
    this.phase = 'firing';
    this.shotActive = true;
    this.charging = false;
    this.chargePower = 0;
    this.buildMode = false;
    this.shake = Math.max(this.shake, kind === 'rocket' ? 0.32 : 0.22);
    this.flash = Math.max(this.flash, 0.14);
    this.particles.muzzle(muzzle.x, muzzle.y, worm.aimAngle, kind === 'rocket' ? 1 : 0.7);
    this.particles.dust(worm.x, worm.y, 4);
    worm.recoil = 1;
    this.playSound('shoot');
    this.emit('refresh');
    return true;
  }

  updateProjectiles(dt) {
    if (!this.projectiles.length) return;
    const steps = Math.max(2, Math.ceil(dt / 0.006));
    const step = dt / steps;
    const windAccel = windToAccel(this.wind);

    outer: for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      for (let s = 0; s < steps; s += 1) {
        p.vy += p.gravity * step;
        p.vx += windAccel * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.life += step;
        if (p.kind !== 'rocket') p.spin += step * (p.kind === 'cluster' ? 9 : 5);

        if (p.life < p.ignore) continue;
        if (p.x < -180 || p.x > WORLD.width + 180 || p.y < -500) {
          this.projectiles.splice(i, 1);
          continue outer;
        }
        if (p.y > WATER) {
          this.projectiles.splice(i, 1);
          this.particles.splash(p.x, WATER);
          this.playSound('splash');
          continue outer;
        }
        if (p.fuse > 0 && p.life >= p.fuse) {
          this.projectiles.splice(i, 1);
          this.explode(p.x, p.y, p.blast, p.damage, p.ownerTeam, p.kind);
          continue outer;
        }

        const hitPiece = this.pieceAtPoint(p.x, p.y);
        const hitTerrain = this.terrain.solidAt(p.x, p.y);
        if (hitPiece || hitTerrain) {
          if (p.kind === 'grenade') {
            this.bounceGrenade(p, hitPiece);
            break;
          }
          this.projectiles.splice(i, 1);
          this.explode(p.x, p.y, p.blast, p.damage, p.ownerTeam, p.kind);
          continue outer;
        }

        for (const worm of this.worms) {
          if (worm.dead) continue;
          if (p.life < 0.22 && worm === p.owner) continue;
          const dx = p.x - worm.x;
          const dy = p.y - (worm.y - 22);
          if (dx * dx + dy * dy < (12 + p.radius) ** 2) {
            this.projectiles.splice(i, 1);
            this.explode(p.x, p.y, p.blast, p.damage, p.ownerTeam, p.kind);
            continue outer;
          }
        }

        if (p.kind === 'rocket') {
          p.trail += step;
          if (p.trail > 0.016) {
            p.trail = 0;
            this.particles.rocketTrail(p.x, p.y, Math.atan2(p.vy, p.vx));
          }
        } else if (p.trail > 0.07) {
          p.trail = 0;
          this.particles.grenadeTrail(p.x, p.y);
        } else {
          p.trail += step;
        }
      }
    }
  }

  bounceGrenade(p, piece) {
    p.vy = -Math.abs(p.vy) * 0.46;
    p.vx *= 0.72;
    p.y -= 3;
    if (p.vy > -40) p.vy = -90;
    this.particles.dust(p.x, p.y, 4);
    this.playSound('bounce');
    if (p.fuse > 0 && p.life > p.fuse) return;
    if (piece) this.damageBuilding(piece, 8, p.ownerTeam, p.x, p.y);
  }

  explode(x, y, radius, damage, ownerTeam, kind = 'rocket') {
    this.particles.explosion(x, y, radius, {});
    this.shake = Math.max(this.shake, radius / 165);
    this.flash = Math.max(this.flash, 0.08);
    this.playSound('explode', radius / 90);
    this.terrain.destroyCircle(x, y, radius * 0.72);
    this.audio?.play('launch');

    // Buildings take a beating and often come down.
    for (let i = this.buildings.length - 1; i >= 0; i -= 1) {
      const b = this.buildings[i];
      if (b.fading) continue;
      const dist = rectDistance(b.x, b.y, b.w, b.h, x, y);
      if (dist < radius + 12) {
        const dmg = explosionDamage(dist, radius + 12, damage * 1.7);
        this.damageBuilding(b, dmg, ownerTeam, x, y, true);
      }
    }

    // Worms.
    for (const worm of this.worms) {
      if (worm.dead) continue;
      const bodyY = worm.y - 21;
      const dist = Math.hypot(worm.x - x, bodyY - y);
      if (dist < radius + 18) {
        const dealt = Math.round(explosionDamage(Math.max(0, dist - 8), radius + 18, damage));
        if (dealt > 0) {
          this.damageWorm(worm, dealt, 'blast', false);
          const force = clamp(1 - dist / (radius + 18), 0, 1);
          const a = Math.atan2(bodyY - y, worm.x - x);
          worm.vx += Math.cos(a) * force * 290;
          worm.vy = Math.min(worm.vy, -Math.abs(Math.sin(a)) * force * 320 - force * 120);
          worm.onGround = false;
          worm.fallStart = worm.y;
          this.addFloater(worm.x, worm.y - 56, `-${dealt}`, worm.team === 0 ? '#ff9b9b' : '#ffe14a');
          if (worm.team === 0) this.hitVignette = Math.max(this.hitVignette, 0.8);
        }
      }
    }

    if (kind === 'cluster') this.spawnBomblets(x, y, ownerTeam, radius);
    this.afterDamage();
  }

  spawnBomblets(x, y, ownerTeam, radius) {
    for (let i = 0; i < 4; i += 1) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.55 + range(this.rng, -0.12, 0.12);
      const speed = range(this.rng, 160, 310);
      this.projectiles.push({
        kind: 'cluster',
        x,
        y: y - 6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        gravity: 780,
        blast: radius * 0.62,
        damage: 28,
        radius: 5,
        ownerTeam,
        owner: null,
        life: 0,
        fuse: range(this.rng, 0.55, 0.95),
        spin: range(this.rng, 0, Math.PI),
        trail: 0,
        ignore: 0.1,
        minis: 0,
      });
    }
  }

  damageBuilding(piece, amount, ownerTeam, x, y, explosive = false) {
    if (piece.fading) return;
    piece.hp -= amount;
    piece.hp = Math.max(0, piece.hp);
    if (explosive) {
      this.particles.buildBurst(x, y, piece.material, false);
    }
    const idx = this.buildings.indexOf(piece);
    if (piece.hp <= 0 && idx >= 0) {
      this.buildings.splice(idx, 1);
      this.particles.buildBurst(piece.x + piece.w / 2, piece.y + piece.h / 2, piece.material, true);
      this.playSound(piece.material === 'metal' ? 'buildMetal' : 'build');
    }
  }

  afterDamage() {
    this.emit('teams');
    this.emit('refresh');
    this.checkTeamWipe();
  }

  damageWorm(worm, amount, source, quiet = false) {
    if (worm.dead) return;
    const dealt = Math.max(1, Math.round(amount));
    worm.health = Math.max(0, worm.health - dealt);
    worm.hurtTimer = 0.35;
    worm.showPlate = Math.max(worm.showPlate, 2.5);
    if (source === 'blast') {
      this.stats.damage[1 - worm.team] += dealt;
      this.particles.hurt(worm.x, worm.y - 24, worm.team === 0 ? '#ff6d72' : '#ffe14a');
      this.playSound('hurt');
    }
    if (worm.team === 0) {
      this.hitVignette = Math.max(this.hitVignette, 0.45);
    }
    if (worm.health <= 0) this.killWorm(worm);
    if (!quiet) this.emit('teams');
  }

  killWorm(worm) {
    if (worm.dead) return;
    worm.dead = true;
    worm.health = 0;
    worm.grave = { x: worm.x, y: this.groundAt(worm.x, worm.y - 40, 200) ?? worm.y };
    this.particles.death(worm.x, worm.y - 22, worm.team === 0 ? '#6ce9ac' : '#ff8790');
    this.shake = Math.max(this.shake, 0.3);
    this.flash = Math.max(this.flash, 0.2);
    this.addFloater(worm.x, worm.y - 66, 'WORM DOWN', worm.team === 0 ? '#ff9b9b' : '#ffe14a', 13);
    this.toast(`${worm.name} GOT STORMED`, worm.team === 0);
    this.playSound(worm.team === 0 ? 'hurt' : 'explode');
    this.emit('teams');
    this.checkTeamWipe();
  }

  checkTeamWipe() {
    if (this.isOver) return;
    for (const team of [0, 1]) {
      if (!this.worms.some((w) => w.team === team && !w.dead)) {
        this.endMatch(1 - team);
        return;
      }
    }
  }

  endMatch(winner) {
    if (this.isOver) return;
    this.isOver = true;
    this.phase = 'over';
    this.charging = false;
    this.chargePower = 0;
    this.turnEnding = false;
    this.isWinner = winner === 0;
    if (winner === 0) {
      this.particles.confetti(800, 260, 150);
      this.playSound('victory');
    } else {
      this.playSound('defeat');
    }
    this.emit('gameover', { winner, stats: this.stats });
    this.emit('refresh');
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  setPointer(x, y, active = true) {
    this.mouse.x = x;
    this.mouse.y = y;
    if (active) this.mouse.active = true;
  }

  pointerDown() {
    if (this.phase !== 'player' || this.isOver) return;
    if (this.buildMode) {
      this.placeBuild();
      return;
    }
    if (this.currentWeapon === 'pickaxe') {
      this.harvest(this.mouse.x, this.mouse.y);
      return;
    }
    if (this.charging) return;
    this.charging = true;
    this.chargePower = 0;
    this.playSound('charge');
  }

  pointerUp() {
    if (this.charging && this.phase === 'player') {
      if (this.chargePower < 0.05) {
        this.charging = false;
        return;
      }
      this.fire();
    }
  }

  beginCharge() {
    if (this.phase !== 'player' || this.buildMode || this.currentWeapon === 'pickaxe') return;
    if (this.charging) return;
    this.charging = true;
    this.chargePower = 0;
    this.playSound('charge');
  }

  releaseCharge() {
    this.pointerUp();
  }

  toggleBuild(type) {
    if (this.phase !== 'player' || this.isOver) return;
    if (this.buildMode && (!type || this.selectedBuild === type)) {
      this.buildMode = false;
      this.toast('BUILD KIT STOWED');
      this.emit('refresh');
      return;
    }
    this.buildMode = true;
    this.selectedBuild = type || this.selectedBuild;
    this.charging = false;
    this.chargePower = 0;
    this.playSound('select');
    this.toast(`${this.selectedBuild.toUpperCase()} — CLICK TO PLACE`);
    this.emit('refresh');
  }

  setMaterial(material) {
    if (!['wood', 'brick', 'metal'].includes(material)) return;
    this.material = material;
    if (this.buildMode) this.toast(`${material.toUpperCase()} SELECTED`);
    this.playSound('ui');
    this.emit('refresh');
  }

  setBuildType(type) {
    if (!COST[type]) return;
    this.selectedBuild = type;
    this.buildMode = true;
    this.playSound('select');
    this.emit('refresh');
  }

  setWeapon(name) {
    if (this.phase !== 'player' || this.isOver) return;
    if (!WEAPONS[name]) return;
    if (name !== 'pickaxe') {
      const ammo = this.ammo[this.currentTeam][name];
      if (ammo !== undefined && ammo <= 0) {
        this.toast('NO AMMO LEFT', true);
        this.playSound('deny');
        return;
      }
    }
    this.buildMode = false;
    this.charging = false;
    this.chargePower = 0;
    this.currentWeapon = name;
    this.selectedWeapon[this.currentTeam] = name;
    if (this.currentWorm) this.currentWorm.weapon = name;
    this.playSound('select');
    this.emit('refresh');
  }

  buildCost() {
    return COST[this.selectedBuild] ?? 20;
  }

  ghostPiece() {
    const worm = this.currentWorm;
    if (!worm) return null;
    const gx = snap(this.mouse.x, BUILD_GRID);
    const gy = snap(this.mouse.y, BUILD_GRID);
    const type = this.selectedBuild;
    const size = SIZE[type];
    let x;
    let y;
    if (type === 'wall') {
      x = gx - size.w / 2;
      y = gy - size.h;
    } else if (type === 'floor') {
      x = gx - size.w / 2;
      y = gy - size.h;
    } else {
      x = gx - size.w / 2;
      y = gy - size.h;
    }
    const flip = type === 'ramp' ? this.mouse.x < worm.x : false;

    // Plant pieces that are pointed near a ledge instead of leaving them
    // hovering a few pixels above it. Both terrain and existing builds count.
    const centerX = x + size.w / 2;
    const foot = y + size.h;
    const support = this.supportSurfaceBelow(centerX, x, x + size.w, foot);
    if (support !== null) {
      const gap = support - foot;
      if (Math.abs(gap) <= 30) y += gap;
    }

    return {
      type,
      x,
      y,
      w: size.w,
      h: size.h,
      flip,
      material: this.material,
      team: worm.team,
      hp: MATERIAL_HP[this.material],
      maxHp: MATERIAL_HP[this.material],
      age: 1,
      fading: false,
      life: 1,
      blueprint: true,
    };
  }

  supportSurfaceBelow(centerX, left, right, foot) {
    let best = null;
    const consider = (y) => {
      if (y < foot - 42 || y > foot + 38) return;
      if (best === null || Math.abs(y - foot) < Math.abs(best - foot)) best = y;
    };
    const ground = this.terrain.groundBelow(centerX, foot - 42, foot + 38);
    if (ground !== null) consider(ground - 1);

    for (const b of this.buildings) {
      if (b.fading) continue;
      const overlap = Math.min(right + 4, b.x + b.w) - Math.max(left - 4, b.x);
      if (overlap <= 0) continue;
      if (b.type === 'ramp') {
        const t = clamp((centerX - b.x) / b.w, 0, 1);
        consider(b.flip ? b.y + t * b.h : b.y + b.h - t * b.h);
      } else {
        consider(b.y);
      }
    }
    return best;
  }

  getBuildGhost() {
    if (!this.buildMode || this.phase !== 'player') return null;
    const worm = this.currentWorm;
    const piece = this.ghostPiece();
    if (!worm || !piece) return null;
    const cost = this.buildCost();
    const mats = this.materials[worm.team][piece.material];
    let valid = true;
    let reason = '';
    const distance = rectDistance(piece.x, piece.y, piece.w, piece.h, worm.x, worm.y - 20);

    if (this.buildsLeft <= 0) {
      valid = false;
      reason = 'build limit';
    } else if (mats < cost) {
      valid = false;
      reason = 'no mats';
    } else if (distance > this.buildRange) {
      valid = false;
      reason = 'too far';
    } else if (piece.x < 10 || piece.x + piece.w > WORLD.width - 10 || piece.y < 18 || piece.y + piece.h > WATER - 18) {
      valid = false;
      reason = 'blocked';
    } else if (rectCircle(piece.x, piece.y, piece.w, piece.h, worm.x, worm.y - 18, 17)) {
      valid = false;
      reason = 'too close';
    } else if (!this.hasSupport(piece, worm)) {
      valid = false;
      reason = 'no support';
    }
    return { piece, valid, reason, distance, cost };
  }

  hasSupport(piece, worm) {
    // Touching terrain counts as anchored.
    const samples = piece.type === 'ramp' ? [
      [piece.x + 4, piece.y + piece.h - 4],
      [piece.x + piece.w / 2, piece.y + piece.h / 2],
      [piece.x + piece.w - 4, piece.flip ? piece.y + 4 : piece.y + piece.h - 4],
      [piece.x + 4, piece.y + piece.h / 2],
    ] : [
      [piece.x + piece.w / 2, piece.y + piece.h / 2],
      [piece.x + 3, piece.y + 3],
      [piece.x + piece.w - 3, piece.y + 3],
      [piece.x + 3, piece.y + piece.h - 3],
      [piece.x + piece.w - 3, piece.y + piece.h - 3],
    ];
    for (const [x, y] of samples) {
      if (this.terrain.solidAt(x, y)) return true;
    }
    for (const b of this.buildings) {
      if (b.fading) continue;
      const gapX = Math.max(b.x - (piece.x + piece.w), piece.x - (b.x + b.w), 0);
      const gapY = Math.max(b.y - (piece.y + piece.h), piece.y - (b.y + b.h), 0);
      if (Math.hypot(gapX, gapY) < 22) return true;
    }
    const wormDistance = rectDistance(piece.x, piece.y, piece.w, piece.h, worm.x, worm.y - 20);
    return wormDistance < 110;
  }

  placeBuild() {
    const ghost = this.getBuildGhost();
    if (!ghost) return false;
    if (!ghost.valid) {
      this.toast(ghost.reason.toUpperCase(), true);
      this.playSound('deny');
      return false;
    }
    const piece = ghost.piece;
    piece.blueprint = false;
    piece.age = 0;
    piece.hp = MATERIAL_HP[piece.material];
    piece.maxHp = piece.hp;
    this.buildings.push(piece);
    this.materials[this.currentTeam][piece.material] -= ghost.cost;
    this.buildsLeft -= 1;
    this.stats.builds[this.currentTeam] += 1;
    this.particles.buildBurst(piece.x + piece.w / 2, piece.y + piece.h / 2, piece.material, true);
    this.playSound(piece.material === 'metal' ? 'buildMetal' : 'build');
    this.shake = Math.max(this.shake, 0.05);
    this.addFloater(piece.x + piece.w / 2, piece.y - 4, `-${ghost.cost} ${piece.material.toUpperCase()}`, '#d9c7ff', 10);
    if (this.buildsLeft <= 0) {
      this.buildMode = false;
      this.toast('BUILD LIMIT REACHED');
    }
    this.emit('refresh');
    return true;
  }

  harvest(x, y) {
    if (this.phase !== 'player' || this.isOver) return;
    if (this.harvestCooldown > 0) return;
    const worm = this.currentWorm;
    if (!worm) return;
    if (Math.hypot(x - worm.x, y - (worm.y - 20)) > 150) {
      this.toast('MOVE CLOSER TO HARVEST', true);
      this.playSound('deny');
      return;
    }
    this.harvestCooldown = 0.24;
    this.playSound('harvest');
    worm.recoil = 1;

    const piece = this.pieceAtPoint(x, y);
    if (piece) {
      const gain = piece.material === 'metal' ? 8 : piece.material === 'brick' ? 12 : 16;
      this.materials[worm.team][piece.material] = Math.min(999, this.materials[worm.team][piece.material] + gain);
      this.damageBuilding(piece, 60, worm.team, x, y, false);
      this.particles.harvest(x, y, piece.material === 'brick' ? ['#e28970', '#963c35'] : piece.material === 'metal' ? ['#d5eaff', '#6f88aa'] : ['#d8a267', '#8a572d']);
      this.addFloater(x, y - 10, `+${gain} ${piece.material.toUpperCase()}`, '#ffe14a', 12);
      this.emit('refresh');
      return;
    }

    if (this.terrain.solidAt(x, y)) {
      const surface = this.terrain.surfaceY(x);
      let mat = 'wood';
      let gain = 18;
      if (y > surface + 170) { mat = 'metal'; gain = 9; }
      else if (y > surface + 74) { mat = 'brick'; gain = 13; }
      this.terrain.carveMelee(x, y, 17);
      this.materials[worm.team][mat] = Math.min(999, this.materials[worm.team][mat] + gain);
      this.particles.harvest(x, y, mat === 'brick' ? ['#b9765f', '#e8a083'] : mat === 'metal' ? ['#a9c0dc', '#e6f3ff'] : ['#7edc64', '#9a6134']);
      this.addFloater(x, y - 8, `+${gain} ${mat.toUpperCase()}`, '#ffe14a', 12);
      this.emit('refresh');
      return;
    }

    this.toast('NOTHING TO HARVEST', true);
    this.playSound('deny');
  }

  // -------------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------------

  updateAI(dt) {
    if (!this.currentWorm || this.currentWorm.dead) {
      this.beginTurn(this.currentTeam);
      return;
    }
    if (this.aiState === 'think') {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        const enemies = this.worms.filter((w) => w.team !== this.currentTeam && !w.dead);
        if (!enemies.length) return this.checkTeamWipe();
        this.aiTarget = enemies.reduce((best, w) => {
          if (!best) return w;
          const score = w.health + Math.abs(w.x - this.currentWorm.x) * 0.05;
          const bestScore = best.health + Math.abs(best.x - this.currentWorm.x) * 0.05;
          return score < bestScore ? w : best;
        }, null);

        if (this.buildsLeft > 0 && this.rng() > 0.55 && this.canAiBuild()) {
          this.aiBuild(this.aiTarget);
          this.aiState = 'settle';
          this.aiTimer = 0.6;
          return;
        }
        this.aiAim(this.aiTarget);
        this.aiState = 'charge';
        this.aiTimer = 0.95;
        this.chargePower = 0;
      }
    } else if (this.aiState === 'settle') {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiAim(this.aiTarget);
        this.aiState = 'charge';
        this.aiTimer = 0.95;
        this.chargePower = 0;
      }
    } else if (this.aiState === 'charge') {
      this.aiTimer -= dt;
      this.chargePower = clamp((this.aiPower ?? 1) * (1 - this.aiTimer / 0.95), 0, 1);
      if (this.aiTimer <= 0) {
        this.aiState = 'fired';
        this.fire();
      }
    }
  }

  canAiBuild() {
    const worm = this.currentWorm;
    const cost = COST.wall;
    const mats = this.materials[worm.team];
    return (mats.wood >= cost || mats.brick >= cost || mats.metal >= cost) && worm.y < WATER - 120;
  }

  aiBuild(target) {
    const worm = this.currentWorm;
    const dir = target.x >= worm.x ? 1 : -1;
    const material = this.materials[worm.team].metal > 60 ? 'metal' : this.materials[worm.team].brick > 40 ? 'brick' : 'wood';
    const cost = COST.wall;
    if (this.materials[worm.team][material] < cost) return;
    const x = worm.x + dir * 66 - SIZE.wall.w / 2;
    const y = worm.y - 84;
    const piece = {
      type: 'wall',
      x,
      y,
      w: SIZE.wall.w,
      h: SIZE.wall.h,
      flip: false,
      material,
      team: worm.team,
      hp: MATERIAL_HP[material],
      maxHp: MATERIAL_HP[material],
      age: 0,
      fading: false,
      life: 1,
      blueprint: false,
    };
    // don't bury the worm or float it in the sea
    if (y < 10 || rectCircle(piece.x, piece.y, piece.w, piece.h, worm.x, worm.y - 18, 22)) return;
    this.buildings.push(piece);
    this.materials[worm.team][material] -= cost;
    this.buildsLeft -= 1;
    this.stats.builds[worm.team] += 1;
    this.particles.buildBurst(piece.x + piece.w / 2, piece.y + piece.h / 2, material, true);
    this.playSound(material === 'metal' ? 'buildMetal' : 'build');
    this.addFloater(piece.x + piece.w / 2, piece.y - 4, 'COVER UP', '#ffb1b4', 10);
    this.emit('refresh');
  }

  aiAim(target) {
    const worm = this.currentWorm;
    const muzzle = this.muzzleFor(worm);
    const weapon = this.ammo[worm.team].cluster > 0 && this.rng() > 0.8 ? 'cluster' : 'bazooka';
    this.currentWeapon = weapon;
    worm.weapon = weapon;
    const config = WEAPONS[weapon];
    let best = { score: Infinity, angle: -Math.PI / 2, power: 0.8 };
    const windAccel = windToAccel(this.wind);
    const targetPoint = { x: target.x, y: target.y - 20 };
    const angles = 38;
    const powers = 8;
    for (let ai = 0; ai < angles; ai += 1) {
      const angle = -Math.PI + 0.2 + (Math.PI - 0.4) * (ai / (angles - 1));
      for (let pi = 0; pi < powers; pi += 1) {
        const power = 0.3 + 0.7 * (pi / (powers - 1));
        const result = this.simulateShot(muzzle, angle, power, config, targetPoint, windAccel);
        if (result < best.score) best = { score: result, angle, power };
      }
    }

    // A touch of error keeps the enemy dangerous but beatable.
    const err = range(this.rng, -0.032, 0.032);
    const powerErr = range(this.rng, -0.035, 0.035);
    const angle = best.angle + err;
    const power = clamp(best.power + powerErr, 0.25, 1);
    worm.aimAngle = angle;
    worm.facing = Math.cos(angle) >= 0 ? 1 : -1;
    this.aiPower = power;
    this.chargePower = 0;
    this.aiState = 'charge';
    this.aiTimer = 0.95;
    this.emit('refresh');
  }

  simulateShot(muzzle, angle, power, config, targetPoint, windAccel) {
    let x = muzzle.x;
    let y = muzzle.y;
    let vx = Math.cos(angle) * config.speed * power;
    let vy = Math.sin(angle) * config.speed * power;
    const dt = 1 / 60;
    let score = Infinity;
    for (let step = 0; step < 330; step += 1) {
      vy += config.gravity * dt;
      vx += windAccel * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < -100 || x > WORLD.width + 100 || y > WATER) {
        score = Math.min(score, Math.hypot(x - targetPoint.x, y - targetPoint.y) + 120);
        break;
      }
      if (this.terrain.solidAt(x, y) || this.pieceAtPoint(x, y)) {
        const d = Math.hypot(x - targetPoint.x, y - targetPoint.y);
        score = step < 16 ? d + 240 : d;
        break;
      }
      const d = Math.hypot(x - targetPoint.x, y - targetPoint.y);
      if (d < 17) { score = 0; break; }
      score = Math.min(score, d);
    }
    return score;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  pieceAtPoint(x, y) {
    for (let i = this.buildings.length - 1; i >= 0; i -= 1) {
      const b = this.buildings[i];
      if (b.fading) continue;
      if (b.type === 'ramp') {
        const { x: bx, y: by, w, h, flip } = b;
        const inside = flip
          ? pointInTriangle(x, y, bx, by, bx + w, by + h, bx, by + h)
          : pointInTriangle(x, y, bx, by + h, bx + w, by, bx + w, by + h);
        if (inside) return b;
      } else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  }

  getAimPreview() {
    if (!this.currentWorm || this.currentWeapon === 'pickaxe') return null;
    const worm = this.currentWorm;
    const config = WEAPONS[this.currentWeapon] || WEAPONS.bazooka;
    const power = this.charging ? clamp(this.chargePower, 0.12, 1) : 0.62;
    const start = this.muzzleFor(worm);
    const points = makeTrajectoryPreview(start, worm.aimAngle, config.speed * power, config.gravity, this.wind, {
      maxPoints: 150,
      step: 1 / 55,
      maxTime: 5.5,
      solidAt: (x, y) => this.terrain.solidAt(x, y) || !!this.pieceAtPoint(x, y),
      bounds: { minX: 0, maxX: WORLD.width, waterY: WATER },
    });
    const impact = points.length ? points[points.length - 1] : null;
    return { points, impact, muzzle: start, power, angle: worm.aimAngle };
  }

  getCurrentHealth() {
    return this.currentWorm?.health ?? 0;
  }

  aliveCount(team) {
    return this.worms.filter((w) => w.team === team && !w.dead).length;
  }
}
