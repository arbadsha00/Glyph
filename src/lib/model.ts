import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PaintServer } from './gradients';
import type { ParsedSvg } from './types';

/** The artwork's longest side is normalised to this many scene units. */
export const MODEL_SIZE = 10;

/** Smooth curved walls but keep hard edges where caps meet sides. */
const CREASE_ANGLE = (35 * Math.PI) / 180;

export interface BuiltModel {
  root: Group;
  meshes: Mesh[];
  triangles: number;
}

/**
 * FR-2.2 / FR-2.3 / FR-2.5 — extrude every parsed path into its own mesh.
 *
 * @param depthPct percentage of the artwork's longest side (e.g. 14)
 * @param bevelPct 0–100; 100 is a bevel of 3 % of the longest side
 */
export function buildModel(parsed: ParsedSvg, depthPct: number, bevelPct: number): BuiltModel {
  const { maxDim, bounds } = parsed;
  const depth = (depthPct / 100) * maxDim;
  const bevel = (bevelPct / 100) * 0.03 * maxDim;

  const inner = new Group();
  const meshes: Mesh[] = [];
  let triangles = 0;

  // Later paths sit a hair in front of earlier ones so overlapping coplanar
  // faces (typical in logos) don't z-fight. Total stack is capped at 2 %.
  const layerStep = Math.min(maxDim * 0.0006, (maxDim * 0.02) / parsed.paths.length);

  parsed.paths.forEach((path, i) => {
    const raw = new ExtrudeGeometry(path.shapes, {
      depth,
      steps: 1,
      curveSegments: 12,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      // Shrink the caps instead of growing the silhouette, so beveling never
      // makes neighbouring shapes collide.
      bevelOffset: -bevel,
      bevelSegments: 4,
    });
    const geometry = toCreasedNormals(raw, CREASE_ANGLE);
    // UVs are generated lazily, only when a texture is applied (see GlyphScene).
    geometry.deleteAttribute('uv');

    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: path.color }));
    mesh.position.z = i * layerStep;
    mesh.userData = { color: path.color, opacity: path.opacity, paint: path.paint ?? null };

    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    inner.add(mesh);
    meshes.push(mesh);
  });

  // SVG space is y-down; flip into y-up and centre the model on the origin.
  const s = MODEL_SIZE / maxDim;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  inner.scale.set(s, -s, s);
  inner.position.set(-cx * s, cy * s, -(depth / 2) * s);

  const root = new Group();
  root.add(inner);
  return { root, meshes, triangles };
}

/** Free the GPU buffers of every mesh under `root`. Materials are owned by the scene. */
export function disposeModel(root: Group): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) obj.geometry.dispose();
  });
}

/**
 * Planar "front projection" UVs: the artwork's longest side spans 0–1, centred.
 * `aspect` (image width / height) is baked in so rotating and scaling a texture
 * in the editor stays rigid and undistorted.
 */
export function setPlanarUV(
  geometry: BufferGeometry,
  bounds: ParsedSvg['bounds'],
  maxDim: number,
  aspect: number,
): void {
  const pos = geometry.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const su = aspect >= 1 ? 1 / aspect : 1;
  const sv = aspect >= 1 ? 1 : aspect;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = ((pos.getX(i) - cx) / maxDim) * su + 0.5;
    uv[i * 2 + 1] = (-(pos.getY(i) - cy) / maxDim) * sv + 0.5; // SVG y is down, texture v is up
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}

/**
 * Bake a paint (SVG gradient or editor gradient) into per-vertex colors.
 * Reuses the existing color buffer when possible, so dragging a gradient
 * slider doesn't reallocate GPU memory on every tick.
 */
export function applyPaint(geometry: BufferGeometry, paint: PaintServer): void {
  const pos = geometry.getAttribute('position');
  const existing = geometry.getAttribute('color');
  const reuse = existing instanceof BufferAttribute && existing.count === pos.count;
  const attribute = reuse ? existing : new BufferAttribute(new Float32Array(pos.count * 3), 3);
  const colors = attribute.array as Float32Array;

  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    paint.evaluate(pos.getX(i), pos.getY(i), tmp);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  if (reuse) attribute.needsUpdate = true;
  else geometry.setAttribute('color', attribute);
}
