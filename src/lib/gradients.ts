import { Color, SRGBColorSpace } from 'three';
import type { GradientSettings } from './types';

/**
 * A paint that can be sampled at any point of the artwork (SVG user space).
 * Used both for gradients found in the SVG and for gradients built in the editor.
 */
export interface PaintServer {
  evaluate(x: number, y: number, out: Color): Color;
  /** Representative flat color (the gradient's midpoint). */
  average: Color;
}

// ───────────────────────────── color ramp ─────────────────────────────

interface RampStop {
  offset: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Multi-stop color ramp. Like SVG and CSS, colors are interpolated in sRGB,
 * then converted to the linear working space Three.js expects.
 */
export class Ramp {
  private readonly stops: RampStop[];

  constructor(stops: { offset: number; color: Color }[]) {
    const list = stops.length > 0 ? stops : [{ offset: 0, color: new Color(0x000000) }];
    this.stops = list
      .map((s) => {
        const rgb = { r: 0, g: 0, b: 0 };
        s.color.getRGB(rgb, SRGBColorSpace);
        return { offset: Math.min(1, Math.max(0, s.offset)), ...rgb };
      })
      .sort((a, b) => a.offset - b.offset);
  }

  sample(t: number, out: Color): Color {
    const s = this.stops;
    const first = s[0];
    const last = s[s.length - 1];
    if (t <= first.offset) return out.setRGB(first.r, first.g, first.b, SRGBColorSpace);
    if (t >= last.offset) return out.setRGB(last.r, last.g, last.b, SRGBColorSpace);
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].offset) {
        const a = s[i - 1];
        const b = s[i];
        const k = (t - a.offset) / (b.offset - a.offset || 1e-6);
        return out.setRGB(
          a.r + (b.r - a.r) * k,
          a.g + (b.g - a.g) * k,
          a.b + (b.b - a.b) * k,
          SRGBColorSpace,
        );
      }
    }
    return out.setRGB(last.r, last.g, last.b, SRGBColorSpace);
  }

  average(): Color {
    return this.sample(0.5, new Color());
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ─────────────────────── gradients built in the editor ───────────────────────

export function createUserPaint(
  g: GradientSettings,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): PaintServer {
  const ramp = new Ramp(g.stops.map((s) => ({ offset: s.offset, color: new Color(s.color) })));
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const average = ramp.average();

  if (g.type === 'radial') {
    const r = Math.hypot(w, h) / 2 || 1; // reaches the last stop at the corners
    return {
      average,
      evaluate: (x, y, out) => ramp.sample(clamp01(Math.hypot(x - cx, y - cy) / r), out),
    };
  }

  const angle = (g.angle * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const extent = Math.abs(w * dx) + Math.abs(h * dy) || 1;
  return {
    average,
    evaluate: (x, y, out) => {
      // Artwork space is y-down; the angle is measured y-up.
      const t = ((x - cx) * dx + -(y - cy) * dy) / extent + 0.5;
      return ramp.sample(clamp01(t), out);
    },
  };
}

// ───────────────────────── 2D affine matrices ─────────────────────────

/** [a, b, c, d, e, f] — the same layout as an SVG matrix(). */
export type Affine = [number, number, number, number, number, number];
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** Returns m1 ∘ m2 (m2 is applied first). */
function multiply(m1: Affine, m2: Affine): Affine {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function invert(m: Affine): Affine | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parse an SVG `transform` attribute list into one matrix. */
export function parseTransform(value: string | null): Affine {
  let m: Affine = IDENTITY;
  if (!value) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const n = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Affine = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (n.length === 6) t = n as Affine;
        break;
      case 'translate':
        t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale': {
        const sx = n[0] ?? 1;
        t = [sx, 0, 0, n[1] ?? sx, 0, 0];
        break;
      }
      case 'rotate': {
        const a = ((n[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const cx = n[1] ?? 0;
        const cy = n[2] ?? 0;
        t = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t.every(Number.isFinite)) m = multiply(m, t);
  }
  return m;
}

/** Combined transform of an element and all its ancestors (the root <svg> excluded). */
function cumulativeTransform(node: Element): Affine {
  let m: Affine = IDENTITY;
  for (let el: Element | null = node; el && el.parentElement; el = el.parentElement) {
    const t = el.getAttribute('transform');
    if (t) m = multiply(parseTransform(t), m);
  }
  return m;
}

// ───────────────────────── SVG gradient fills ─────────────────────────

const XLINK = 'http://www.w3.org/1999/xlink';

/** `url(#id)` → `id`. */
export function extractPaintId(fill: string): string | null {
  const m = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(fill);
  return m ? m[1] : null;
}

function findById(doc: Document, id: string): Element | null {
  try {
    return doc.querySelector(`[id="${id.replace(/["\\]/g, '\\$&')}"]`);
  } catch {
    return null;
  }
}

function hrefOf(el: Element): string | null {
  const v = el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href') ?? el.getAttribute('xlink:href');
  return v && v.startsWith('#') ? v.slice(1) : null;
}

/** A gradient plus every gradient it inherits from through href, nearest first. */
function gradientChain(doc: Document, el: Element): Element[] {
  const chain = [el];
  let cur = el;
  for (let i = 0; i < 8; i++) {
    const id = hrefOf(cur);
    const next = id ? findById(doc, id) : null;
    if (!next || chain.includes(next) || !/gradient$/i.test(next.localName)) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

function pick(chain: Element[], name: string): string | null {
  for (const el of chain) {
    const v = el.getAttribute(name);
    if (v !== null && v.trim() !== '') return v.trim();
  }
  return null;
}

function parseOffset(v: string | null): number {
  if (!v) return 0;
  const t = v.trim();
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return t.endsWith('%') ? n / 100 : n;
}

function stopColor(stop: Element): Color {
  let raw = stop.getAttribute('stop-color')?.trim() ?? '#000000';
  const style = stop.getAttribute('style');
  if (style) {
    const m = /(?:^|;)\s*stop-color\s*:\s*([^;]+)/.exec(style);
    if (m) raw = m[1].trim();
  }
  if (!raw || /^(currentcolor|inherit|none|transparent)$/i.test(raw)) raw = '#000000';
  return new Color().setStyle(raw);
}

function readStops(chain: Element[]): { offset: number; color: Color }[] {
  for (const el of chain) {
    const nodes = Array.from(el.children).filter((c) => c.localName === 'stop');
    if (nodes.length > 0) {
      let last = 0;
      return nodes.map((n) => {
        last = Math.min(1, Math.max(last, parseOffset(n.getAttribute('offset'))));
        return { offset: last, color: stopColor(n) };
      });
    }
  }
  return [];
}

function length(v: string | null, fallback: number, bbox: boolean, ref: number): number {
  if (v === null) return fallback;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  if (v.trim().endsWith('%')) return bbox ? n / 100 : (n / 100) * ref;
  return n;
}

function viewportSize(doc: Document): { w: number; h: number } {
  const root = doc.documentElement;
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
  const w = Number.parseFloat(root.getAttribute('width') ?? '');
  const h = Number.parseFloat(root.getAttribute('height') ?? '');
  return { w: w > 0 ? w : 100, h: h > 0 ? h : 100 };
}

function spread(t: number, method: string): number {
  if (method === 'reflect') {
    const m = ((t % 2) + 2) % 2;
    return m > 1 ? 2 - m : m;
  }
  if (method === 'repeat') return t - Math.floor(t);
  return clamp01(t);
}

/**
 * Turn an SVG `fill="url(#id)"` that points at a linear or radial gradient into
 * a {@link PaintServer}. Handles href inheritance, gradientUnits,
 * gradientTransform, spreadMethod and the element's own transforms.
 *
 * @param node   the painted element (for its cumulative transform)
 * @param points the path's outline points in final artwork space (for objectBoundingBox)
 * @returns null when the reference can't be resolved (e.g. a <pattern>)
 */
export function compileSvgPaint(
  fill: string,
  doc: Document,
  node: Element | undefined,
  points: { x: number; y: number }[],
): PaintServer | null {
  const id = extractPaintId(fill);
  const el = id ? findById(doc, id) : null;
  if (!el) return null;
  const kind =
    el.localName === 'linearGradient' ? 'linear' : el.localName === 'radialGradient' ? 'radial' : null;
  if (!kind) return null;

  const chain = gradientChain(doc, el);
  const stops = readStops(chain);
  if (stops.length === 0) return null;
  const ramp = new Ramp(stops);

  const bbox = (pick(chain, 'gradientUnits') ?? 'objectBoundingBox') !== 'userSpaceOnUse';
  const ctm = node ? cumulativeTransform(node) : IDENTITY;
  const invCtm = invert(ctm);
  if (!invCtm) return null;

  let space = parseTransform(pick(chain, 'gradientTransform'));
  if (bbox) {
    // objectBoundingBox: gradient space is the unit square over the element's local bounding box.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const [lx, ly] = apply(invCtm, p.x, p.y);
      if (lx < minX) minX = lx;
      if (ly < minY) minY = ly;
      if (lx > maxX) maxX = lx;
      if (ly > maxY) maxY = ly;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (!(w > 0) || !(h > 0)) return null;
    space = multiply([w, 0, 0, h, minX, minY], space);
  }
  const inv = invert(multiply(ctm, space));
  if (!inv) return null;

  const { w: vw, h: vh } = viewportSize(doc);
  const vr = Math.sqrt((vw * vw + vh * vh) / 2);
  const method = pick(chain, 'spreadMethod') ?? 'pad';
  const average = ramp.average();

  if (kind === 'linear') {
    const x1 = length(pick(chain, 'x1'), 0, bbox, vw);
    const y1 = length(pick(chain, 'y1'), 0, bbox, vh);
    const x2 = length(pick(chain, 'x2'), bbox ? 1 : vw, bbox, vw);
    const y2 = length(pick(chain, 'y2'), 0, bbox, vh);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    // Evaluated once per vertex, so the matrix is applied inline (no per-call allocation).
    return {
      average,
      evaluate: (x, y, out) => {
        const gx = inv[0] * x + inv[2] * y + inv[4];
        const gy = inv[1] * x + inv[3] * y + inv[5];
        const t = len2 > 0 ? ((gx - x1) * dx + (gy - y1) * dy) / len2 : 1;
        return ramp.sample(spread(t, method), out);
      },
    };
  }

  const cx = length(pick(chain, 'cx'), bbox ? 0.5 : vw / 2, bbox, vw);
  const cy = length(pick(chain, 'cy'), bbox ? 0.5 : vh / 2, bbox, vh);
  const r = length(pick(chain, 'r'), bbox ? 0.5 : vr / 2, bbox, vr);
  return {
    average,
    evaluate: (x, y, out) => {
      const gx = inv[0] * x + inv[2] * y + inv[4];
      const gy = inv[1] * x + inv[3] * y + inv[5];
      const t = r > 0 ? Math.hypot(gx - cx, gy - cy) / r : 1;
      return ramp.sample(spread(t, method), out);
    },
  };
}
