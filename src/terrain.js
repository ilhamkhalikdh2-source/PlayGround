import { clamp, lerp } from './logic.js';

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Destructible island rendered to an offscreen canvas.
 * Collision reads the canvas' alpha channel, so tunnels, caves and overhangs
 * all behave the same way as the visible terrain.
 */
export class Terrain {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.surface = new Float32Array(width);
    this.alpha = null;
    this.scorch = [];
  }

  generate(rng, seed = 1) {
    const { width, height, surface } = this;
    const phase1 = rng() * Math.PI * 2;
    const phase2 = rng() * Math.PI * 2;
    const phase3 = rng() * Math.PI * 2;
    const phase4 = rng() * Math.PI * 2;

    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      let h = 645
        + 55 * Math.sin(x * 0.0037 + phase1)
        + 26 * Math.sin(x * 0.0103 + phase2)
        + 11 * Math.sin(x * 0.031 + phase3)
        + 6 * Math.sin(x * 0.08 + phase4);

      // Central valley with a gentle bowl.
      h += 34 * Math.exp(-(((x - 805) / 145) ** 2));
      // Left plateau.
      h -= 94 * smoothstep(170, 340, x) * (1 - smoothstep(475, 535, x));
      // Right ridge.
      h -= 72 * smoothstep(1030, 1100, x) * (1 - smoothstep(1265, 1375, x));

      // Level the two deployment shelves.
      const leftBlend = 1 - smoothstep(80, 300, Math.abs(x - 290));
      const rightBlend = 1 - smoothstep(80, 300, Math.abs(x - 1310));
      h = lerp(h, 635 + (x - 290) * 0.045, leftBlend * 0.82);
      h = lerp(h, 655 - (x - 1310) * 0.035, rightBlend * 0.82);

      // The island falls away into the sea at both edges.
      const edgeIn = smoothstep(0, 120, x) * smoothstep(0, 120, width - x);
      h += (1 - edgeIn) * 330;
      // Ragged coastal lip.
      h += smoothstep(94, 118, x) * (1 - smoothstep(118, 142, x)) * 22;
      h += smoothstep(width - 142, width - 118, x) * (1 - smoothstep(width - 118, width - 94, x)) * 18;

      surface[x] = h;
    }

    this.drawIsland(rng, seed);
    this.refreshAlpha();
    return this;
  }

  drawIsland(rng, seed) {
    const { ctx, width, height, surface } = this;
    ctx.clearRect(0, 0, width, height);

    const island = new Path2D();
    island.moveTo(0, surface[0]);
    for (let x = 1; x < width; x += 1) island.lineTo(x, surface[x]);
    island.lineTo(width, height);
    island.lineTo(0, height);
    island.closePath();

    // deep rock body
    const body = ctx.createLinearGradient(0, 520, 0, height);
    body.addColorStop(0, '#66505c');
    body.addColorStop(0.2, '#503c4a');
    body.addColorStop(0.55, '#3b2c42');
    body.addColorStop(1, '#21192f');
    ctx.fillStyle = body;
    ctx.fill(island);

    ctx.save();
    ctx.clip(island);

    // Warm topsoil band
    const topsoil = new Path2D();
    topsoil.moveTo(0, surface[0] - 2);
    for (let x = 1; x < width; x += 1) topsoil.lineTo(x, surface[x] - 2);
    for (let x = width - 1; x >= 0; x -= 1) topsoil.lineTo(x, surface[x] + 78 + Math.sin(x * 0.06) * 7);
    topsoil.closePath();
    const soil = ctx.createLinearGradient(0, 520, 0, 760);
    soil.addColorStop(0, '#8a5d39');
    soil.addColorStop(0.35, '#75502f');
    soil.addColorStop(1, '#5a3d2a');
    ctx.fillStyle = soil;
    ctx.fill(topsoil);

    // sediment strata
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i += 1) {
      const baseY = 690 + i * 26;
      ctx.strokeStyle = i % 2 ? 'rgba(20,10,28,0.24)' : 'rgba(173,118,82,0.14)';
      ctx.beginPath();
      for (let x = 0; x <= width; x += 18) {
        const y = baseY + Math.sin(x * 0.011 + i * 1.7) * 8 + Math.sin(x * 0.033 + i) * 2.5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Rock seams and pebbles
    for (let i = 0; i < 520; i += 1) {
      const x = rng() * width;
      const y = 560 + rng() * (height - 560);
      const size = 1 + rng() * 3.4;
      ctx.fillStyle = rng() > 0.55 ? 'rgba(214,158,124,0.18)' : 'rgba(14,9,24,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.55, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Roots and cracks in the topsoil
    ctx.lineCap = 'round';
    for (let i = 0; i < 34; i += 1) {
      const x = 100 + rng() * (width - 200);
      const y = surface[Math.floor(x)] + 8 + rng() * 36;
      ctx.strokeStyle = `rgba(38,22,20,${0.18 + rng() * 0.24})`;
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 8, y + 10, x - 9, y + 18, x + (rng() - 0.5) * 24, y + 26 + rng() * 18);
      ctx.stroke();
    }

    // Dark lip under the grass line
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      if (x === 0) ctx.moveTo(x, surface[x]); else ctx.lineTo(x, surface[x]);
    }
    ctx.strokeStyle = '#2d2b1e';
    ctx.lineWidth = 13;
    ctx.stroke();

    // Main grass cap
    const grass = ctx.createLinearGradient(0, 540, 0, 700);
    grass.addColorStop(0, '#8eea69');
    grass.addColorStop(0.45, '#55c94f');
    grass.addColorStop(1, '#2d8b3d');
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      if (x === 0) ctx.moveTo(x, surface[x] - 3); else ctx.lineTo(x, surface[x] - 3);
    }
    ctx.strokeStyle = grass;
    ctx.lineWidth = 8;
    ctx.stroke();

    // Highlight rut
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      if (x === 0) ctx.moveTo(x, surface[x] - 6); else ctx.lineTo(x, surface[x] - 6);
    }
    ctx.strokeStyle = 'rgba(196,255,139,0.34)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Grass blades and flowers live above the surface, outside the clip.
    for (let x = 8; x < width - 8; x += 4) {
      const sy = surface[x];
      if (sy > 860) continue;
      const blade = 2 + rng() * 8;
      const lean = (rng() - 0.5) * 7;
      ctx.strokeStyle = rng() > 0.7 ? 'rgba(180,255,132,0.8)' : 'rgba(83,205,83,0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, sy - 3);
      ctx.quadraticCurveTo(x + lean * 0.4, sy - blade * 0.6, x + lean, sy - blade - 2);
      ctx.stroke();
    }

    for (let i = 0; i < 43; i += 1) {
      const x = 130 + rng() * (width - 260);
      const sy = surface[Math.floor(x)];
      if (sy > 830) continue;
      const hue = rng() > 0.5 ? '#ffe27a' : '#ff9fcb';
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.arc(x, sy - 7 - rng() * 6, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(x - 0.5, sy - 7.5, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Deterministic seed speckle so the island feels hand-painted, not tiled.
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 140; i += 1) {
      const x = (seed * 977 + i * 617) % width;
      const sy = surface[Math.floor(x)];
      ctx.fillStyle = i % 3 ? '#f1c17d' : '#251a2d';
      ctx.fillRect(x, sy + 3 + (i * 13) % 60, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  refreshAlpha() {
    const data = this.ctx.getImageData(0, 0, this.width, this.height).data;
    if (!this.alpha) this.alpha = new Uint8Array(this.width * this.height);
    for (let i = 0, p = 3; i < this.alpha.length; i += 1, p += 4) {
      this.alpha[i] = data[p] > 28 ? 1 : 0;
    }
  }

  updateAlpha(x0, y0, x1, y1) {
    const minX = clamp(Math.floor(x0), 0, this.width - 1);
    const minY = clamp(Math.floor(y0), 0, this.height - 1);
    const w = clamp(Math.ceil(x1 - x0), 1, this.width - minX);
    const h = clamp(Math.ceil(y1 - y0), 1, this.height - minY);
    if (!this.alpha) return this.refreshAlpha();
    const data = this.ctx.getImageData(minX, minY, w, h).data;
    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < w; col += 1) {
        const a = data[(row * w + col) * 4 + 3];
        this.alpha[(minY + row) * this.width + minX + col] = a > 28 ? 1 : 0;
      }
    }
  }

  solidAt(x, y) {
    if (!this.alpha || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.alpha[(y | 0) * this.width + (x | 0)] === 1;
  }

  /** First solid pixel in a column at or below fromY. */
  groundBelow(x, fromY = 0, maxY = this.height) {
    if (x < 0 || x >= this.width) return null;
    const col = x | 0;
    const start = clamp(Math.ceil(fromY), 0, this.height - 1);
    const end = clamp(Math.ceil(maxY), 0, this.height - 1);
    for (let y = start; y <= end; y += 2) {
      if (this.alpha[y * this.width + col]) return y;
    }
    return null;
  }

  surfaceY(x) {
    return this.groundBelow(x, 0, this.height) ?? this.height;
  }

  destroyCircle(cx, cy, radius, rng = Math.random) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const lobes = 9;
    for (let i = 0; i < lobes; i += 1) {
      const a = (i / lobes) * Math.PI * 2;
      const rr = radius * (0.72 + rng() * 0.24);
      const x = cx + Math.cos(a) * radius * 0.18;
      const y = cy + Math.sin(a) * radius * 0.18;
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();

    // A charred rim sells the heat without turning the hole into a solid ring.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const rim = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.18);
    rim.addColorStop(0, 'rgba(18,8,18,0)');
    rim.addColorStop(0.68, 'rgba(22,9,18,0.18)');
    rim.addColorStop(1, 'rgba(8,4,12,0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const pad = radius * 1.5 + 8;
    this.updateAlpha(cx - pad, cy - pad, cx + pad, cy + pad);
    this.scorch.push({ x: cx, y: cy, r: radius, life: 1 });
    if (this.scorch.length > 60) this.scorch.shift();
  }

  carveMelee(x, y, radius = 14) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.62, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.updateAlpha(x - radius - 2, y - radius - 2, x + radius + 2, y + radius + 2);
  }

  draw(ctx) {
    ctx.drawImage(this.canvas, 0, 0);
  }
}
