import { useMemo, useRef, useState } from 'react';
import { MAX_IMAGE_BYTES } from '../lib/constants';
import { patternDataUrl } from '../lib/patterns';
import { GRADIENT_PRESETS, gradientCss, mixHex, PATTERNS, SOLID_SWATCHES } from '../lib/presets';
import type {
  ColorMode,
  GlyphSettings,
  GradientSettings,
  GradientStop,
  ParsedSvg,
  PatternId,
  TextureSettings,
} from '../lib/types';
import { ImageIcon, PlusIcon, ResetIcon, TrashIcon, UploadIcon } from './icons';
import {
  Button,
  ColorInput,
  Field,
  Segmented,
  Slider,
  Swatches,
  Tile,
  cn,
} from './ui';

const MODES: { value: ColorMode; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'solid', label: 'Solid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'texture', label: 'Texture' },
];

const MAX_STOPS = 5;
const MIN_STOPS = 2;

interface Props {
  settings: GlyphSettings;
  onChange: (patch: Partial<GlyphSettings>) => void;
  model: ParsedSvg | null;
  onError: (message: string) => void;
}

/** The "Fill" section: pick a mode, then edit it with built-ins or custom values. */
export default function FillEditor({ settings, onChange, model, onError }: Props) {
  return (
    <div className="space-y-4">
      <Segmented
        label="Fill mode"
        options={MODES}
        value={settings.colorMode}
        onChange={(colorMode) => onChange({ colorMode })}
      />

      {settings.colorMode === 'original' && <OriginalInfo model={model} />}
      {settings.colorMode === 'solid' && (
        <SolidEditor
          value={settings.solidColor}
          onChange={(solidColor) => onChange({ solidColor, colorMode: 'solid' })}
        />
      )}
      {settings.colorMode === 'gradient' && (
        <GradientEditor
          gradient={settings.gradient}
          onChange={(gradient) => onChange({ gradient })}
        />
      )}
      {settings.colorMode === 'texture' && (
        <TextureEditor
          texture={settings.texture}
          onChange={(texture) => onChange({ texture })}
          onError={onError}
        />
      )}
    </div>
  );
}

// ───────────────────────────────── Original ─────────────────────────────────

function OriginalInfo({ model }: { model: ParsedSvg | null }) {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
      <p>Each path keeps the fill from your SVG.</p>
      {model && model.gradientCount > 0 && (
        <p className="text-foreground">
          {model.gradientCount} {model.gradientCount === 1 ? 'path uses' : 'paths use'} an SVG gradient —
          rendered as-is.
        </p>
      )}
      {model && model.unsupportedPaints > 0 && (
        <p className="rounded-md bg-warning-bg px-2.5 py-2 text-warning">
          {model.unsupportedPaints} {model.unsupportedPaints === 1 ? 'path uses' : 'paths use'} a pattern
          fill Glyph can't render, so {model.unsupportedPaints === 1 ? 'it is' : 'they are'} shown in
          gray. Use Solid, Gradient or Texture to restyle.
        </p>
      )}
    </div>
  );
}

// ───────────────────────────────────── Solid ─────────────────────────────────────

function SolidEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Presets">
        <Swatches colors={SOLID_SWATCHES} value={value} onChange={onChange} />
      </Field>
      <Field label="Custom color">
        <ColorInput label="Solid" value={value} onChange={onChange} />
      </Field>
    </div>
  );
}

// ─────────────────────────────────── Gradient ───────────────────────────────────

const TYPES: { value: GradientSettings['type']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
];

