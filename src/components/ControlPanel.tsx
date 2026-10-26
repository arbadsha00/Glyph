import { useState } from 'react';
import type {
  ExportFormat,
  GltfFormat,
  GlyphSettings,
  LightingPreset,
  ParsedSvg,
  VideoDuration,
  VideoFps,
} from '../lib/types';
import EnvironmentEditor from './EnvironmentEditor';
import FillEditor from './FillEditor';
import MaterialEditor from './MaterialEditor';
import { BoxIcon, CameraIcon, UploadIcon, VideoIcon } from './icons';
import { Button, ColorInput, Field, Group, Segmented, Slider, Switch } from './ui';



const LIGHTING: { value: LightingPreset; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'soft', label: 'Soft' },
  { value: 'dramatic', label: 'Dramatic' },
];

const RESOLUTIONS: { value: '1' | '2'; label: string }[] = [
  { value: '1', label: 'Standard' },
  { value: '2', label: 'High-res 2×' },
];

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'video', label: 'Video' },
  { value: 'gltf', label: '3D glTF' },
];

const VIDEO_FPS: { value: '30' | '60'; label: string }[] = [
  { value: '30', label: '30 FPS' },
  { value: '60', label: '60 FPS' },
];

const VIDEO_DURATIONS: { value: '4' | '6' | '8'; label: string }[] = [
  { value: '4', label: '4s' },
  { value: '6', label: '6s' },
  { value: '8', label: '8s' },
];

const GLTF_FORMATS: { value: GltfFormat; label: string }[] = [
  { value: 'glb', label: 'Binary .glb' },
  { value: 'gltf', label: 'glTF JSON' },
];

const TABS: { value: Tab; label: string }[] = [
  { value: 'style', label: 'Style' },
  { value: 'material', label: 'Material' },
  { value: 'env', label: 'HDR Env' },
  { value: 'scene', label: 'Scene' },
];

type Tab = 'style' | 'material' | 'env' | 'scene';

interface Props {
  settings: GlyphSettings;
  onChange: (patch: Partial<GlyphSettings>) => void;
  model: ParsedSvg | null;
  onPickFile: () => void;
  onSample: () => void;
  exportScale: number;
  onExportScale: (scale: number) => void;
  onError: (message: string) => void;
  onExport?: (format: ExportFormat) => void;
  exporting?: boolean;
  videoProgress?: number | null;
}

/**
 * Responsive controls (PRD §10.3):
 *  - below 768 px: a panel *under* the 3D view, so the model stays visible while editing;
 *  - 768 px and up: a docked sidebar on the left.
 * The layout is entirely in the class list; the parent only orders the two panes.
 */
