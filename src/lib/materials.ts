import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Texture } from 'three';
import type { MaterialCustomization, MaterialPreset } from './types';

export interface MaterialOptions {
  color: Color;
  opacity: number;
  /** When true the color comes from the geometry's `color` attribute (gradients). */
  vertexColors?: boolean;
  /** Optional color texture, multiplied with `color`. */
  map?: Texture | null;
  /** Optional PBR customization overrides. Applied after the preset base. */
  customization?: MaterialCustomization;
}

/**
 * Get the base PBR values for each preset.
 * Used to seed the customization sliders when switching presets.
 */
export function getPresetValues(preset: MaterialPreset): MaterialCustomization {
  switch (preset) {
    case 'matte':
      return {
        roughness: 0.88,
        metalness: 0,
        clearcoat: 0,
        clearcoatRoughness: 0.1,
        transmission: 0,
        opacity: 1,
        ior: 1.5,
        reflectivity: 0.5,
      };
    case 'glossy':
      return {
        roughness: 0.2,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        transmission: 0,
        opacity: 1,
        ior: 1.5,
        reflectivity: 0.5,
      };
    case 'metallic':
      return {
        roughness: 0.28,
        metalness: 1,
        clearcoat: 0,
        clearcoatRoughness: 0.1,
        transmission: 0,
        opacity: 1,
        ior: 1.5,
        reflectivity: 0.8,
      };
    case 'glass':
      return {
        roughness: 0.05,
        metalness: 0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.05,
        transmission: 1,
        opacity: 1,
        ior: 1.5,
        reflectivity: 1,
      };
    case 'custom':
    default:
      return {
        roughness: 0.28,
        metalness: 1,
        clearcoat: 0,
        clearcoatRoughness: 0.1,
        transmission: 0,
        opacity: 1,
        ior: 1.5,
        reflectivity: 0.8,
      };
  }
}

/** FR-3.4 — matte, glossy, metallic, glass, and custom presets with PBR customization. */
export function createMaterial(
  preset: MaterialPreset,
  { color, opacity, vertexColors = false, map = null, customization }: MaterialOptions,
): MeshStandardMaterial {
  // Vertex colors and textures carry their own colors; keep the base neutral.
  const base = vertexColors || map ? new Color(0xffffff) : color.clone();
  const material = make(preset, base, customization);
  material.vertexColors = vertexColors;
  if (map) material.map = map;

  // Apply opacity from path-level SVG opacity (separate from transmission/customization opacity)
  if (opacity < 0.999 && preset !== 'glass' && (!customization || customization.transmission < 0.01)) {
    material.transparent = true;
    material.opacity = opacity;
  }
  return material;
}

function make(
  preset: MaterialPreset,
  base: Color,
  customization?: MaterialCustomization,
): MeshStandardMaterial {
  // If we have custom preset or customization overrides, use MeshPhysicalMaterial for full PBR
  if (preset === 'custom' || customization) {
    const c = customization ?? getPresetValues(preset);
    const mat = new MeshPhysicalMaterial({
      color: c.transmission > 0.5 ? base.clone().lerp(new Color(0xffffff), 0.5) : base,
      roughness: c.roughness,
      metalness: c.metalness,
      clearcoat: c.clearcoat,
      clearcoatRoughness: c.clearcoatRoughness,
      specularIntensity: c.reflectivity,
      envMapIntensity: 1.0,
    });

    if (c.transmission > 0.01) {
      mat.transmission = c.transmission;
      mat.thickness = 1.2;
      mat.ior = c.ior;
      mat.transparent = true;
      mat.attenuationColor = base.clone();
      mat.attenuationDistance = 4;
    }

    if (c.opacity < 0.999 && c.transmission < 0.01) {
      mat.transparent = true;
      mat.opacity = c.opacity;
    }

    return mat;
  }

  // Standard presets (no customization overrides active)
  switch (preset) {
    case 'matte':
      return new MeshStandardMaterial({ color: base, roughness: 0.88, metalness: 0 });
    case 'glossy':
      return new MeshPhysicalMaterial({
        color: base,
        roughness: 0.2,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
      });
    case 'metallic':
      return new MeshStandardMaterial({ color: base, roughness: 0.28, metalness: 1 });
    case 'glass':
      return new MeshPhysicalMaterial({
        color: base.clone().lerp(new Color(0xffffff), 0.5),
        roughness: 0.05,
        metalness: 0,
        transmission: 1,
        thickness: 1.2,
        ior: 1.5,
        attenuationColor: base.clone(),
        attenuationDistance: 4,
        specularIntensity: 1,
        clearcoat: 0.6,
        clearcoatRoughness: 0.05,
      });
    default:
      return new MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0 });
  }
}