function GradientEditor({
  gradient,
  onChange,
}: {
  gradient: GradientSettings;
  onChange: (g: GradientSettings) => void;
}) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, gradient.stops.length - 1);
  const stop = gradient.stops[index];

  const patchStop = (i: number, patch: Partial<GradientStop>) =>
    onChange({
      ...gradient,
      stops: gradient.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)),
    });

  const addStop = () => {
    if (gradient.stops.length >= MAX_STOPS) return;
    const sorted = [...gradient.stops].sort((a, b) => a.offset - b.offset);
    // Insert in the widest gap, colored as the blend of its neighbours.
    let at = 0;
    let gap = -1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1].offset - sorted[i].offset;
      if (g > gap) {
        gap = g;
        at = i;
      }
    }
    const a = sorted[at];
    const b = sorted[at + 1];
    const added: GradientStop = { offset: (a.offset + b.offset) / 2, color: mixHex(a.color, b.color) };
    const stops = [...gradient.stops, added];
    onChange({ ...gradient, stops });
    setSelected(stops.length - 1);
  };

  const removeStop = () => {
    if (gradient.stops.length <= MIN_STOPS) return;
    onChange({ ...gradient, stops: gradient.stops.filter((_, i) => i !== index) });
    setSelected(0);
  };

  const reverse = () =>
    onChange({
      ...gradient,
      stops: gradient.stops.map((s) => ({ ...s, offset: Math.round((1 - s.offset) * 1000) / 1000 })),
    });

  return (
    <div className="space-y-4">
      <Field label="Presets">
        <div className="grid grid-cols-4 gap-1">
          {GRADIENT_PRESETS.map((preset) => (
            <Tile
              key={preset.name}
              label={preset.name}
              background={gradientCss(preset.gradient)}
              active={JSON.stringify(preset.gradient) === JSON.stringify(gradient)}
              onClick={() => {
                onChange(preset.gradient);
                setSelected(0);
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="Customize">
        <div className="space-y-3 rounded-lg border p-3">
          <Segmented
            label="Gradient type"
            options={TYPES}
            value={gradient.type}
            onChange={(type) => onChange({ ...gradient, type })}
          />

          {/* Preview with stop handles */}
          <div className="pt-1">
            <div
              className="h-7 rounded-md border border-black/10 dark:border-white/10"
              // The strip always previews the color ramp left → right, whatever the gradient type.
              style={{ background: gradientCss({ ...gradient, type: 'linear', angle: 0 }) }}
              aria-hidden="true"
            />
            <div className="relative mx-3 mt-2 h-6 md:mx-2.5 md:h-5">
              {gradient.stops.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Select color stop ${i + 1}`}
                  aria-pressed={i === index}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'absolute top-0 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-background shadow ring-1 ring-black/20 transition-transform md:h-5 md:w-5 dark:ring-white/30',
                    i === index && 'z-10 scale-125 ring-2 ring-ring',
                  )}
                  style={{ left: `${s.offset * 100}%`, background: s.color }}
                />
              ))}
            </div>
          </div>

          <Field label={`Stop ${index + 1} color`}>
            <ColorInput
              label={`Stop ${index + 1}`}
              value={stop.color}
              onChange={(color) => patchStop(index, { color })}
            />
          </Field>
          <Slider
            label="Position"
            value={Math.round(stop.offset * 100)}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => patchStop(index, { offset: v / 100 })}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={addStop}
              disabled={gradient.stops.length >= MAX_STOPS}
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add stop
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={removeStop}
              disabled={gradient.stops.length <= MIN_STOPS}
            >
              <TrashIcon className="h-3.5 w-3.5" /> Remove
            </Button>
            <Button variant="outline" size="sm" onClick={reverse} aria-label="Reverse gradient" title="Reverse">
              <ResetIcon className="h-3.5 w-3.5" />
            </Button>
          </div>

          {gradient.type === 'linear' && (
            <Slider
              label="Angle"
              value={gradient.angle}
              min={0}
              max={360}
              step={5}
              unit="°"
              onChange={(angle) => onChange({ ...gradient, angle })}
            />
          )}
        </div>
      </Field>
    </div>
  );
}

// ─────────────────────────────────── Texture ───────────────────────────────────

const SOURCES: { value: TextureSettings['source']; label: string }[] = [
  { value: 'pattern', label: 'Built-in' },
  { value: 'image', label: 'My image' },
];

function TextureEditor({
  texture,
  onChange,
  onError,
}: {
  texture: TextureSettings;
  onChange: (t: TextureSettings) => void;
  onError: (message: string) => void;
}) {
  const patch = (p: Partial<TextureSettings>) => onChange({ ...texture, ...p });
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(texture.imageUrl);
  urlRef.current = texture.imageUrl;

  // Thumbnails are drawn once, with each pattern's own default palette.
  const thumbs = useMemo(() => PATTERNS.map((p) => patternDataUrl(p.id, p.colorA, p.colorB)), []);

  const pickPattern = (id: PatternId) => {
    const preset = PATTERNS.find((p) => p.id === id);
    if (preset) patch({ source: 'pattern', pattern: id, colorA: preset.colorA, colorB: preset.colorB });
  };

  const loadImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      onError('Choose a PNG, JPG, WebP or GIF image for the texture.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onError(`That image is ${(file.size / 1048576).toFixed(1)} MB. Texture images can be up to 15 MB.`);
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    patch({ source: 'image', imageUrl: URL.createObjectURL(file), imageName: file.name });
  };

  const clearImage = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    patch({ imageUrl: null, imageName: null });
  };

  return (
    <div className="space-y-4">
      <Segmented
        label="Texture source"
        options={SOURCES}
        value={texture.source}
        onChange={(source) => patch({ source })}
      />

      {texture.source === 'pattern' ? (
        <>
          <Field label="Patterns">
            <div className="grid grid-cols-4 gap-1">
              {PATTERNS.map((p, i) => (
                <Tile
                  key={p.id}
                  label={p.label}
                  background={`url(${thumbs[i]}) center / cover`}
                  active={texture.pattern === p.id}
                  onClick={() => pickPattern(p.id)}
                />
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base color">
              <ColorInput label="Base" value={texture.colorA} onChange={(colorA) => patch({ colorA })} />
            </Field>
            <Field label="Accent color">
              <ColorInput label="Accent" value={texture.colorB} onChange={(colorB) => patch({ colorB })} />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Image">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              loadImage(file);
            }}
          />
          {texture.imageUrl ? (
            <div className="flex items-center gap-3 rounded-lg border p-2">
              <img
                src={texture.imageUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-md border object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={texture.imageName ?? undefined}>
                  {texture.imageName}
                </p>
                <p className="text-[11px] text-muted-foreground">Stays in your browser</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Replace image" onClick={() => fileRef.current?.click()}>
                <UploadIcon />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Remove image" onClick={clearImage}>
                <TrashIcon />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                loadImage(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ImageIcon className="h-5 w-5" />
              <span>
                <span className="font-medium text-foreground">Upload an image</span> or drop it here
              </span>
              <span>PNG, JPG, WebP or GIF · up to 15 MB</span>
            </button>
          )}
        </Field>
      )}

      <Field label="Placement">
        <div className="space-y-3 rounded-lg border p-3">
          <Slider
            label="Scale (tiles)"
            value={texture.repeat}
            min={0.25}
            max={8}
            step={0.25}
            unit="×"
            onChange={(repeat) => patch({ repeat })}
          />
          <Slider
            label="Rotation"
            value={texture.rotation}
            min={0}
            max={360}
            step={5}
            unit="°"
            onChange={(rotation) => patch({ rotation })}
          />
          <Slider
            label="Offset X"
            value={texture.offsetX}
            min={-1}
            max={1}
            step={0.05}
            onChange={(offsetX) => patch({ offsetX })}
          />
          <Slider
            label="Offset Y"
            value={texture.offsetY}
            min={-1}
            max={1}
            step={0.05}
            onChange={(offsetY) => patch({ offsetY })}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => patch({ repeat: 1, rotation: 0, offsetX: 0, offsetY: 0 })}
          >
            <ResetIcon className="h-3.5 w-3.5" /> Reset placement
          </Button>
        </div>
      </Field>
    </div>
  );
}
