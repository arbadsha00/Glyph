import { Color } from 'three';
import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';
import { compileSvgPaint, type PaintServer } from './gradients';
import { GlyphError, type ParsedPath, type ParsedSvg } from './types';

/** Used for paints Glyph can't render (e.g. <pattern>). */
const FALLBACK_FILL = '#9aa0b8';

/**
 * FR-1.3 — parse the text as XML and make sure it is an SVG.
 * The document is only parsed, never inserted into the page, so scripts inside
 * an uploaded SVG can't run.
 */
export function parseSvgDocument(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new GlyphError(
      'This file is not well-formed SVG (XML parse error). Re-export it from your design tool and try again.',
    );
  }
  if (doc.documentElement.localName.toLowerCase() !== 'svg') {
    throw new GlyphError('The file does not contain an <svg> root element.');
  }
  return doc;
}

/**
 * FR-2.1 / FR-2.5 — parse SVG markup into one entry per painted path, keeping
 * each path's fill (flat color or gradient) so it can become its own mesh.
 */
export function parseSvg(text: string, name = 'artwork.svg'): ParsedSvg {
  const t0 = performance.now();
  const doc = parseSvgDocument(text);

  let data: SVGResult;
  try {
    data = new SVGLoader().parse(text);
  } catch {
    throw new GlyphError('Glyph could not read the geometry in this SVG.');
  }

  const paths: ParsedPath[] = [];
  let skipped = 0;
  let gradientCount = 0;
  let unsupportedPaints = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as Record<string, unknown>;
    const fill = typeof style.fill === 'string' ? style.fill : undefined;

    if (fill === 'none') {
      skipped++;
      continue;
    }

    let shapes;
    try {
      shapes = SVGLoader.createShapes(path);
    } catch {
      skipped++;
      continue;
    }
    if (shapes.length === 0) {
      skipped++;
      continue;
    }

    const points = shapes.flatMap((shape) => shape.getPoints(6));
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    let color: Color;
    let paint: PaintServer | undefined;
    if (fill?.startsWith('url(')) {
      const node = path.userData?.node as Element | undefined;
      const compiled = compileSvgPaint(fill, doc, node, points);
      if (compiled) {
        paint = compiled;
        color = compiled.average.clone();
        gradientCount++;
      } else {
        color = new Color(FALLBACK_FILL);
        unsupportedPaints++;
      }
    } else {
      color = path.color.clone();
    }

    const opacity = clamp01(num(style.fillOpacity, 1) * num(style.opacity, 1));
    paths.push({ shapes, color, opacity, paint });
  }

  if (paths.length === 0) {
    throw new GlyphError(
      skipped > 0
        ? 'This SVG only contains strokes or unfilled shapes. Convert strokes to outlines in your design tool (e.g. Illustrator: Object → Path → Outline Stroke) and export again.'
        : 'No drawable shapes were found in this SVG.',
    );
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);
  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    throw new GlyphError('The shapes in this SVG have no measurable size.');
  }

  return {
    name,
    paths,
    bounds: { minX, minY, maxX, maxY },
    width,
    height,
    maxDim,
    skippedPaths: skipped,
    gradientCount,
    unsupportedPaints,
    parseMs: performance.now() - t0,
  };
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
