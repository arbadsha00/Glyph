import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { renderPatternCanvas } from './patterns';
import type { PatternId } from './types';

function finish(canvas: HTMLCanvasElement, aspect: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.userData.aspect = aspect;
  return texture;
}

export function createPatternTexture(id: PatternId, colorA: string, colorB: string): CanvasTexture {
  return finish(renderPatternCanvas(id, colorA, colorB), 1);
}

/** Longest side of a user image after downscaling, to keep GPU memory in check. */
const IMAGE_MAX_SIDE = 2048;

/** Load a user-supplied image (object URL) as a texture. Rejects if it can't be decoded. */
export async function loadImageTexture(url: string): Promise<CanvasTexture> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();

  const natural = Math.max(img.naturalWidth, img.naturalHeight);
  if (!natural) throw new Error('Image has no size');
  const k = Math.min(1, IMAGE_MAX_SIDE / natural);
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return finish(canvas, w / h);
}
