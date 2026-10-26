import type { PatternId } from './types';

/*
 * Procedural 2D patterns. This module deliberately has no three.js imports so
 * the UI can draw pattern thumbnails without pulling the 3D engine into the
 * first page load.
 */

const SIZE = 512;

// ─────────────── tileable value noise (for marble / wood / grain) ───────────────

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth value noise on a lattice that wraps every `px` × `py` cells, so textures tile seamlessly. */
function vnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % px) + px) % px;
  const ya = ((y0 % py) + py) % py;
  const xb = (xa + 1) % px;
  const yb = (ya + 1) % py;
  return lerp(
    lerp(hash(xa, ya, seed), hash(xb, ya, seed), sx),
    lerp(hash(xa, yb, seed), hash(xb, yb, seed), sx),
    sy,
  );
}

function fbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * p, v * p, p, p, seed + o);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type ValuePattern = 'grain' | 'marble' | 'wood';
const VALUE_PATTERNS: ReadonlySet<PatternId> = new Set<PatternId>(['grain', 'marble', 'wood']);

const valueCache = new Map<string, Float32Array>();

/** Grayscale 0–1 field for the noise-based patterns, cached per pattern and size. */
function patternValues(id: ValuePattern, size: number): Float32Array {
  const key = `${id}:${size}`;
  const cached = valueCache.get(key);
  if (cached) return cached;

  const values = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      let value: number;
      if (id === 'grain') {
        value = 0.65 * hash(px, py, 7) + 0.35 * fbm(u, v, 32, 3, 3);
      } else if (id === 'marble') {
        const n = fbm(u, v, 4, 5, 11);
        const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v + n * 2.2) * Math.PI)), 8);
        value = clamp01(vein * 0.9 + n * 0.25);
      } else {
        const n = fbm(u, v, 3, 5, 23);
        const ring = Math.sin((v * 10 + n * 4) * 2 * Math.PI) * 0.5 + 0.5;
        const streak = vnoise(u * 3, v * 60, 3, 60, 31);
        value = clamp01(ring * 0.65 + streak * 0.35);
      }
      values[py * size + px] = value;
    }
  }
  valueCache.set(key, values);
  return values;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draw a built-in pattern. `colorA` is the base, `colorB` the accent. Every pattern tiles seamlessly. */
export function renderPatternCanvas(
  id: PatternId,
  colorA: string,
  colorB: string,
  size = SIZE,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (VALUE_PATTERNS.has(id)) {
    const values = patternValues(id as ValuePattern, size);
    const [ar, ag, ab] = hexToRgb(colorA);
    const [br, bg, bb] = hexToRgb(colorB);
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      image.data[i * 4] = ar + (br - ar) * v;
      image.data[i * 4 + 1] = ag + (bg - ag) * v;
      image.data[i * 4 + 2] = ab + (bb - ab) * v;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colorB;

  const cells = 8;
  const cell = size / cells;

  switch (id) {
    case 'checker':
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          if ((x + y) % 2 === 1) ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      break;
    case 'stripes': {
      const band = size / 16;
      for (let i = 1; i < 16; i += 2) ctx.fillRect(i * band, 0, band, size);
      break;
    }
    case 'dots':
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          ctx.beginPath();
          ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'grid': {
      const line = Math.max(1, size / 80);
      for (let k = 0; k <= cells; k++) {
        ctx.fillRect(k * cell - line / 2, 0, line, size);
        ctx.fillRect(0, k * cell - line / 2, size, line);
      }
      break;
    }
  }
  return canvas;
}

export function patternDataUrl(id: PatternId, colorA: string, colorB: string, size = 72): string {
  return renderPatternCanvas(id, colorA, colorB, size).toDataURL();
}
