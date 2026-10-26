import { useRef, useState, type ChangeEvent } from 'react';
import {
  ENVIRONMENT_PRESETS,
  type EnvironmentCategory,
  type EnvironmentPreset,
} from '../lib/environments';
import { DEFAULT_ENVIRONMENT, type GlyphSettings } from '../lib/types';
import { CheckIcon, CloseIcon, ResetIcon, SphereIcon, UploadIcon } from './icons';
import { Button, cn, Group, Slider, Switch } from './ui';

interface Props {
  settings: GlyphSettings;
  onChange: (patch: Partial<GlyphSettings>) => void;
  onError: (message: string) => void;
}

const CATEGORIES: ('All' | EnvironmentCategory)[] = [
  'All',
  'Studio',
  'Outdoor',
  'Sunset',
  'Night',
  'Stylized',
];

export default function EnvironmentEditor({ settings, onChange, onError }: Props) {
  const [filter, setFilter] = useState<'All' | EnvironmentCategory>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const env = settings.environment;

  const filteredPresets =
    filter === 'All'
      ? ENVIRONMENT_PRESETS
      : ENVIRONMENT_PRESETS.filter((p) => p.category === filter);

  const selectPreset = (preset: EnvironmentPreset) => {
    onChange({
      environment: {
        ...env,
        id: preset.id,
      },
    });
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected if desired
    e.target.value = '';

    const isHdr =
      file.name.toLowerCase().endsWith('.hdr') ||
      file.name.toLowerCase().endsWith('.exr') ||
      file.type.startsWith('image/');

    if (!isHdr) {
      onError('Please choose an HDR (.hdr) or equirectangular panorama image.');
      return;
    }

    if (env.customUrl) {
      URL.revokeObjectURL(env.customUrl);
    }

    const customUrl = URL.createObjectURL(file);
    onChange({
      environment: {
        ...env,
        id: 'custom',
        customUrl,
        customName: file.name,
      },
    });
  };

  const removeCustom = () => {
    if (env.customUrl) {
      URL.revokeObjectURL(env.customUrl);
    }
    onChange({
      environment: {
        ...env,
        id: 'studio',
        customUrl: null,
        customName: null,
      },
    });
  };

  const resetDefaults = () => {
    onChange({
      environment: {
        ...DEFAULT_ENVIRONMENT,
        customUrl: env.customUrl,
        customName: env.customName,
      },
    });
  };

  return (
    <>
      <Group title="HDR Environments">
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === cat
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Environment cards grid */}
        <div className="grid grid-cols-2 gap-2">
          {filteredPresets.map((preset) => {
            const isSelected = env.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset)}
                className={cn(
                  'group relative flex flex-col items-start rounded-xl border p-2.5 text-left transition-all',
                  isSelected
                    ? 'border-foreground bg-accent/60 shadow-xs ring-1 ring-foreground'
                    : 'border-border bg-card hover:border-foreground/40 hover:bg-muted/40',
                )}
              >
                {/* Visual sphere thumbnail */}
                <div className="relative mb-2 flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-950/80">
                  <div
                    className="h-10 w-10 rounded-full shadow-md transition-transform duration-300 group-hover:scale-105"
                    style={{ background: preset.previewGradient }}
                  />
                  {/* Subtle rim highlight ring */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />

                  {preset.badge && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs">
                      {preset.badge}
                    </span>
                  )}

                  {isSelected && (
                    <span className="absolute bottom-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow-xs">
                      <CheckIcon className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <span className="truncate text-xs font-medium text-foreground">
                  {preset.name}
                </span>
                <span className="line-clamp-2 mt-0.5 text-[10px] leading-tight text-muted-foreground">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      {/* Custom upload card */}
      <Group title="Custom HDRI">
        <input
          ref={fileInputRef}
          type="file"
          accept=".hdr,.exr,image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {env.customUrl ? (
          <div className="flex flex-col gap-2 rounded-xl border border-foreground/30 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-foreground">
                  <SphereIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {env.customName ?? 'Custom HDR'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">User-provided HDRI</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant={env.id === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onChange({ environment: { ...env, id: 'custom' } })}
                >
                  {env.id === 'custom' ? 'Active' : 'Use'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={removeCustom}
                  aria-label="Remove custom HDR"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed py-5"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
            <span>Upload custom .hdr file</span>
          </Button>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Supports 360° Radiance (<code className="font-mono text-[10px]">.hdr</code>) files and
          equirectangular panoramas.
        </p>
      </Group>

      {/* Environment Tuning */}
      <Group title="Environment Tuning">
        <Slider
          label="Lighting intensity"
          value={Math.round(env.intensity * 100)}
          min={0}
          max={300}
          step={5}
          unit="%"
          onChange={(val) =>
            onChange({
              environment: { ...env, intensity: val / 100 },
            })
          }
        />

        <Slider
          label="Environment rotation"
          value={env.rotation}
          min={0}
          max={360}
          step={1}
          unit="°"
          onChange={(rotation) =>
            onChange({
              environment: { ...env, rotation },
            })
          }
        />
      </Group>

      {/* Background Panorama Display */}
      <Group title="Viewport Background">
        <Switch
          label="Show HDR as background"
          checked={env.showBackground}
          onChange={(showBackground) =>
            onChange({
              environment: { ...env, showBackground },
            })
          }
        />

        {env.showBackground ? (
          <div className="space-y-4 pt-1">
            <Slider
              label="Background blur"
              value={Math.round(env.backgroundBlur * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(val) =>
                onChange({
                  environment: { ...env, backgroundBlur: val / 100 },
                })
              }
            />

            <Slider
              label="Background brightness"
              value={Math.round(env.backgroundIntensity * 100)}
              min={0}
              max={300}
              step={5}
              unit="%"
              onChange={(val) =>
                onChange({
                  environment: { ...env, backgroundIntensity: val / 100 },
                })
              }
            />
            <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> When exporting, your 3D model
              retains all HDR reflections and lighting while the background is removed as transparent.
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            When disabled, the viewport uses the canvas background or transparency configured in the
            Scene tab.
          </p>
        )}

        <div className="pt-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={resetDefaults}>
            <ResetIcon className="h-3 w-3" />
            Reset environment
          </Button>
        </div>
      </Group>
    </>
  );
}
