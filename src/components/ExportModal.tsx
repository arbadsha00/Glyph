import { useEffect } from 'react';
import type {
  ExportFormat,
  GltfFormat,
  GlyphSettings,
  ParsedSvg,
  VideoDuration,
  VideoFps,
} from '../lib/types';
import { BoxIcon, CameraIcon, CloseIcon, VideoIcon } from './icons';
import { Button, Field, Segmented, Switch } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: GlyphSettings;
  onChange: (patch: Partial<GlyphSettings>) => void;
  model: ParsedSvg | null;
  onExport: () => Promise<void>;
  exporting: boolean;
  exportFormat: ExportFormat;
  onSelectFormat: (format: ExportFormat) => void;
  videoProgress: number | null;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG Image' },
  { value: 'video', label: 'Turntable Video' },
  { value: 'gltf', label: '3D Model (glTF)' },
];

const RESOLUTION_OPTIONS: { value: '1' | '2'; label: string }[] = [
  { value: '1', label: 'Standard 1×' },
  { value: '2', label: 'High-res 2×' },
];

const FPS_OPTIONS: { value: '30' | '60'; label: string }[] = [
  { value: '30', label: '30 FPS' },
  { value: '60', label: '60 FPS' },
];

const DURATION_OPTIONS: { value: '4' | '6' | '8'; label: string }[] = [
  { value: '4', label: '4 seconds' },
  { value: '6', label: '6 seconds' },
  { value: '8', label: '8 seconds' },
];

const GLTF_OPTIONS: { value: GltfFormat; label: string }[] = [
  { value: 'glb', label: 'Binary .glb (Recommended)' },
  { value: 'gltf', label: 'glTF JSON' },
];

export default function ExportModal({
  open,
  onClose,
  settings,
  onChange,
  model,
  onExport,
  exporting,
  exportFormat,
  onSelectFormat,
  videoProgress,
}: Props) {
  const exp = settings.export;

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, exporting, onClose]);

  if (!open) return null;

  const updateExp = (patch: Partial<typeof exp>) => {
    onChange({ export: { ...exp, ...patch } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!exporting) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border bg-card p-6 shadow-2xl transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 id="export-dialog-title" className="text-base font-semibold tracking-tight text-foreground">
              Export Artwork
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[260px]">
              {model ? model.name : 'No model loaded'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={exporting}
            aria-label="Close dialog"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Format Selector */}
        <div className="pb-5">
          <Segmented
            label="Export format"
            options={FORMAT_OPTIONS}
            value={exportFormat}
            onChange={onSelectFormat}
          />
        </div>

        {/* Tab 1: PNG Image */}
        {exportFormat === 'png' && (
          <div className="space-y-4">
            <Field label="Resolution">
              <Segmented
                label="PNG resolution"
                options={RESOLUTION_OPTIONS}
                value={String(exp.pngScale) as '1' | '2'}
                onChange={(v) => updateExp({ pngScale: Number(v) as 1 | 2 })}
              />
            </Field>

            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
              <Switch
                label="Transparent background"
                checked={exp.pngTransparent}
                onChange={(pngTransparent) => updateExp({ pngTransparent })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Preserves all HDR lighting, reflections, and material colors on the 3D model, while
                rendering the background as completely transparent.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Turntable Video */}
        {exportFormat === 'video' && (
          <div className="space-y-4">
            <Field label="Frame Rate">
              <Segmented
                label="Video FPS"
                options={FPS_OPTIONS}
                value={String(exp.videoFps) as '30' | '60'}
                onChange={(v) => updateExp({ videoFps: Number(v) as VideoFps })}
              />
            </Field>

            <Field label="Rotation Duration (360° Loop)">
              <Segmented
                label="Video duration"
                options={DURATION_OPTIONS}
                value={String(exp.videoDuration) as '4' | '6' | '8'}
                onChange={(v) => updateExp({ videoDuration: Number(v) as VideoDuration })}
              />
            </Field>

            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
              <Switch
                label="Transparent background (WebM alpha)"
                checked={exp.videoTransparent}
                onChange={(videoTransparent) => updateExp({ videoTransparent })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Records a 360-degree turntable animation of your 3D model with smooth rotation and active
                reflections.
              </p>
            </div>

            {/* Video progress indicator */}
            {exporting && videoProgress !== null && (
              <div className="space-y-2 rounded-xl border border-primary/20 bg-accent/40 p-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                    Recording 360° turntable…
                  </span>
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
          </div>
        )}

        {/* Tab 3: 3D Model (glTF) */}
        {exportFormat === 'gltf' && (
          <div className="space-y-4">
            <Field label="glTF Format">
              <Segmented
                label="glTF file format"
                options={GLTF_OPTIONS}
                value={exp.gltfFormat}
                onChange={(gltfFormat) => updateExp({ gltfFormat })}
              />
            </Field>

            <div className="rounded-xl border bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Included in 3D export:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                <li>Complete 3D meshes with depth and bevel</li>
                <li>Standard glTF PBR materials (metallic, roughness, colors)</li>
                <li>Fully compatible with Blender, Figma, Apple Quick Look, Unreal, and WebGL</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={onExport} disabled={!model || exporting} className="gap-2">
            {exportFormat === 'png' && <CameraIcon className="h-4 w-4" />}
            {exportFormat === 'video' && <VideoIcon className="h-4 w-4" />}
            {exportFormat === 'gltf' && <BoxIcon className="h-4 w-4" />}
            <span>
              {exporting
                ? exportFormat === 'video'
                  ? `Recording (${videoProgress ?? 0}%)`
                  : 'Exporting…'
                : exportFormat === 'png'
                ? 'Export PNG'
                : exportFormat === 'video'
                ? 'Export Turntable Video'
                : `Export 3D Model (.${exp.gltfFormat})`}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
