import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BuildInfo, GlyphScene } from '../lib/scene';
import type { GlyphSettings, ParsedSvg } from '../lib/types';
import { MinusIcon, PlusIcon, ResetIcon } from './icons';
import { Button, cn } from './ui';

export interface ViewportHandle {
  exportPng(scale: number, options?: { transparent?: boolean }): Promise<Blob>;
  exportGltf(binary?: boolean): Promise<{ blob: Blob; extension: string }>;
  exportVideo(options: {
    fps: number;
    duration: number;
    transparent?: boolean;
    onProgress?: (progress: number) => void;
  }): Promise<{ blob: Blob; extension: string }>;
}

interface Props {
  model: ParsedSvg | null;
  settings: GlyphSettings;
  onBuild: (info: BuildInfo) => void;
  /** Geometry could not be built; the model is cleared. */
  onError: (message: string) => void;
  /** Non-fatal problem (e.g. an undecodable texture image); the model stays. */
  onNotice: (message: string) => void;
}

const WEBGL_UNAVAILABLE =
  'WebGL is not available in this browser, so Glyph cannot render 3D. Enable hardware acceleration or try a current version of Chrome, Firefox, Safari or Edge.';

/**
 * React wrapper around the imperative {@link GlyphScene}.
 * The 3D engine (three.js) is loaded with a dynamic import, so the interface paints
 * first and the engine downloads in parallel instead of blocking it.
 */
const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { model, settings, onBuild, onError, onNotice },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GlyphScene | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  // Always call the latest props from long-lived callbacks.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const callbacks = useRef({ onBuild, onError, onNotice });
  callbacks.current = { onBuild, onError, onNotice };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let scene: GlyphScene | null = null;

    import('../lib/scene')
      .then(({ GlyphScene }) => {
        if (cancelled) return;
        try {
          scene = new GlyphScene(el, {
            settings: settingsRef.current,
            onBuild: (info) => callbacks.current.onBuild(info),
            onTextureError: (message) => callbacks.current.onNotice(message),
          });
        } catch (error) {
          console.error('GlyphScene initialization error:', error);
          const msg = error instanceof Error ? error.message : '';
          const isWebGl =
            msg.toLowerCase().includes('webgl') ||
            msg.toLowerCase().includes('context') ||
            !window.WebGLRenderingContext;
          setFatal(
            isWebGl
              ? WEBGL_UNAVAILABLE
              : `Glyph encountered an initialization error: ${msg || 'Unknown error'}`,
          );
          return;
        }
        sceneRef.current = scene;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFatal('Glyph could not load its 3D engine. Check your connection and reload.');
      });

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, []);

  // Build (or clear) the model once the engine is ready and whenever the artwork changes.
  useEffect(() => {
    if (!model) {
      sceneRef.current?.setModel(null);
      return;
    }
    if (fatal) {
      callbacks.current.onError(fatal);
      return;
    }
    const scene = sceneRef.current;
    if (!scene) return; // not ready yet — this effect re-runs when `ready` flips
    try {
      scene.setModel(model);
    } catch (error) {
      console.error(error);
      scene.setModel(null);
      callbacks.current.onError(
        'Glyph could not build 3D geometry from this SVG. It may contain shapes that cannot be triangulated.',
      );
    }
  }, [model, ready, fatal]);

  useEffect(() => {
    sceneRef.current?.update(settings);
  }, [settings, ready]);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: (scale, options) => {
        const scene = sceneRef.current;
        return scene ? scene.exportPng(scale, options) : Promise.reject(new Error('Viewport not ready'));
      },
      exportGltf: (binary) => {
        const scene = sceneRef.current;
        return scene ? scene.exportGltf(binary) : Promise.reject(new Error('Viewport not ready'));
      },
      exportVideo: (options) => {
        const scene = sceneRef.current;
        return scene ? scene.exportVideo(options) : Promise.reject(new Error('Viewport not ready'));
      },
    }),
    [],
  );

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="3D viewport. Drag to orbit, scroll or pinch to zoom, right-drag or arrow keys to pan."
        className={cn(
          'h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          settings.transparentBackground ? 'bg-checker' : 'bg-muted',
        )}
      />

      {model && ready && (
        <div className="absolute right-2 top-2 flex flex-col gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur md:right-3 md:top-3">
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => sceneRef.current?.zoomBy(0.8)}>
            <PlusIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1.25)}>
            <MinusIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Reset camera" onClick={() => sceneRef.current?.resetCamera()}>
            <ResetIcon />
          </Button>
        </div>
      )}

      {fatal && (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-background p-8 text-center text-sm leading-relaxed text-muted-foreground"
        >
          <p className="max-w-md">{fatal}</p>
        </div>
      )}
    </div>
  );
});

export default Viewport;
