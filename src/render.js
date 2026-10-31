import { clamp, lerp, mulberry32, range } from './logic.js';

const TAU = Math.PI * 2;
const WATER_Y = 868;
const FONT = '"Arial Black", "DejaVu Sans", sans-serif';

const MATERIALS = {
  wood: { base: '#b97a3f', light: '#e4ab68', dark: '#74451f', edge: '#4d2d17', glow: '255,212,130' },
  brick: { base: '#c85e51', light: '#ef8a79', dark: '#7e322e', edge: '#4d1e22', glow: '255,148,128' },
  metal: { base: '#8097b7', light: '#cfe3f8', dark: '#445a79', edge: '#273850', glow: '175,220,255' },
};

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.width = 1600;
    this.height = 900;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = 1;
    this.time = 0;
    this.cameraX = 800;
    this.portrait = false;
    this.rng = mulberry32(7331);
    this.clouds = [];
    this.islands = [];
    this.mountains = [];
    this.birds = [];
    this.sparkles = [];
    this.embers = [];
    this.rays = [];
    this.initScene();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  initScene() {
    const rng = this.rng;
    for (let i = 0; i < 12; i += 1) {
      this.clouds.push({
        x: rng() * 1900 - 150,
        y: 70 + rng() * 330,
        s: 0.5 + rng() * 1.35,
        alpha: 0.08 + rng() * 0.13,
        speed: 3 + rng() * 9,
      });
    }
    for (let i = 0; i < 5; i += 1) {
      this.islands.push({
        x: 100 + rng() * 1450,
        y: 155 + rng() * 210,
        s: 0.35 + rng() * 0.85,
        phase: rng() * TAU,
        drift: 4 + rng() * 7,
      });
    }
    for (let layer = 0; layer < 3; layer += 1) {
      const points = [];
      const baseY = 540 + layer * 48;
      const step = 38 + layer * 10;
      for (let x = -100; x <= 1720; x += step) {
        const y = baseY + Math.sin(x * (0.004 + layer * 0.002) + layer * 3) * (24 + layer * 14)
          + Math.sin(x * 0.017 + layer) * (8 + layer * 6);
        points.push({ x, y });
      }
      this.mountains.push({ points, layer });
    }
    for (let i = 0; i < 5; i += 1) {
      this.birds.push({ x: rng() * 1600, y: 150 + rng() * 240, s: 0.5 + rng() * 0.6, phase: rng() * TAU, speed: 8 + rng() * 8 });
    }
    for (let i = 0; i < 65; i += 1) {
      this.sparkles.push({ x: 50 + rng() * 1500, y: WATER_Y + rng() * 26, phase: rng() * TAU, speed: 0.5 + rng() });
    }
    for (let i = 0; i < 24; i += 1) {
      this.embers.push({ x: rng() * 1600, y: 400 + rng() * 430, phase: rng() * TAU, speed: 0.3 + rng() * 0.9, s: 0.7 + rng() * 1.8 });
    }
    for (let i = 0; i < 4; i += 1) {
      this.rays.push({ x: 1080 + rng() * 180, w: 40 + rng() * 90, alpha: 0.02 + rng() * 0.035, phase: rng() * TAU });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const vw = Math.max(1, rect.width || window.innerWidth);
    const vh = Math.max(1, rect.height || window.innerHeight);
    this.viewWidth = vw;
    this.viewHeight = vh;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(vw * this.dpr);
    this.canvas.height = Math.round(vh * this.dpr);
    const aspect = vw / vh;
    this.portrait = aspect < 1.0;
    if (this.portrait) {
      // Portrait phones get a follow camera instead of a tiny letterboxed
      // battlefield. Keep a readable slice of the island on screen.
      this.scale = clamp(vw / 520, vh / 1180, vh / 900);
      this.offsetX = (vw - this.width * this.scale) / 2;
      this.offsetY = vh * 0.6 - 620 * this.scale;
    } else {
      // Landscape screens get an immersive cover crop.
      this.scale = aspect >= 1.15
        ? Math.max(vw / this.width, vh / this.height)
        : Math.min(vw / this.width, vh / this.height);
      this.offsetX = (vw - this.width * this.scale) / 2;
      if (aspect >= 1.15 && vh < 560) {
        // Short landscape screens lose the lower battlefield behind the touch
        // dock, so bias the crop toward the island instead of centring it.
        this.offsetY = vh * 0.58 - 620 * this.scale;
      } else {
        this.offsetY = (vh - this.height * this.scale) / 2;
      }
    }
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale,
    };
  }

  cameraFocus(game) {
    if (game.phase === 'menu') return 800 + Math.sin(this.time * 0.11) * 130;
    const live = game.projectiles.find((p) => p.kind === 'rocket')
      || game.projectiles[game.projectiles.length - 1];
    if (live) return clamp(live.x, 0, this.width);
    if (game.currentWorm) {
      let focus = game.currentWorm.x;
      if (game.charging && game.mouse?.active) {
        focus += clamp(game.mouse.x - focus, -150, 150) * 0.22;
      }
      return focus;
    }
    return 800;
  }

  worldToScreen(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: x * this.scale + this.offsetX + rect.left,
      y: y * this.scale + this.offsetY + rect.top,
    };
  }

  draw(game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);

    const bg = ctx.createLinearGradient(0, 0, 0, this.viewHeight);
    bg.addColorStop(0, '#0a0716');
    bg.addColorStop(0.5, '#120c24');
    bg.addColorStop(1, '#1a102c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    const shake = game.shake || 0;
    const shakeX = Math.sin(t * 92) * shake * 9 + Math.sin(t * 47) * shake * 4;
    const shakeY = Math.cos(t * 83) * shake * 7 + Math.sin(t * 61) * shake * 3;

    if (this.portrait) {
      const focus = this.cameraFocus(game);
      this.cameraX = lerp(this.cameraX, focus, 1 - Math.pow(0.0015, dt));
      const viewWorldW = this.viewWidth / this.scale;
      if (viewWorldW >= this.width) {
        this.offsetX = (this.viewWidth - this.width * this.scale) / 2;
      } else {
        const half = viewWorldW / 2;
        const camX = clamp(this.cameraX, half, this.width - half);
        this.offsetX = this.viewWidth / 2 - camX * this.scale;
      }
    }

    ctx.save();
    ctx.translate(this.offsetX + shakeX, this.offsetY + shakeY);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(-2, -2, this.width + 4, this.height + 4);
    ctx.clip();

    this.drawSky(ctx, t, game);
    this.drawSea(ctx, t);
    this.drawMountains(ctx, t);
    this.drawFloatingIslands(ctx, t);
    this.drawClouds(ctx, t);
    this.drawBirds(ctx, t);

    if (game.terrain) game.terrain.draw(ctx);
    this.drawBuildings(ctx, game, t);
    this.drawWormShadows(ctx, game);
    this.drawWorms(ctx, game, t);
    this.drawProjectiles(ctx, game, t);
    game.particles.draw(ctx);
    this.drawFloaters(ctx, game);
    this.drawAim(ctx, game, t);
    this.drawWater(ctx, t);
    this.drawAtmosphere(ctx, t);
    this.drawStorm(ctx, game, t);

    ctx.restore();

    this.drawOverlayEffects(ctx, game, t);
    this.drawLetterbox(ctx, t);
  }

  drawSky(ctx, t, game) {
    const sky = ctx.createLinearGradient(0, 0, 0, 760);
    sky.addColorStop(0, '#171239');
    sky.addColorStop(0.28, '#372364');
    sky.addColorStop(0.55, '#7d3f7a');
    sky.addColorStop(0.76, '#e67676');
    sky.addColorStop(0.9, '#ffab6f');
    sky.addColorStop(1, '#ffd294');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, 790);

    // Sun
    const sunX = 1172;
    const sunY = 292;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 310);
    glow.addColorStop(0, 'rgba(255,245,198,0.95)');
    glow.addColorStop(0.12, 'rgba(255,216,122,0.6)');
    glow.addColorStop(0.4, 'rgba(255,151,103,0.18)');
    glow.addColorStop(1, 'rgba(255,110,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 320, sunY - 320, 640, 640);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const disc = ctx.createRadialGradient(sunX - 12, sunY - 16, 4, sunX, sunY, 74);
    disc.addColorStop(0, '#fffbe3');
    disc.addColorStop(0.55, '#ffe9a8');
    disc.addColorStop(1, '#ffbf78');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 72, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Sun rays
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ray of this.rays) {
      const sway = Math.sin(t * 0.11 + ray.phase) * 0.06;
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(-0.95 + sway);
      const grad = ctx.createLinearGradient(0, 0, 0, 780);
      grad.addColorStop(0, `rgba(255,236,180,${ray.alpha})`);
      grad.addColorStop(0.55, `rgba(255,184,128,${ray.alpha * 0.55})`);
      grad.addColorStop(1, 'rgba(255,150,100,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(ray.x - sunX - ray.w / 2, 0, ray.w, 820);
      ctx.restore();
    }
    ctx.restore();

    // High haze
    const haze = ctx.createLinearGradient(0, 360, 0, 760);
    haze.addColorStop(0, 'rgba(255,153,130,0)');
    haze.addColorStop(0.7, 'rgba(255,155,116,0.16)');
    haze.addColorStop(1, 'rgba(255,195,138,0.1)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 360, this.width, 400);

    // Distant storm bank on the right
    ctx.save();
    const storm = ctx.createLinearGradient(1520, 140, 1350, 540);
    storm.addColorStop(0, 'rgba(72,39,134,0.3)');
    storm.addColorStop(0.6, 'rgba(105,45,145,0.12)');
    storm.addColorStop(1, 'rgba(120,60,150,0)');
    ctx.fillStyle = storm;
    ctx.beginPath();
    ctx.ellipse(1570, 300, 260, 320, -0.22, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#c7a5ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(1520 - i * 22, 330 + i * 12, 130 + i * 40, -1.3, 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawClouds(ctx, t) {
    for (const c of this.clouds) {
      const x = ((c.x + t * c.speed) % 1950) - 160;
      ctx.save();
      ctx.globalAlpha = c.alpha;
      const grad = ctx.createLinearGradient(x, c.y - 60 * c.s, x, c.y + 45 * c.s);
      grad.addColorStop(0, '#ffd8c0');
      grad.addColorStop(0.55, '#f09aaf');
      grad.addColorStop(1, '#975b8e');
      ctx.fillStyle = grad;
      const s = c.s;
      ctx.beginPath();
      ctx.ellipse(x, c.y, 110 * s, 18 * s, 0, 0, TAU);
      ctx.ellipse(x - 48 * s, c.y + 3 * s, 48 * s, 16 * s, 0.1, 0, TAU);
      ctx.ellipse(x + 42 * s, c.y - 6 * s, 55 * s, 20 * s, -0.08, 0, TAU);
      ctx.ellipse(x - 12 * s, c.y - 13 * s, 54 * s, 22 * s, 0.04, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawMountains(ctx, t) {
    const palettes = [
      { top: '#4b3168', bottom: '#2e1e46', alpha: 0.62, offset: 30 },
      { top: '#38264f', bottom: '#241737', alpha: 0.82, offset: 12 },
      { top: '#251a37', bottom: '#181025', alpha: 0.95, offset: 0 },
    ];
    this.mountains.forEach((m) => {
      const p = palettes[m.layer];
      const points = m.points;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      const grad = ctx.createLinearGradient(0, 480, 0, 760);
      grad.addColorStop(0, p.top);
      grad.addColorStop(1, p.bottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(points[0].x, 820);
      for (const point of points) {
        ctx.lineTo(point.x, point.y + p.offset - Math.sin(t * 0.03 + m.layer) * 1.2);
      }
      ctx.lineTo(points[points.length - 1].x, 820);
      ctx.closePath();
      ctx.fill();

      // atmospheric rim on the closest ridge
      if (m.layer === 2) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#ffb58a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((point, i) => {
          if (i === 0) ctx.moveTo(point.x, point.y + p.offset);
          else ctx.lineTo(point.x, point.y + p.offset);
        });
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawFloatingIslands(ctx, t) {
    for (const island of this.islands) {
      const x = island.x + Math.sin(t * 0.09 + island.phase) * island.drift;
      const y = island.y + Math.cos(t * 0.13 + island.phase) * 3;
      const s = island.s;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 0.5 + s * 0.28;

      const rock = ctx.createLinearGradient(0, 0, 0, 90 * s);
      rock.addColorStop(0, '#664272');
      rock.addColorStop(0.5, '#3e2850');
      rock.addColorStop(1, 'rgba(38,23,55,0)');
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.moveTo(-48 * s, 0);
      ctx.quadraticCurveTo(-40 * s, 28 * s, -12 * s, 60 * s);
      ctx.quadraticCurveTo(0, 78 * s, 8 * s, 58 * s);
      ctx.quadraticCurveTo(34 * s, 26 * s, 50 * s, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#78a85f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 51 * s, 10 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#a8d17a';
      ctx.beginPath();
      ctx.ellipse(-8 * s, -3 * s, 36 * s, 5 * s, 0.03, 0, TAU);
      ctx.fill();

      // tiny tree
      ctx.strokeStyle = '#3b2b22';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(12 * s, -4 * s);
      ctx.lineTo(12 * s, -18 * s);
      ctx.stroke();
      ctx.fillStyle = '#4f8b58';
      ctx.beginPath();
      ctx.arc(12 * s, -23 * s, 9 * s, 0, TAU);
      ctx.fill();

      // waterfall
      const wf = ctx.createLinearGradient(0, 0, 0, 80 * s);
      wf.addColorStop(0, 'rgba(166,240,255,0.6)');
      wf.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.fillStyle = wf;
      ctx.fillRect(-2 * s, 4 * s, 3 * s, 50 * s);

      ctx.restore();
    }
  }

  drawBirds(ctx, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(37,22,48,0.6)';
    ctx.lineWidth = 1.6;
    for (const b of this.birds) {
      const x = ((b.x + t * b.speed) % 1800) - 100;
      const y = b.y + Math.sin(t * 0.6 + b.phase) * 6;
      const flap = Math.sin(t * 4 + b.phase) * 5;
      ctx.beginPath();
      ctx.moveTo(x - 9 * b.s, y + flap * 0.4);
      ctx.quadraticCurveTo(x - 4 * b.s, y - 3 * b.s, x, y);
      ctx.quadraticCurveTo(x + 4 * b.s, y - 3 * b.s, x + 9 * b.s, y + flap * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSea(ctx, t) {
    const sea = ctx.createLinearGradient(0, 655, 0, 900);
    sea.addColorStop(0, 'rgba(43,29,78,0.1)');
    sea.addColorStop(0.24, '#3b2a66');
    sea.addColorStop(0.55, '#273462');
    sea.addColorStop(1, '#12253f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 655, this.width, 245);

    // horizon glow
    const glow = ctx.createRadialGradient(1150, 690, 4, 1150, 690, 420);
    glow.addColorStop(0, 'rgba(255,185,120,0.32)');
    glow.addColorStop(1, 'rgba(255,140,100,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(700, 640, 900, 240);

    // distant wave lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,186,150,0.2)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i += 1) {
      const y = 680 + i * 18;
      ctx.beginPath();
      for (let x = 0; x <= this.width; x += 20) {
        const yy = y + Math.sin(x * 0.016 + t * 0.8 + i) * (1.2 + i * 0.2);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.globalAlpha = 0.5 - i * 0.045;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWater(ctx, t) {
    const y = WATER_Y;
    ctx.save();
    const grad = ctx.createLinearGradient(0, y - 10, 0, 900);
    grad.addColorStop(0, 'rgba(92,224,255,0.38)');
    grad.addColorStop(0.14, 'rgba(37,154,203,0.62)');
    grad.addColorStop(0.5, 'rgba(18,88,145,0.86)');
    grad.addColorStop(1, 'rgba(8,44,92,0.96)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    for (let x = 0; x <= this.width; x += 14) {
      const yy = y + 3 + Math.sin(x * 0.014 + t * 1.4) * 3 + Math.sin(x * 0.045 + t * 2.2) * 1.4;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(this.width, 900);
    ctx.lineTo(0, 900);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(175,249,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += 12) {
      const yy = y + 3 + Math.sin(x * 0.014 + t * 1.4) * 3 + Math.sin(x * 0.045 + t * 2.2) * 1.4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    for (const s of this.sparkles) {
      const a = 0.24 + Math.abs(Math.sin(t * s.speed + s.phase)) * 0.5;
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = '#d9ffff';
      ctx.fillRect(s.x, s.y + Math.sin(t * 1.5 + s.phase) * 2, 2, 1);
    }
    ctx.restore();
  }

  drawStorm(ctx, game, t) {
    // slim storm wall pulse on the far right, a nod to the shrinking circle
    ctx.save();
    const pulse = 0.04 + (Math.sin(t * 0.7) * 0.5 + 0.5) * 0.035;
    const grad = ctx.createLinearGradient(1600, 0, 1440, 0);
    grad.addColorStop(0, `rgba(155,86,255,${pulse + 0.08})`);
    grad.addColorStop(0.4, `rgba(124,66,210,${pulse})`);
    grad.addColorStop(1, 'rgba(100,60,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(1380, 0, 220, 900);
    ctx.restore();
  }

  drawBuildings(ctx, game, t) {
    const pieces = game.buildings;
    for (const piece of pieces) {
      this.drawPiece(ctx, piece, game, t);
    }
  }

  drawPiece(ctx, piece, game, t) {
    const m = MATERIALS[piece.material] || MATERIALS.wood;
    const teamColor = piece.team === 0 ? '88,238,255' : '255,109,114';
    const age = clamp(piece.age, 0, 1);
    const pop = age < 1 ? 1 + Math.sin(age * Math.PI) * 0.045 : 1;
    const hpRatio = clamp(piece.hp / piece.maxHp, 0, 1);
    const alpha = piece.fading ? clamp(piece.life, 0, 1) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(piece.x + piece.w / 2, piece.y + piece.h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-piece.w / 2, -piece.h / 2);

    if (piece.type === 'wall') {
      this.drawPanel(ctx, 0, 0, piece.w, piece.h, m, 'wall', hpRatio);
    } else if (piece.type === 'floor') {
      this.drawPanel(ctx, 0, 0, piece.w, piece.h, m, 'floor', hpRatio);
    } else if (piece.type === 'ramp') {
      this.drawRamp(ctx, piece, m, hpRatio);
    }

    ctx.restore();

    // team glow
    ctx.save();
    ctx.globalAlpha = alpha * (piece.blueprint ? 0.9 : 0.55);
    ctx.shadowColor = `rgba(${teamColor},0.8)`;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = `rgba(${teamColor},${piece.blueprint ? 0.9 : 0.38})`;
    ctx.lineWidth = 1.4;
    if (piece.type === 'ramp') {
      ctx.beginPath();
      ctx.moveTo(piece.x, piece.y + piece.h);
      ctx.lineTo(piece.x + (piece.flip ? 0 : piece.w), piece.y + (piece.flip ? piece.h : 0));
      ctx.lineTo(piece.x + (piece.flip ? 0 : piece.w), piece.y + piece.h);
      ctx.closePath();
      ctx.stroke();
    } else {
      roundRectPath(ctx, piece.x, piece.y, piece.w, piece.h, 2);
      ctx.stroke();
    }
    ctx.restore();

    // damage bar only after real damage
    if (hpRatio < 0.98 && !piece.blueprint) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const w = Math.min(piece.w + 8, 54);
      const x = piece.x + piece.w / 2 - w / 2;
      const y = piece.y - 7;
      ctx.fillStyle = 'rgba(8,5,16,0.7)';
      roundRectPath(ctx, x, y, w, 4, 2);
      ctx.fill();
      ctx.fillStyle = hpRatio > 0.5 ? `rgba(${teamColor},0.9)` : '#ff9c4a';
      roundRectPath(ctx, x, y, Math.max(2, w * hpRatio), 4, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPanel(ctx, x, y, w, h, m, kind, hpRatio) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, m.light);
    grad.addColorStop(0.2, m.base);
    grad.addColorStop(1, m.dark);
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, w, h, 2.5);
    ctx.fill();
    ctx.strokeStyle = m.edge;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.save();
    roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 2);
    ctx.clip();

    if (kind === 'wall') {
      if (m === MATERIALS.wood) {
        for (let i = 1; i < 6; i += 1) {
          const yy = y + (h / 6) * i;
          ctx.strokeStyle = 'rgba(74,42,20,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + w, yy + Math.sin(i) * 1.5);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,233,180,0.2)';
        ctx.fillRect(x + 2, y + 2, 2, h - 4);
      } else if (m === MATERIALS.brick) {
        for (let row = 0; row < 6; row += 1) {
          const yy = y + row * (h / 6);
          ctx.strokeStyle = 'rgba(72,25,25,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + w, yy);
          ctx.stroke();
          const offset = row % 2 ? 0 : w / 2;
          ctx.beginPath();
          ctx.moveTo(x + offset, yy);
          ctx.lineTo(x + offset, yy + h / 6);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,188,165,0.16)';
        ctx.fillRect(x + 2, y + 2, 2, h - 4);
      } else {
        for (let i = 0; i < 4; i += 1) {
          const yy = y + 4 + i * (h - 8) / 4;
          ctx.strokeStyle = 'rgba(30,48,68,0.5)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + 2, yy);
          ctx.lineTo(x + w - 2, yy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.arc(x + 4, y + 7 + i * (h - 12) / 5, 0.9, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + w - 4, y + 7 + i * (h - 12) / 5, 0.9, 0, TAU);
          ctx.fill();
        }
      }
    } else if (kind === 'floor') {
      if (m === MATERIALS.wood) {
        for (let i = 1; i < 5; i += 1) {
          const xx = x + (w / 5) * i;
          ctx.strokeStyle = 'rgba(75,44,21,0.4)';
          ctx.beginPath();
          ctx.moveTo(xx, y);
          ctx.lineTo(xx, y + h);
          ctx.stroke();
        }
      } else if (m === MATERIALS.brick) {
        for (let i = 0; i < 4; i += 1) {
          ctx.strokeStyle = 'rgba(70,25,26,0.45)';
          ctx.beginPath();
          ctx.moveTo(x + (w / 4) * i, y);
          ctx.lineTo(x + (w / 4) * i, y + h);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(34,51,74,0.45)';
        for (let i = 0; i < 5; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x + 5 + i * (w - 10) / 4, y + 2);
          ctx.lineTo(x + 5 + i * (w - 10) / 4, y + h - 2);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x + 2, y + 2, w - 4, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 2, y + h - 3, w - 4, 2);
    }

    if (hpRatio < 0.6) {
      ctx.strokeStyle = 'rgba(18,9,18,0.5)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        const cx = x + w * (0.2 + i * 0.28);
        ctx.moveTo(cx, y + 3);
        ctx.lineTo(cx + 5 - i * 3, y + h * 0.28);
        ctx.lineTo(cx - 2, y + h * 0.52);
        if (hpRatio < 0.3) {
          ctx.lineTo(cx + 6, y + h * 0.75);
          ctx.lineTo(cx - 1, y + h - 3);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawRamp(ctx, piece, m, hpRatio) {
    const { w, h, flip } = piece;
    const x = 0;
    const y = 0;
    const grad = ctx.createLinearGradient(x, flip ? y : y + h, x + w, flip ? y + h : y);
    grad.addColorStop(0, m.light);
    grad.addColorStop(0.18, m.base);
    grad.addColorStop(1, m.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (flip) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
    } else {
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = m.edge;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = m === MATERIALS.metal ? 'rgba(31,48,70,0.5)' : 'rgba(72,40,20,0.45)';
    ctx.lineWidth = 1.3;
    for (let i = 1; i < 5; i += 1) {
      const xx = x + (w / 5) * i;
      ctx.beginPath();
      if (flip) {
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
      } else {
        ctx.moveTo(xx, y + h);
        ctx.lineTo(xx, y + h - (h / w) * (xx - x));
      }
      ctx.stroke();
    }
    // ladder-like cross brace
    ctx.strokeStyle = m === MATERIALS.metal ? 'rgba(230,246,255,0.33)' : 'rgba(255,226,166,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (flip) {
      ctx.moveTo(x + 2, y + h * 0.5);
      ctx.lineTo(x + w * 0.5, y + 2);
    } else {
      ctx.moveTo(x + 2, y + h - 2);
      ctx.lineTo(x + w * 0.5, y + h - h * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawWormShadows(ctx, game) {
    ctx.save();
    for (const worm of game.worms) {
      if (worm.dead) continue;
      ctx.fillStyle = 'rgba(10,5,18,0.25)';
      ctx.beginPath();
      ctx.ellipse(worm.x, worm.y + 2, 16, 5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWorms(ctx, game, t) {
    for (const worm of game.worms) {
      if (worm.dead) {
        if (worm.grave) this.drawGrave(ctx, worm);
        continue;
      }
      const active = game.currentWorm === worm && !game.isOver;
      this.drawWorm(ctx, worm, game, active, t);
    }
  }

  drawGrave(ctx, worm) {
    const x = worm.grave.x;
    const y = worm.grave.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(14,9,24,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 11, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#665b76';
    roundRectPath(ctx, -5, -15, 10, 16, 4);
    ctx.fill();
    ctx.strokeStyle = '#342c44';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#2e253e';
    ctx.font = `900 6px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('RIP', 0, -5);
    ctx.strokeStyle = '#5b4f6e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -19);
    ctx.lineTo(7, -19);
    ctx.stroke();
    ctx.restore();
  }

  drawWorm(ctx, worm, game, active, t) {
    const team = worm.team;
    const bodyDark = team === 0 ? '#268a6a' : '#9a3546';
    const body = team === 0 ? '#6ce9ac' : '#ff8790';
    const bodyLight = team === 0 ? '#c5ffe0' : '#ffd0ce';
    const outline = team === 0 ? '#113d38' : '#4b1626';
    const aim = worm.aimAngle ?? -0.5;
    const facing = Math.cos(aim) >= 0 ? 1 : -1;
    const moving = Math.abs(worm.vx) > 8 && worm.onGround;
    const wiggle = Math.sin(t * (moving ? 12 : 2.2) + worm.phase) * (moving ? 2.4 : 0.9);
    const jumpSquash = worm.onGround ? 0 : clamp(-worm.vy / 500, -0.12, 0.12);
    const bob = Math.sin(t * 2.3 + worm.phase) * 1.2;
    const hurt = worm.hurtTimer > 0;

    ctx.save();
    ctx.translate(worm.x, worm.y - 1);
    ctx.scale(1 + jumpSquash, 1 - jumpSquash);
    ctx.translate(0, bob);

    // Active ring / glow
    if (active) {
      ctx.save();
      const pulse = 0.5 + Math.sin(t * 3.4) * 0.18;
      ctx.strokeStyle = `rgba(255,225,74,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 1, 22, 7, 0, 0, TAU);
      ctx.stroke();
      const grad = ctx.createRadialGradient(0, -26, 2, 0, -26, 44);
      grad.addColorStop(0, 'rgba(255,225,74,0.12)');
      grad.addColorStop(1, 'rgba(255,225,74,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -26, 44, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Tail and body segments (back to front)
    const segments = 6;
    for (let i = 0; i < segments; i += 1) {
      const p = i / (segments - 1);
      const sway = Math.sin(t * (moving ? 10 : 2) + worm.phase + p * 3.4) * (2.6 + p * 1.5);
      const x = sway + facing * (1 - p) * 2;
      const y = -7 - p * 33;
      const r = 6.6 + p * 3.4;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.94, r, 0, 0, TAU);
      ctx.fillStyle = bodyDark;
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // belly stripe
      ctx.beginPath();
      ctx.ellipse(x - facing * r * 0.18, y + r * 0.15, r * 0.52, r * 0.62, 0.12, 0, TAU);
      ctx.fillStyle = body;
      ctx.fill();

      // band + highlight
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, -2.45, -1.05);
      ctx.strokeStyle = withAlpha(bodyLight, 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.92, 0.5, 1.7);
        ctx.strokeStyle = withAlpha(outline, 0.35);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    const headX = Math.sin(t * (moving ? 10 : 2) + worm.phase + 3.4) * 2.2 + facing * 1.5;
    const headY = -43;
    const headR = 9.8;

    // helm / bandana
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(headX, headY - 2, headR + 1.5, headR * 0.86, -0.15, Math.PI, TAU);
    ctx.fillStyle = team === 0 ? '#2b9ca5' : '#a63d52';
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // bandana tails
    ctx.beginPath();
    ctx.moveTo(headX - facing * 8, headY - 5);
    ctx.quadraticCurveTo(headX - facing * 17, headY - 3 + Math.sin(t * 5) * 1.4, headX - facing * 18, headY + 3);
    ctx.quadraticCurveTo(headX - facing * 11, headY + 2, headX - facing * 8, headY + 1);
    ctx.fillStyle = team === 0 ? '#2b9ca5' : '#a63d52';
    ctx.fill();
    ctx.restore();

    // Head
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, TAU);
    const faceGrad = ctx.createRadialGradient(headX - 3, headY - 4, 1, headX, headY, headR);
    faceGrad.addColorStop(0, bodyLight);
    faceGrad.addColorStop(0.5, body);
    faceGrad.addColorStop(1, bodyDark);
    ctx.fillStyle = hurt ? '#fff2d6' : faceGrad;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eyes look toward aim
    const lookX = Math.cos(aim) * 1.55;
    const lookY = Math.sin(aim) * 1.2;
    for (const side of [-1, 1]) {
      const ex = headX + side * 3.9;
      const ey = headY - 1.6;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.7, 0, TAU);
      ctx.fillStyle = '#fffdf6';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + lookX, ey + lookY, 1.35, 0, TAU);
      ctx.fillStyle = '#171020';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + lookX - 0.4, ey + lookY - 0.5, 0.42, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    // Mouth
    ctx.beginPath();
    if (hurt) {
      ctx.ellipse(headX, headY + 4.2, 1.6, 1.9, 0, 0, TAU);
      ctx.fillStyle = '#4a1420';
      ctx.fill();
    } else {
      ctx.arc(headX + 0.2, headY + 3.2, 2.1, 0.15, Math.PI - 0.15);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    // cheek blush
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = team === 0 ? '#ff9cc5' : '#ffb1a9';
    ctx.beginPath();
    ctx.arc(headX + 5.4, headY + 2.5, 1.8, 0, TAU);
    ctx.arc(headX - 6.4, headY + 2.5, 1.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Weapon + arm
    this.drawWeapon(ctx, worm, game, headX, headY, aim, t);

    if (hurt) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,80,80,${0.3 + Math.sin(t * 50) * 0.12})`;
      ctx.beginPath();
      ctx.arc(headX, headY - 20, 34, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Nameplate
    if (active || worm.showPlate > 0) {
      this.drawPlate(ctx, worm, active, t);
    }
  }

  drawWeapon(ctx, worm, game, headX, headY, aim, t) {
    const teamAmmo = game.ammo[worm.team];
    const weapon = worm.weapon || 'bazooka';
    const facing = Math.cos(aim) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(headX + facing * 2, headY + 1);
    ctx.rotate(aim);
    if (facing < 0) ctx.scale(1, -1);

    // arm
    ctx.strokeStyle = worm.team === 0 ? '#269a72' : '#a63d52';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(8, 6, 13, 2);
    ctx.stroke();

    if (weapon === 'bazooka') {
      ctx.fillStyle = '#2f3349';
      roundRectPath(ctx, 5, -6, 28, 8, 2);
      ctx.fill();
      ctx.strokeStyle = '#111420';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      ctx.fillRect(10, -5.2, 5, 6.4);
      ctx.fillStyle = '#6e7795';
      ctx.fillRect(29, -7.5, 5, 11);
      ctx.fillStyle = '#171a27';
      ctx.beginPath();
      ctx.arc(33.5, -2, 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b6c8e8';
      ctx.fillRect(13, -8, 2, 3);
    } else if (weapon === 'grenade') {
      ctx.fillStyle = worm.team === 0 ? '#269a72' : '#a63d52';
      ctx.beginPath();
      ctx.arc(14, 0, 3.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#6dbb70';
      ctx.beginPath();
      ctx.arc(18, -2, 5.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#345f39';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#cbd3d7';
      ctx.fillRect(16.5, -9, 3, 3);
    } else if (weapon === 'cluster') {
      ctx.fillStyle = worm.team === 0 ? '#269a72' : '#a63d52';
      ctx.beginPath();
      ctx.arc(13, 0, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#bca1fa';
      ctx.beginPath();
      ctx.arc(19, -2, 4.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#5c3a9e';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#7250b5';
      ctx.beginPath();
      ctx.arc(24.5, 1, 2.1, 0, TAU);
      ctx.fill();
    } else {
      // pickaxe
      ctx.strokeStyle = '#8d5a32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 3);
      ctx.lineTo(21, -7);
      ctx.stroke();
      ctx.fillStyle = '#cfdcef';
      ctx.beginPath();
      ctx.moveTo(18, -12);
      ctx.quadraticCurveTo(27, -13, 29, -4);
      ctx.quadraticCurveTo(23, -8, 16, -8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#667a97';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPlate(ctx, worm, active, t) {
    const name = worm.name.toUpperCase();
    const w = 78;
    const h = 19;
    const x = worm.x - w / 2;
    const y = worm.y - 76 - (active ? Math.sin(t * 3) * 2 : 0);
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.7;
    ctx.fillStyle = 'rgba(11,7,20,0.82)';
    ctx.strokeStyle = active ? 'rgba(255,225,74,0.65)' : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = worm.team === 0 ? '#7cf7d4' : '#ff9c9f';
    ctx.font = `900 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 6, y + 7);

    const hp = clamp(worm.health / worm.maxHealth, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundRectPath(ctx, x + 6, y + 12, w - 12, 3, 2);
    ctx.fill();
    ctx.fillStyle = hp > 0.55 ? (worm.team === 0 ? '#6df08a' : '#ff7b7e') : hp > 0.28 ? '#ffca55' : '#ff4d5e';
    roundRectPath(ctx, x + 6, y + 12, (w - 12) * hp, 3, 2);
    ctx.fill();

    if (active) {
      const bounce = Math.sin(t * 3.2) * 3;
      ctx.fillStyle = 'rgba(255,225,74,0.95)';
      ctx.beginPath();
      ctx.moveTo(worm.x - 5, y - 8 + bounce);
      ctx.lineTo(worm.x + 5, y - 8 + bounce);
      ctx.lineTo(worm.x, y - 1 + bounce);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawProjectiles(ctx, game, t) {
    for (const p of game.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'rocket') {
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        // exhaust
        const flame = 8 + Math.random() * 8;
        const grad = ctx.createLinearGradient(-14, 0, -14 - flame, 0);
        grad.addColorStop(0, 'rgba(255,247,183,0.95)');
        grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
        grad.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-12, -4);
        ctx.lineTo(-12 - flame, 0);
        ctx.lineTo(-12, 4);
        ctx.closePath();
        ctx.fill();
        // body
        ctx.fillStyle = '#f4e8cc';
        roundRectPath(ctx, -12, -4.5, 24, 9, 4);
        ctx.fill();
        ctx.strokeStyle = '#2b2438';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ff6d72';
        ctx.beginPath();
        ctx.moveTo(11, -4.2);
        ctx.lineTo(18, 0);
        ctx.lineTo(11, 4.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4c425f';
        ctx.beginPath();
        ctx.moveTo(-11, -4);
        ctx.lineTo(-17, -9);
        ctx.lineTo(-7, -4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-11, 4);
        ctx.lineTo(-17, 9);
        ctx.lineTo(-7, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#65f2ff';
        ctx.beginPath();
        ctx.arc(2, 0, 2.2, 0, TAU);
        ctx.fill();
      } else {
        const r = p.kind === 'cluster' ? 5.2 : 7.2;
        ctx.rotate(p.spin || 0);
        const grad = ctx.createRadialGradient(-2, -2, 1, 0, 0, r);
        grad.addColorStop(0, p.kind === 'cluster' ? '#e5d7ff' : '#a7ef9e');
        grad.addColorStop(0.55, p.kind === 'cluster' ? '#a681f0' : '#6bbd70');
        grad.addColorStop(1, p.kind === 'cluster' ? '#5a339e' : '#326a3c');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#20301f';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(30,40,30,0.45)';
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.stroke();
        ctx.fillStyle = '#d5dde0';
        ctx.fillRect(-1.6, -r - 3, 3.2, 3);
        // blinking fuse
        const spark = Math.abs(Math.sin(t * 18 + (p.spin || 0)));
        ctx.fillStyle = `rgba(255,190,80,${0.55 + spark * 0.45})`;
        ctx.beginPath();
        ctx.arc(0, -r - 4.5, 1.8 + spark * 1.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFloaters(ctx, game) {
    if (!game.floaters?.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of game.floaters) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 2.4);
      ctx.font = `900 ${f.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,6,20,0.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  drawAim(ctx, game, t) {
    if (game.phase !== 'player' || game.isOver) return;
    const preview = game.getAimPreview();
    if (!preview) return;
    const worm = game.currentWorm;
    if (!worm) return;

    if (game.buildMode) {
      this.drawBuildOverlay(ctx, game, t);
      return;
    }

    const { points, impact, muzzle } = preview;
    if (points.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < points.length; i += 2) {
        const p = points[i];
        const a = clamp(1 - i / points.length, 0.08, 1);
        ctx.fillStyle = `rgba(255,225,122,${0.14 + a * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + a * 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      if (impact) {
        ctx.save();
        const pulse = 0.6 + Math.sin(t * 7) * 0.25;
        ctx.strokeStyle = `rgba(255,225,74,${pulse})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(impact.x, impact.y, 9 + pulse * 3, 4 + pulse * 1.2, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, 2, 0, TAU);
        ctx.fillStyle = 'rgba(255,225,74,0.8)';
        ctx.fill();
        ctx.restore();
      }
    }

    // power gauge around the worm
    const power = game.chargePower;
    const pivotX = worm.x;
    const pivotY = worm.y - 41;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(12,7,22,0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 34, -2.5, 2.5);
    ctx.stroke();
    if (power > 0) {
      const grad = ctx.createLinearGradient(pivotX - 30, pivotY, pivotX + 30, pivotY);
      grad.addColorStop(0, '#7cffbb');
      grad.addColorStop(0.5, '#ffe14a');
      grad.addColorStop(1, '#ff6d72');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 34, -2.5, -2.5 + 5 * clamp(power, 0, 1));
      ctx.stroke();
    }
    ctx.restore();

    // angle tick line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,225,74,0.5)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX + Math.cos(worm.aimAngle) * 38, pivotY + Math.sin(worm.aimAngle) * 38);
    ctx.stroke();
    ctx.restore();

    if (game.mouse.active) {
      this.drawReticle(ctx, game.mouse.x, game.mouse.y, game.chargePower > 0, t);
    }
  }

  drawReticle(ctx, x, y, charging, t) {
    ctx.save();
    const spin = t * (charging ? 2.8 : 0.7);
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = charging ? 'rgba(255,225,74,0.95)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, 10, i * (TAU / 4) + 0.14, i * (TAU / 4) + 0.62);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, TAU);
    ctx.fillStyle = charging ? '#ffe14a' : 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.restore();
  }

  drawBuildOverlay(ctx, game, t) {
    const worm = game.currentWorm;
    if (!worm) return;
    const ghost = game.getBuildGhost();
    if (!ghost) return;
    const grid = game.buildGrid;

    ctx.save();
    // range circle
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = 'rgba(88,238,255,0.8)';
    ctx.setLineDash([5, 9]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(worm.x, worm.y - 20, game.buildRange, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // local snapping grid
    const cx = Math.round(ghost.piece.x / grid) * grid;
    const cy = Math.round(ghost.piece.y / grid) * grid;
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = 'rgba(88,238,255,0.62)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i += 1) {
      const gx = cx + i * grid;
      const gy = cy + i * grid;
      ctx.beginPath();
      ctx.moveTo(gx, cy - grid * 2);
      ctx.lineTo(gx, cy + grid * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - grid * 2, gy);
      ctx.lineTo(cx + grid * 2, gy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(88,238,255,0.5)';
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iy = -2; iy <= 2; iy += 1) {
        ctx.beginPath();
        ctx.arc(cx + ix * grid, cy + iy * grid, 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    this.drawGhostPiece(ctx, ghost, t);
    ctx.restore();
  }

  drawGhostPiece(ctx, ghost, t) {
    const piece = ghost.piece;
    const valid = ghost.valid;
    const color = valid ? '88,238,255' : '255,90,100';
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = `rgba(${color},0.95)`;
    ctx.fillStyle = `rgba(${color},0.19)`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -t * 18;

    if (piece.type === 'ramp') {
      ctx.beginPath();
      if (piece.flip) {
        ctx.moveTo(piece.x, piece.y);
        ctx.lineTo(piece.x + piece.w, piece.y + piece.h);
        ctx.lineTo(piece.x, piece.y + piece.h);
      } else {
        ctx.moveTo(piece.x, piece.y + piece.h);
        ctx.lineTo(piece.x + piece.w, piece.y);
        ctx.lineTo(piece.x + piece.w, piece.y + piece.h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      roundRectPath(ctx, piece.x, piece.y, piece.w, piece.h, 3);
      ctx.fill();
      ctx.stroke();
    }

    // corner ticks
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const corners = [
      [piece.x, piece.y],
      [piece.x + piece.w, piece.y],
      [piece.x, piece.y + piece.h],
      [piece.x + piece.w, piece.y + piece.h],
    ];
    ctx.strokeStyle = `rgba(${color},1)`;
    ctx.lineWidth = 2.4;
    for (const [x, y] of corners) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }

    if (!valid) {
      ctx.fillStyle = 'rgba(255,90,100,0.95)';
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(ghost.reason.toUpperCase(), piece.x + piece.w / 2, piece.y - 12);
    } else {
      ctx.fillStyle = 'rgba(255,225,74,0.95)';
      ctx.font = `900 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${ghost.cost} MATS`, piece.x + piece.w / 2, piece.y - 12);
    }
    ctx.restore();
  }

  drawAtmosphere(ctx, t) {
    // fireflies / dust
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const x = (e.x + Math.sin(t * 0.3 + e.phase) * 25 + t * e.speed * 4) % 1650;
      const y = e.y + Math.cos(t * 0.45 + e.phase) * 14;
      const a = 0.12 + (Math.sin(t * e.speed + e.phase) * 0.5 + 0.5) * 0.45;
      ctx.fillStyle = `rgba(255,231,157,${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(x, y, e.s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Edge shade
    const vignette = ctx.createRadialGradient(800, 470, 310, 800, 470, 950);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(7,4,16,0.16)');
    vignette.addColorStop(1, 'rgba(5,3,12,0.62)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawOverlayEffects(ctx, game, t) {
    if (game.flash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(game.flash, 0, 0.55);
      ctx.fillStyle = '#fff3cf';
      ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
      ctx.restore();
    }
    if (game.hitVignette > 0) {
      const grad = ctx.createRadialGradient(this.viewWidth / 2, this.viewHeight / 2, this.viewHeight * 0.25, this.viewWidth / 2, this.viewHeight / 2, this.viewHeight * 0.8);
      grad.addColorStop(0, 'rgba(255,40,70,0)');
      grad.addColorStop(1, `rgba(255,30,60,${game.hitVignette * 0.3})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    }
  }

  drawLetterbox(ctx, t) {
    const { offsetX, offsetY, viewWidth, viewHeight } = this;
    if (offsetX > 2) {
      const gradL = ctx.createLinearGradient(0, 0, offsetX, 0);
      gradL.addColorStop(0, '#090614');
      gradL.addColorStop(1, '#120c22');
      ctx.fillStyle = gradL;
      ctx.fillRect(0, 0, offsetX, viewHeight);
      const gradR = ctx.createLinearGradient(viewWidth - offsetX, 0, viewWidth, 0);
      gradR.addColorStop(0, '#120c22');
      gradR.addColorStop(1, '#090614');
      ctx.fillStyle = gradR;
      ctx.fillRect(viewWidth - offsetX, 0, offsetX, viewHeight);
    }
    if (offsetY > 2) {
      ctx.fillStyle = '#090614';
      ctx.fillRect(0, 0, viewWidth, offsetY);
      ctx.fillRect(0, viewHeight - offsetY, viewWidth, offsetY);
    }

    // fine screen wash and scanline
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 0; y < viewHeight; y += 4) {
      ctx.fillRect(0, y, viewWidth, 1);
    }
    ctx.restore();

    ctx.save();
    const edge = ctx.createLinearGradient(0, 0, 0, 90);
    edge.addColorStop(0, 'rgba(0,0,0,0.3)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, viewWidth, 90);
    ctx.restore();
  }
}