export default function ControlPanel(props: Props) {
  const [tab, setTab] = useState<Tab>('style');

  return (
    <aside
      aria-label="Controls"
      className="order-2 flex h-[42dvh] min-h-[15rem] shrink-0 flex-col border-t bg-card md:order-1 md:h-auto md:min-h-0 md:w-[300px] md:border-r md:border-t-0 lg:w-[340px]"
    >
      <div className="shrink-0 border-b p-3">
        <Segmented label="Panel section" options={TABS} value={tab} onChange={setTab} />
      </div>

      {/* All tabs stay mounted so scroll position and editor state survive switching. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <div hidden={tab !== 'style'}>
          <StyleTab {...props} />
        </div>
        <div hidden={tab !== 'material'}>
          <MaterialEditor settings={props.settings} onChange={props.onChange} />
        </div>
        <div hidden={tab !== 'env'}>
          <EnvironmentEditor
            settings={props.settings}
            onChange={props.onChange}
            onError={props.onError}
          />
        </div>
        <div hidden={tab !== 'scene'}>
          <SceneTab {...props} />
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────── Style tab ───────────────────────────────────

function StyleTab({ settings, onChange, model, onPickFile, onSample, onError }: Props) {
  return (
    <>
      <Group title="Artwork">
        {model && (
          <div className="rounded-lg border bg-muted/50 px-3 py-2.5">
            <p className="truncate text-sm font-medium" title={model.name}>
              {model.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {model.paths.length} {model.paths.length === 1 ? 'path' : 'paths'} ·{' '}
              {Math.round(model.width)} × {Math.round(model.height)} units
            </p>
            {model.skippedPaths > 0 && (
              <p className="mt-2 rounded-md bg-warning-bg px-2 py-1.5 text-xs leading-relaxed text-warning">
                {model.skippedPaths} stroke-only or empty{' '}
                {model.skippedPaths === 1 ? 'path was' : 'paths were'} skipped. Convert strokes to
                outlines for best results.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={model ? 'outline' : 'default'} onClick={onPickFile}>
            <UploadIcon />
            {model ? 'Replace' : 'Upload SVG'}
          </Button>
          <Button variant="outline" onClick={onSample}>
            Use sample
          </Button>
        </div>
      </Group>

      <Group title="Fill">
        <FillEditor settings={settings} onChange={onChange} model={model} onError={onError} />
      </Group>

      <Group title="Geometry">
        <Slider
          label="Extrusion depth"
          value={settings.depth}
          min={2}
          max={60}
          unit="%"
          onChange={(depth) => onChange({ depth })}
        />
        <Slider
          label="Bevel"
          value={settings.bevel}
          min={0}
          max={100}
          onChange={(bevel) => onChange({ bevel })}
        />
      </Group>
    </>
  );
}

// ─────────────────────────────────── Scene tab ───────────────────────────────────

function SceneTab({
  settings,
  onChange,
  model,
  exportScale,
  onExportScale,
  onExport,
  exporting,
  videoProgress,
}: Props) {
  const exp = settings.export;
  const updateExp = (patch: Partial<typeof exp>) => {
    onChange({ export: { ...exp, ...patch } });
  };

  return (
    <>
      <Group title="Lighting">
        <Segmented
          label="Lighting preset"
          options={LIGHTING}
          value={settings.lighting}
          onChange={(lighting) => onChange({ lighting })}
        />
      </Group>

      <Group title="Background">
        {settings.environment.showBackground ? (
          <div className="rounded-lg border bg-muted/50 p-2.5 text-xs text-muted-foreground">
            HDR environment panorama is currently shown as background. Switch to canvas color or customize in the{' '}
            <span className="font-medium text-foreground">HDR Env</span> tab.
          </div>
        ) : (
          <>
            <Switch
              label="Transparent background"
              checked={settings.transparentBackground}
              onChange={(transparentBackground) => onChange({ transparentBackground })}
            />
            {!settings.transparentBackground && (
              <Field label="Color">
                <ColorInput
                  label="Background"
                  value={settings.background}
                  onChange={(background) => onChange({ background })}
                />
              </Field>
            )}
          </>
        )}
      </Group>

      <Group title="Export">
        <Field label="Export Format">
          <Segmented
            label="Format"
            options={EXPORT_FORMATS}
            value={exp.format}
            onChange={(format) => updateExp({ format })}
          />
        </Field>

        {exp.format === 'png' && (
          <div className="space-y-4 pt-1">
            <Field label="Resolution">
              <Segmented
                label="Export resolution"
                options={RESOLUTIONS}
                value={String(exp.pngScale) as '1' | '2'}
                onChange={(scale) => {
                  const s = Number(scale) as 1 | 2;
                  updateExp({ pngScale: s });
                  onExportScale(s);
                }}
              />
            </Field>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <Switch
                label="Transparent background"
                checked={exp.pngTransparent}
                onChange={(pngTransparent) => updateExp({ pngTransparent })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Keeps HDR reflections and lighting on your 3D model while removing the background so it exports as transparent.
              </p>
            </div>

            <Button
              className="w-full gap-2"
              disabled={!model || exporting}
              onClick={() => onExport?.('png')}
            >
              <CameraIcon className="h-4 w-4" />
              <span>Export PNG</span>
            </Button>
          </div>
        )}

        {exp.format === 'video' && (
          <div className="space-y-4 pt-1">
            <Field label="Frame Rate">
              <Segmented
                label="Video FPS"
                options={VIDEO_FPS}
                value={String(exp.videoFps) as '30' | '60'}
                onChange={(v) => updateExp({ videoFps: Number(v) as VideoFps })}
              />
            </Field>

            <Field label="Rotation Duration">
              <Segmented
                label="Video duration"
                options={VIDEO_DURATIONS}
                value={String(exp.videoDuration) as '4' | '6' | '8'}
                onChange={(v) => updateExp({ videoDuration: Number(v) as VideoDuration })}
              />
            </Field>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <Switch
                label="Transparent background"
                checked={exp.videoTransparent}
                onChange={(videoTransparent) => updateExp({ videoTransparent })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Records a full 360-degree turntable rotation loop of your 3D model with smooth camera reflections.
              </p>
            </div>

            {exporting && videoProgress !== null && (
              <div className="space-y-1.5 rounded-lg border border-primary/20 bg-accent/40 p-2.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-foreground">Recording turntable…</span>
                  <span className="tabular-nums text-muted-foreground">{videoProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-150"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              disabled={!model || exporting}
              onClick={() => onExport?.('video')}
            >
              <VideoIcon className="h-4 w-4" />
              <span>
                {exporting && videoProgress !== null
                  ? `Recording (${videoProgress}%)`
                  : 'Export Turntable Video'}
              </span>
            </Button>
          </div>
        )}

        {exp.format === 'gltf' && (
          <div className="space-y-4 pt-1">
            <Field label="Format">
              <Segmented
                label="glTF file format"
                options={GLTF_FORMATS}
                value={exp.gltfFormat}
                onChange={(gltfFormat) => updateExp({ gltfFormat })}
              />
            </Field>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Exports full 3D geometry with extrusion depth, bevel, and PBR materials. Compatible with
              Blender, Figma, Apple AR Quick Look, and three.js.
            </p>

            <Button
              className="w-full gap-2"
              disabled={!model || exporting}
              onClick={() => onExport?.('gltf')}
            >
              <BoxIcon className="h-4 w-4" />
              <span>Export 3D Model (.{exp.gltfFormat})</span>
            </Button>
          </div>
        )}
      </Group>
    </>
  );
}
