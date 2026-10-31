import { clamp, range } from './logic.js';

const TAU = Math.PI * 2;

function particle(props) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    life: 1, maxLife: 1,
    size: 4, endSize: 0,
    color: '#fff', gravity: 0, drag: 0.99,
    shape: 'circle', rotation: 0, spin: 0,
    additive: false, glow: 0, alpha: 1,
    ...props,
  };
}

export class Particles {
  constructor() {
    this.items = [];
    this.shockwaves = [];
    this.flashes = [];
    this.decals = [];
  }

  clear() {
    this.items.length = 0;
    this.shockwaves.length = 0;
    this.flashes.length = 0;
  }

  add(p) {
    if (this.items.length > 900) this.items.shift();
    this.items.push(particle(p));
  }

  flash(x, y, radius, color = '#ffcf7a') {
    this.flashes.push({ x, y, radius, life: 0.22, maxLife: 0.22, color });
  }

  shockwave(x, y, radius, color = '255,220,140', growth = 150) {
    this.shockwaves.push({ x, y, radius, life: 0.55, maxLife: 0.55, color, growth });
  }

  explosion(x, y, radius, palette = {}) {
    const dirt = palette.dirt ?? ['#6f4a31', '#55351f', '#8a5f3c'];
    const grass = palette.grass ?? ['#65d354', '#2f9d45'];
    const count = Math.round(clamp(radius * 0.85, 26, 74));
    this.flash(x, y, radius * 1.2);
    this.shockwave(x, y, radius * 0.5, '255,226,160');
    this.shockwave(x, y, radius * 0.25, '255,255,230');

    for (let i = 0; i < 14; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 20, radius * 2.4);
      this.add({
        x: x + Math.cos(a) * radius * 0.28,
        y: y + Math.sin(a) * radius * 0.28,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        life: range(Math.random, 0.28, 0.65),
        size: range(Math.random, radius * 0.12, radius * 0.26),
        endSize: range(Math.random, radius * 0.24, radius * 0.48),
        color: i % 4 === 0 ? '#ffd166' : i % 4 === 1 ? '#ff8a3d' : i % 4 === 2 ? '#ff5a2e' : '#ffb347',
        shape: 'circle', drag: 0.92, gravity: -30,
        additive: true, glow: 0.35, alpha: 0.62,
      });
    }

    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 70, radius * 5.2);
      const isDirt = Math.random() > 0.22;
      this.add({
        x: x + Math.cos(a) * radius * 0.4,
        y: y + Math.sin(a) * radius * 0.4,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - range(Math.random, 30, 140),
        life: range(Math.random, 0.55, 1.45),
        size: range(Math.random, 2, isDirt ? 7 : 4),
        endSize: range(Math.random, 0.5, 2),
        color: isDirt
          ? (Math.random() > 0.5 ? dirt : grass)[Math.floor(Math.random() * 3) % (Math.random() > 0.5 ? dirt : grass).length]
          : (Math.random() > 0.5 ? '#ffd66b' : '#ff8a3d'),
        shape: isDirt ? 'rect' : 'spark',
        gravity: isDirt ? 820 : 60,
        drag: isDirt ? 0.995 : 0.96,
        rotation: Math.random() * TAU,
        spin: range(Math.random, -9, 9),
        additive: !isDirt,
        glow: isDirt ? 0 : 0.7,
      });
    }

    for (let i = 0; i < 16; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 18, radius * 1.1);
      this.add({
        x: x + Math.cos(a) * radius * 0.3,
        y: y + Math.sin(a) * radius * 0.3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - range(Math.random, 15, 60),
        life: range(Math.random, 1.2, 2.6),
        size: range(Math.random, radius * 0.45, radius * 0.95),
        endSize: range(Math.random, radius * 1.15, radius * 2.2),
        color: Math.random() > 0.5 ? '#241a2b' : '#4e3c47',
        shape: 'smoke', drag: 0.97, gravity: -7, alpha: 0.55,
      });
    }
  }

  muzzle(x, y, angle, scale = 1) {
    for (let i = 0; i < 13; i += 1) {
      const a = angle + range(Math.random, -0.4, 0.4);
      const speed = range(Math.random, 100, 480) * scale;
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: range(Math.random, 0.1, 0.34),
        size: range(Math.random, 2, 7) * scale,
        endSize: 0,
        color: i % 3 ? '#ffd66e' : '#fff8cf',
        shape: 'spark', drag: 0.93, gravity: 60, additive: true, glow: 1,
      });
    }
    this.add({
      x, y,
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
      life: 0.55, size: 9 * scale, endSize: 38 * scale,
      color: '#32263a', shape: 'smoke', drag: 0.94, alpha: 0.45, gravity: -15,
    });
  }

  rocketTrail(x, y, angle) {
    const a = angle + Math.PI + range(Math.random, -0.35, 0.35);
    this.add({
      x: x + Math.cos(a) * 10,
      y: y + Math.sin(a) * 10,
      vx: Math.cos(a) * range(Math.random, 10, 60),
      vy: Math.sin(a) * range(Math.random, 10, 60),
      life: range(Math.random, 0.2, 0.55),
      size: range(Math.random, 2, 5),
      endSize: range(Math.random, 7, 16),
      color: Math.random() > 0.4 ? '#5b4b5f' : '#c9a98d',
      shape: 'smoke', drag: 0.95, gravity: -18, alpha: 0.38,
    });
    if (Math.random() > 0.35) {
      this.add({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * 40,
        vy: Math.sin(a) * 40,
        life: 0.14, size: 2.6, endSize: 0,
        color: Math.random() > 0.5 ? '#ffe9a3' : '#ff9c3e',
        shape: 'spark', additive: true, glow: 1, drag: 0.9,
      });
    }
  }

  grenadeTrail(x, y) {
    if (Math.random() > 0.5) {
      this.add({
        x, y,
        vx: range(Math.random, -12, 12),
        vy: range(Math.random, -12, 12),
        life: 0.22, size: 1.6, endSize: 4,
        color: '#dfe9ff', shape: 'smoke', alpha: 0.24, drag: 0.94,
      });
    }
  }

  buildBurst(x, y, material, good = true) {
    const colors = material === 'brick'
      ? ['#d46b5b', '#a84b42', '#f59b7d']
      : material === 'metal'
        ? ['#a9c0dc', '#6d84a7', '#e6f3ff']
        : ['#c99152', '#8f5c2d', '#e8b878'];
    for (let i = 0; i < 24; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 20, 180);
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 60,
        life: range(Math.random, 0.3, 0.85),
        size: range(Math.random, 2, 5.2),
        endSize: 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'rect', gravity: 720, drag: 0.995,
        rotation: Math.random() * TAU, spin: range(Math.random, -8, 8),
      });
    }
    this.shockwave(x, y, 8, good ? '255,232,130' : '255,110,110', 26);
    for (let i = 0; i < 6; i += 1) {
      this.add({
        x, y,
        vx: range(Math.random, -50, 50),
        vy: range(Math.random, -80, 10),
        life: 0.5, size: 10, endSize: 28,
        color: '#3d3048', shape: 'smoke', alpha: 0.3, drag: 0.95,
      });
    }
  }

  harvest(x, y, colors = ['#7edc64', '#5a3820']) {
    for (let i = 0; i < 16; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 40, 200);
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 80,
        life: range(Math.random, 0.35, 0.9),
        size: range(Math.random, 1.5, 4.5),
        endSize: 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.5 ? 'rect' : 'spark',
        gravity: 640, drag: 0.995, rotation: Math.random() * TAU,
        spin: range(Math.random, -8, 8), additive: Math.random() > 0.6,
      });
    }
  }

  hurt(x, y, color = '#ff6b72') {
    for (let i = 0; i < 12; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 30, 170);
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        life: range(Math.random, 0.25, 0.65),
        size: range(Math.random, 2, 6),
        endSize: 0,
        color: i % 2 ? color : '#fff0c9',
        shape: 'spark', gravity: 510, drag: 0.98, additive: true, glow: 0.7,
      });
    }
  }

  death(x, y, color) {
    this.flash(x, y, 140, '#ffe2a0');
    this.shockwave(x, y, 16, '255,210,120', 74);
    for (let i = 0; i < 40; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 50, 340);
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 90,
        life: range(Math.random, 0.6, 1.5),
        size: range(Math.random, 2, 7),
        endSize: 0,
        color: Math.random() > 0.35 ? color : '#ffe6a8',
        shape: Math.random() > 0.4 ? 'spark' : 'circle',
        gravity: 420, drag: 0.985,
        additive: Math.random() > 0.4, glow: 0.8,
      });
    }
    for (let i = 0; i < 12; i += 1) {
      this.add({
        x, y,
        vx: range(Math.random, -80, 80),
        vy: range(Math.random, -120, 20),
        life: range(Math.random, 0.8, 1.8),
        size: range(Math.random, 10, 24),
        endSize: range(Math.random, 30, 60),
        color: '#453447', shape: 'smoke', alpha: 0.4, drag: 0.96,
      });
    }
  }

  splash(x, y) {
    for (let i = 0; i < 22; i += 1) {
      const a = -Math.PI / 2 + range(Math.random, -0.9, 0.9);
      const speed = range(Math.random, 40, 230);
      this.add({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: range(Math.random, 0.3, 0.9),
        size: range(Math.random, 2, 7),
        endSize: 0,
        color: Math.random() > 0.4 ? '#a8f7ff' : '#e4feff',
        shape: 'circle', gravity: 620, drag: 0.99,
      });
    }
    this.shockwave(x, y, 5, '140,235,255', 36);
  }

  confetti(x, y, count = 80) {
    const colors = ['#ffe14a', '#9d63ff', '#58eeff', '#ff6d72', '#6df08a', '#fff'];
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * TAU;
      const speed = range(Math.random, 80, 420);
      this.add({
        x: x + range(Math.random, -150, 150),
        y: y + range(Math.random, -40, 40),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 250,
        life: range(Math.random, 1.2, 2.8),
        size: range(Math.random, 2, 5),
        endSize: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'rect', gravity: 380, drag: 0.985,
        rotation: Math.random() * TAU, spin: range(Math.random, -12, 12),
      });
    }
  }

  dust(x, y, amount = 8) {
    for (let i = 0; i < amount; i += 1) {
      this.add({
        x: x + range(Math.random, -10, 10),
        y: y + range(Math.random, -4, 4),
        vx: range(Math.random, -36, 36),
        vy: range(Math.random, -30, -4),
        life: range(Math.random, 0.35, 0.85),
        size: range(Math.random, 3, 7),
        endSize: range(Math.random, 12, 24),
        color: '#b78d68', shape: 'smoke', drag: 0.94, alpha: 0.28,
      });
    }
  }

  update(dt, terrain) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (terrain && (p.shape === 'rect' || p.shape === 'circle') && p.gravity > 200) {
        if (terrain.solidAt(nx, ny)) {
          p.vy *= -0.32;
          p.vx *= 0.55;
          p.y = p.y - 1;
        } else {
          p.x = nx;
          p.y = ny;
        }
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.rotation += p.spin * dt;
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const s = this.shockwaves[i];
      s.life -= dt;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const s of this.shockwaves) {
      const t = 1 - s.life / s.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${s.color},${(1 - t) * 0.7})`;
      ctx.lineWidth = Math.max(0.5, 6 * (1 - t));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + t * s.growth, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    const normal = [];
    const additive = [];
    for (const p of this.items) (p.additive ? additive : normal).push(p);

    for (const p of normal) {
      const lifeT = clamp(p.life / p.maxLife, 0, 1);
      const alpha = p.alpha * Math.min(1, lifeT * 2.4);
      const size = Math.max(0.2, p.size + (p.endSize - p.size) * (1 - lifeT));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      if (p.rotation) ctx.rotate(p.rotation);
      if (p.shape === 'smoke') {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(20,14,28,0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = p.color;
      }
      if (p.shape === 'rect') {
        ctx.fillRect(-size / 2, -size / 2, size, size * 0.72);
      } else if (p.shape === 'spark') {
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.7, size * 0.48, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    if (additive.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of additive) {
        const lifeT = clamp(p.life / p.maxLife, 0, 1);
        const size = Math.max(0.2, p.size + (p.endSize - p.size) * (1 - lifeT));
        ctx.globalAlpha = p.alpha * Math.min(1, lifeT * 2.4);
        if (p.glow) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3.2);
          grad.addColorStop(0, p.color);
          grad.addColorStop(0.32, p.color);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 3.2, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (p.shape === 'spark') {
          ctx.ellipse(p.x, p.y, size * 2.2, size * 0.55, Math.atan2(p.vy, p.vx), 0, TAU);
        } else {
          ctx.arc(p.x, p.y, size, 0, TAU);
        }
        ctx.fill();
      }
      ctx.restore();
    }

    for (const f of this.flashes) {
      const t = f.life / f.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
      grad.addColorStop(0, `rgba(255,180,92,${0.18 * t})`);
      grad.addColorStop(0.35, `rgba(255,110,52,${0.07 * t})`);
      grad.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
