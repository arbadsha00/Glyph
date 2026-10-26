import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import sampleSvg from '../assets/sample-logo.svg?raw';
import { isSvgFile, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from '../lib/constants';
import type { BuildInfo } from '../lib/scene';
import {
  DEFAULT_BACKGROUNDS,
  DEFAULT_SETTINGS,
  GlyphError,
  type ExportFormat,
  type GlyphSettings,
  type ParsedSvg,
} from '../lib/types';
import ControlPanel from './ControlPanel';
import ExportModal from './ExportModal';
import { CloseIcon, DownloadIcon, LogoMark, MoonIcon, SunIcon, UploadIcon } from './icons';
import { Button } from './ui';
import Viewport, { type ViewportHandle } from './Viewport';

/** Resolve after the browser has painted, so a loading indicator is visible before heavy sync work. */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** The SVG parser pulls in three.js, so it is loaded on demand (and prefetched when the browser is idle). */
const loadParser = () => import('../lib/svgParser');

type Theme = 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem('glyph-theme', next);
      } catch {
        /* storage unavailable — the choice just won't persist */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

function makeExportFileName(name: string, material: string, suffix: string, ext: string): string {
  const base =
    name
      .replace(/\.svg$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `glyph-${base}-${material}${suffix ? `-${suffix}` : ''}-${stamp}.${ext}`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function GlyphApp() {
  const [settings, setSettings] = useState<GlyphSettings>(DEFAULT_SETTINGS);
  const [model, setModel] = useState<ParsedSvg | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportScale, setExportScale] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);

  const viewportRef = useRef<ViewportHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [theme, toggleTheme] = useTheme();

  const patchSettings = useCallback(
    (patch: Partial<GlyphSettings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  // The viewport background follows the theme until the user picks a color of their own.
  useEffect(() => {
    setSettings((s) => {
      const isDefault =
        s.background === DEFAULT_BACKGROUNDS.dark || s.background === DEFAULT_BACKGROUNDS.light;
      return isDefault ? { ...s, background: DEFAULT_BACKGROUNDS[theme] } : s;
    });
  }, [theme]);

  // Warm up the parser (and three.js with it) while the user is deciding what to upload.
  useEffect(() => {
    const handle = window.setTimeout(() => void loadParser().catch(() => undefined), 300);
    return () => window.clearTimeout(handle);
  }, []);

  // Release uploaded texture image and HDR object URLs when the app goes away.
  useEffect(
    () => () => {
      const url = settingsRef.current.texture.imageUrl;
      if (url) URL.revokeObjectURL(url);
      const customHdr = settingsRef.current.environment.customUrl;
      if (customHdr) URL.revokeObjectURL(customHdr);
    },
    [],
  );

  // ── Loading ────────────────────────────────────────────────────────────

  const ingest = useCallback(async (text: string, name: string) => {
    setLoading(true); // stays on until the viewport reports the geometry is built
    setError(null);
    await nextPaint();
    try {
      const { parseSvg } = await loadParser();
      setModel(parseSvg(text, name));
    } catch (e) {
      setError(e instanceof GlyphError ? e.message : 'Something went wrong while reading this SVG.');
      setLoading(false);
    }
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      if (!isSvgFile(file)) {
        setError('That file is not an SVG. Choose a .svg file.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(
          `This SVG is ${(file.size / 1048576).toFixed(1)} MB. Glyph supports files up to ${MAX_FILE_BYTES / 1048576} MB.`,
        );
        return;
      }
      try {
        await ingest(await file.text(), file.name);
      } catch {
        setError('Glyph could not read that file.');
        setLoading(false);
      }
    },
    [ingest],
  );

  /** An image dropped on the viewport becomes the texture. */
  const applyTextureImage = useCallback((file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(file.size / 1048576).toFixed(1)} MB. Texture images can be up to 15 MB.`);
      return;
    }
    const previous = settingsRef.current.texture.imageUrl;
    if (previous) URL.revokeObjectURL(previous);
    const imageUrl = URL.createObjectURL(file);
    setSettings((s) => ({
      ...s,
      colorMode: 'texture',
      texture: { ...s.texture, source: 'image', imageUrl, imageName: file.name },
    }));
  }, []);

  const loadSample = useCallback(() => void ingest(sampleSvg, 'sample-logo.svg'), [ingest]);
  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleBuild = useCallback((info: BuildInfo) => {
    setBuildInfo(info);
    setLoading(false);
  }, []);

  /** The 3D build failed: show why and return to the empty state. */
  const handleBuildFailure = useCallback((message: string) => {
    setError(message);
    setLoading(false);
    setModel(null);
    setBuildInfo(null);
  }, []);

  // ── Drag and drop (FR-1.1) ─────────────────────────────────────────────

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Check for dropped HDR environment
    if (file.name.toLowerCase().endsWith('.hdr') || file.name.toLowerCase().endsWith('.exr')) {
      const prev = settingsRef.current.environment.customUrl;
      if (prev) URL.revokeObjectURL(prev);
      const customUrl = URL.createObjectURL(file);
      setSettings((s) => ({
        ...s,
        environment: {
          ...s.environment,
          id: 'custom',
          customUrl,
          customName: file.name,
        },
      }));
      setToast(`Loaded ${file.name} as HDR environment`);
      return;
    }

    if (!isSvgFile(file) && file.type.startsWith('image/')) applyTextureImage(file);
    else void loadFile(file);
  };

  // Stop the browser navigating to a file that is dropped outside the viewport.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  // ── Export (FR-5.x) ────────────────────────────────────────────────────

  const exportPng = useCallback(async () => {
    if (!model || !viewportRef.current) return;
    setExporting(true);
    try {
      const { pngScale, pngTransparent } = settingsRef.current.export;
      const blob = await viewportRef.current.exportPng(pngScale, { transparent: pngTransparent });
      const suffix = pngScale > 1 ? `${pngScale}x` : '';
      const fileName = makeExportFileName(model.name, settings.material, suffix, 'png');
      triggerDownload(blob, fileName);
      setToast(`Saved ${fileName}`);
      setExportModalOpen(false);
    } catch {
      setError('PNG export failed. Try standard resolution.');
    } finally {
      setExporting(false);
    }
  }, [model, settings.material]);

  const exportGltf = useCallback(async () => {
    if (!model || !viewportRef.current) return;
    setExporting(true);
    try {
      const isBinary = settingsRef.current.export.gltfFormat === 'glb';
      const { blob, extension } = await viewportRef.current.exportGltf(isBinary);
      const fileName = makeExportFileName(model.name, settings.material, '', extension);
      triggerDownload(blob, fileName);
      setToast(`Saved ${fileName}`);
      setExportModalOpen(false);
    } catch {
      setError('3D glTF export failed.');
    } finally {
      setExporting(false);
    }
  }, [model, settings.material]);

  const exportVideo = useCallback(async () => {
    if (!model || !viewportRef.current) return;
    setExporting(true);
    setVideoProgress(0);
    try {
      const { videoFps, videoDuration, videoTransparent } = settingsRef.current.export;
      const { blob, extension } = await viewportRef.current.exportVideo({
        fps: videoFps,
        duration: videoDuration,
        transparent: videoTransparent,
        onProgress: (p) => setVideoProgress(Math.round(p * 100)),
      });
      const fileName = makeExportFileName(model.name, settings.material, `${videoFps}fps`, extension);
      triggerDownload(blob, fileName);
      setToast(`Saved ${fileName}`);
      setExportModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Turntable video export failed.');
    } finally {
      setExporting(false);
      setVideoProgress(null);
    }
  }, [model, settings.material]);

  const handleExport = useCallback(
    async (format?: ExportFormat) => {
      const target = format ?? settingsRef.current.export.format;
      if (target === 'png') await exportPng();
      else if (target === 'video') await exportVideo();
      else if (target === 'gltf') await exportGltf();
    },
    [exportPng, exportVideo, exportGltf],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark className="h-7 w-7 text-foreground" />
          <span className="text-base font-semibold tracking-tight">Glyph</span>
        </div>
        {model && (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
            <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block" title={model.name}>
              {model.name}
            </span>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
          <Button
            onClick={() => setExportModalOpen(true)}
            disabled={!model || exporting}
            aria-label="Export"
            className="gap-2"
          >
            <DownloadIcon />
            <span className="max-sm:sr-only">{exporting ? 'Exporting…' : 'Export…'}</span>
          </Button>
        </div>
      </header>

      {/* Phones: 3D view on top, controls underneath. 768 px and up: sidebar + view side by side. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ControlPanel
          settings={settings}
          onChange={patchSettings}
          model={model}
          onPickFile={openPicker}
          onSample={loadSample}
          exportScale={settings.export.pngScale}
          onExportScale={(scale) =>
            patchSettings({ export: { ...settings.export, pngScale: scale as 1 | 2 } })
          }
          onError={setError}
          onExport={handleExport}
          exporting={exporting}
          videoProgress={videoProgress}
        />

        <main
          className="relative order-1 min-h-0 min-w-0 flex-1 md:order-2"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <Viewport
            ref={viewportRef}
            model={model}
            settings={settings}
            onBuild={handleBuild}
            onError={handleBuildFailure}
            onNotice={setError}
          />

          {/* Empty state */}
          {!model && !loading && (
            <div className="bg-dots absolute inset-0 grid place-items-center overflow-y-auto p-4 md:p-6">
              <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm md:p-8">
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg border bg-muted text-foreground md:mb-4">
                  <UploadIcon className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold tracking-tight">Turn any SVG into 3D</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Drop an SVG here or choose a file. Everything runs in your browser — nothing is
                  uploaded.
                </p>
                <div className="mt-5 flex flex-col gap-2 md:mt-6">
                  <Button onClick={openPicker}>
                    <UploadIcon />
                    Upload SVG
                  </Button>
                  <Button variant="outline" onClick={loadSample}>
                    Try a sample
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading state (FR-1.4) */}
          {loading && (
            <div
              role="status"
              className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
                Building 3D model…
              </div>
            </div>
          )}

          {/* Drop target highlight */}
          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-xl border-2 border-dashed border-foreground/50 bg-background/80 p-4 text-center text-sm font-medium backdrop-blur-sm">
              Drop an SVG to load it — or an image to use as a texture
            </div>
          )}

          {/* Errors (FR-1.3) */}
          {error && (
            <div
              role="alert"
              className="absolute left-1/2 top-3 z-20 flex w-[min(94%,34rem)] -translate-x-1/2 items-start gap-3 rounded-lg border border-destructive/40 bg-background px-4 py-3 text-sm shadow-lg"
            >
              <p className="flex-1 leading-relaxed text-destructive">{error}</p>
              <Button
                variant="ghost"
                size="icon"
                className="-my-2 -mr-3 h-9 w-9 md:h-8 md:w-8"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Status line + gesture hint */}
          {model && buildInfo && (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-3 text-xs text-muted-foreground md:inset-x-3 md:bottom-3">
              <span className="truncate rounded-md border bg-background/90 px-2.5 py-1.5 backdrop-blur">
                {buildInfo.meshes} {buildInfo.meshes === 1 ? 'mesh' : 'meshes'} ·{' '}
                {buildInfo.triangles.toLocaleString()} triangles · {Math.round(buildInfo.ms)} ms
              </span>
              <span className="hidden shrink-0 rounded-md border bg-background/90 px-2.5 py-1.5 backdrop-blur md:block">
                Drag to orbit · scroll or pinch to zoom · right-drag or two fingers to pan
              </span>
            </div>
          )}
        </main>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow re-selecting the same file
          if (file) void loadFile(file);
        }}
      />

      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        settings={settings}
        onChange={patchSettings}
        model={model}
        onExport={() => handleExport(settings.export.format)}
        exporting={exporting}
        exportFormat={settings.export.format}
        onSelectFormat={(format) =>
          patchSettings({ export: { ...settings.export, format } })
        }
        videoProgress={videoProgress}
      />

      {/* Export confirmation */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 truncate rounded-lg border bg-background px-4 py-2.5 text-sm shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
