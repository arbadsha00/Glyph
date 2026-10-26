import type { Color, Shape } from 'three';
import type { PaintServer } from './gradients';

export type ColorMode = 'original' | 'solid' | 'gradient' | 'texture';
export type MaterialPreset = 'matte' | 'glossy' | 'metallic' | 'glass' | 'custom';
export type LightingPreset = 'studio' | 'soft' | 'dramatic';

export type GradientType = 'linear' | 'radial';

export interface GradientStop {
  color: string;
  /** 0–1 along the gradient. */
  offset: number;
}

export interface GradientSettings {
  type: GradientType;
  /** Two to five stops. */
  stops: GradientStop[];
  /** Degrees, linear only. 0 = left → right, 90 = bottom → top. */
  angle: number;
}

export type PatternId = 'checker' | 'stripes' | 'dots' | 'grid' | 'grain' | 'marble' | 'wood';
export type TextureSource = 'pattern' | 'image';

export interface TextureSettings {
  source: TextureSource;
  pattern: PatternId;
  /** Built-in patterns are drawn with these two colors. */
  colorA: string;
  colorB: string;
  /** Object URL of a user-supplied image. */
  imageUrl: string | null;
  imageName: string | null;
  /** Tiles across the artwork's longest side. */
  repeat: number;
  /** Degrees. */
  rotation: number;
  offsetX: number;
  offsetY: number;
}

export type EnvironmentId =
  | 'studio'
  | 'park'
  | 'sunset'
  | 'night'
  | 'cyberpunk'
  | 'venice'
  | 'royal'
  | 'bridge'
  | 'sunrise'
  | 'custom';

export interface EnvironmentSettings {
  id: EnvironmentId;
  /** Multiplier for environment lighting and reflections (0–3, default 1). */
  intensity: number;
  /** Degrees rotation around the Y-axis (0–360). */
  rotation: number;
  /** When true, renders the 360° HDR panorama as the viewport background. */
  showBackground: boolean;
  /** Blur applied to the background panorama (0–1). */
  backgroundBlur: number;
  /** Brightness multiplier for the background panorama (0–3). */
  backgroundIntensity: number;
  /** Object URL of a user-supplied HDR or equirectangular image. */
  customUrl: string | null;
  customName: string | null;
}

export type ExportFormat = 'png' | 'video' | 'gltf';
export type VideoFps = 30 | 60;
export type VideoDuration = 4 | 6 | 8;
export type GltfFormat = 'glb' | 'gltf';

export interface ExportSettings {
  format: ExportFormat;
  pngScale: 1 | 2;
  /** Keep HDR reflections and lighting on 3D object while removing background. */
  pngTransparent: boolean;
  videoFps: VideoFps;
  videoDuration: VideoDuration;
  videoTransparent: boolean;
  gltfFormat: GltfFormat;
}

/** Fine-grained PBR material properties exposed to the user. */
export interface MaterialCustomization {
  /** Surface roughness: 0 = mirror-smooth, 1 = fully diffuse. */
  roughness: number;
  /** How metallic the surface looks: 0 = dielectric, 1 = metal. */
  metalness: number;
  /** Clearcoat layer intensity (0–1). Adds a thin glossy film over the base. */
  clearcoat: number;
  /** Roughness of the clearcoat layer (0–1). */
  clearcoatRoughness: number;
  /** Transmission (transparency): 0 = opaque, 1 = fully see-through glass. */
  transmission: number;
  /** Overall surface opacity (0–1). Independent of transmission. */
  opacity: number;
  /** Index of refraction for glass-like surfaces (1.0–2.5, default 1.5). */
  ior: number;
  /** Specular/reflectance intensity (0–2). */
  reflectivity: number;
}

export interface GlyphSettings {
  colorMode: ColorMode;
  solidColor: string;
  gradient: GradientSettings;
  texture: TextureSettings;
  material: MaterialPreset;
  /** Custom overrides applied when material is 'custom', or as tweaks on presets. */
  materialCustomization: MaterialCustomization;
  lighting: LightingPreset;
  environment: EnvironmentSettings;
  export: ExportSettings;
  /** Extrusion depth as a percentage of the artwork's longest side. */
  depth: number;
  /** Bevel amount, 0–100. 0 disables the bevel. */
  bevel: number;
  background: string;
  transparentBackground: boolean;
}

/** Default viewport backgrounds that follow the UI theme until the user picks their own. */
export const DEFAULT_BACKGROUNDS = { dark: '#18181b', light: '#f4f4f5' } as const;

export const DEFAULT_TEXTURE: TextureSettings = {
  source: 'pattern',
  pattern: 'checker',
  colorA: '#f4f4f5',
  colorB: '#27272a',
  imageUrl: null,
  imageName: null,
  repeat: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
};

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  id: 'studio',
  intensity: 1,
  rotation: 0,
  showBackground: false,
  backgroundBlur: 0.15,
  backgroundIntensity: 1,
  customUrl: null,
  customName: null,
};

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'png',
  pngScale: 1,
  pngTransparent: true,
  videoFps: 30,
  videoDuration: 6,
  videoTransparent: false,
  gltfFormat: 'glb',
};

export const DEFAULT_MATERIAL_CUSTOMIZATION: MaterialCustomization = {
  roughness: 0.28,
  metalness: 1.0,
  clearcoat: 0.0,
  clearcoatRoughness: 0.1,
  transmission: 0.0,
  opacity: 1.0,
  ior: 1.5,
  reflectivity: 0.8,
};

export const DEFAULT_SETTINGS: GlyphSettings = {
  colorMode: 'original',
  solidColor: '#6366f1',
  gradient: {
    type: 'linear',
    stops: [
      { color: '#6366f1', offset: 0 },
      { color: '#ec4899', offset: 1 },
    ],
    angle: 45,
  },
  texture: DEFAULT_TEXTURE,
  material: 'metallic',
  materialCustomization: { ...DEFAULT_MATERIAL_CUSTOMIZATION },
  lighting: 'studio',
  environment: DEFAULT_ENVIRONMENT,
  export: DEFAULT_EXPORT,
  depth: 14,
  bevel: 35,
  background: DEFAULT_BACKGROUNDS.dark,
  transparentBackground: false,
};

/** One SVG path converted to shapes (outer contours + holes) with its fill. */
export interface ParsedPath {
  shapes: Shape[];
  /** Flat color, or the average color of the gradient when `paint` is set. */
  color: Color;
  opacity: number;
  /** The path's own SVG gradient fill, when it has one we can render. */
  paint?: PaintServer;
}

export interface ParsedSvg {
  name: string;
  paths: ParsedPath[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  width: number;
  height: number;
  maxDim: number;
  /** Paths ignored because they have no fill (e.g. stroke-only). */
  skippedPaths: number;
  /** Paths filled with an SVG gradient that Glyph renders directly. */
  gradientCount: number;
  /** Paths whose fill is a paint Glyph can't render (e.g. <pattern>); drawn in neutral gray. */
  unsupportedPaints: number;
  parseMs: number;
}

/** An error whose message is safe and useful to show directly to the user. */
export class GlyphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GlyphError';
  }
}
