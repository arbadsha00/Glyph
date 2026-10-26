import type { GradientSettings, PatternId } from './types';

/** Built-in solid colors (Tailwind-ish palette). */
export const SOLID_SWATCHES = [
  '#18181b',
  '#71717a',
  '#fafafa',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
] as const;

const stops = (...colors: string[]) =>
  colors.map((color, i) => ({ color, offset: colors.length === 1 ? 0 : i / (colors.length - 1) }));

/** Built-in gradients. */
export const GRADIENT_PRESETS: { name: string; gradient: GradientSettings }[] = [
  { name: 'Sunset', gradient: { type: 'linear', angle: 45, stops: stops('#f97316', '#ec4899', '#8b5cf6') } },
  { name: 'Ocean', gradient: { type: 'linear', angle: 60, stops: stops('#06b6d4', '#3b82f6', '#6366f1') } },
  { name: 'Aurora', gradient: { type: 'linear', angle: 60, stops: stops('#10b981', '#06b6d4', '#8b5cf6') } },
  { name: 'Candy', gradient: { type: 'linear', angle: 30, stops: stops('#f472b6', '#c084fc') } },
  { name: 'Gold', gradient: { type: 'linear', angle: 70, stops: stops('#fde68a', '#f59e0b', '#b45309') } },
  { name: 'Mint', gradient: { type: 'linear', angle: 45, stops: stops('#a7f3d0', '#3b82f6') } },
  { name: 'Midnight', gradient: { type: 'linear', angle: 90, stops: stops('#0f172a', '#4338ca', '#a78bfa') } },
  { name: 'Ember', gradient: { type: 'radial', angle: 0, stops: stops('#fbbf24', '#ef4444', '#7f1d1d') } },
];

/** Built-in textures with the palette they start with. */
export const PATTERNS: { id: PatternId; label: string; colorA: string; colorB: string }[] = [
  { id: 'checker', label: 'Checker', colorA: '#f4f4f5', colorB: '#27272a' },
  { id: 'stripes', label: 'Stripes', colorA: '#fafafa', colorB: '#6366f1' },
  { id: 'dots', label: 'Dots', colorA: '#fef3c7', colorB: '#f59e0b' },
  { id: 'grid', label: 'Grid', colorA: '#0f172a', colorB: '#38bdf8' },
  { id: 'grain', label: 'Grain', colorA: '#3f3f46', colorB: '#d4d4d8' },
  { id: 'marble', label: 'Marble', colorA: '#f5f5f4', colorB: '#57534e' },
  { id: 'wood', label: 'Wood', colorA: '#e8c99b', colorB: '#8b5a2b' },
];

/** CSS equivalent of a gradient, for previews. */
export function gradientCss(g: GradientSettings): string {
  const list = [...g.stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(', ');
  return g.type === 'radial'
    ? `radial-gradient(circle at center, ${list})`
    : `linear-gradient(${90 - g.angle}deg, ${list})`;
}

/** Blend two #rrggbb colors. */
export function mixHex(a: string, b: string, t = 0.5): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (i: number) =>
    Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

/** Accepts #rgb or #rrggbb (with or without #); returns lower-case #rrggbb or null. */
export function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${hex.toLowerCase()}`;
}
