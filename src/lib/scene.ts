import {
  Box3,
  Color,
  EquirectangularReflectionMapping,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Mesh,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { createCyberpunkScene, createSunsetScene, getEnvironmentPreset } from './environments';
import { createUserPaint, type PaintServer } from './gradients';
import { createLightRig, type LightRig } from './lighting';
import { createMaterial } from './materials';
import { applyPaint, buildModel, disposeModel, setPlanarUV, type BuiltModel } from './model';
import { createPatternTexture, loadImageTexture } from './textures';
import type { GlyphSettings, ParsedSvg, TextureSettings } from './types';

export interface BuildInfo {
  meshes: number;
  triangles: number;
  /** Time spent converting (parse + extrude on load, extrude only on re-build). */
  ms: number;
}

export interface SceneOptions {
  settings: GlyphSettings;
  onBuild?: (info: BuildInfo) => void;
  /** Called when a user-supplied texture image can't be decoded. */
  onTextureError?: (message: string) => void;
}

/** Longest side of an exported PNG, to stay inside common GPU limits. */
const EXPORT_MAX_SIDE = 4096;

const WHITE = new Color(0xffffff);

/**
 * Imperative Three.js controller. React owns the settings; this class owns
 * everything on the GPU (renderer, scene, camera, geometry, materials, textures).
 *
 * Performance notes:
 *  - Renders on demand (only when the camera moved or something changed).
 *  - Materials are cached and updated in place, so dragging a slider never
 *    recompiles a shader program.
 *  - Texture UVs are only generated while a texture is in use.
 */
export class GlyphScene {
  readonly canvas: HTMLCanvasElement;

  private readonly container: HTMLElement;
  private readonly options: SceneOptions;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 0.1, 500);
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly resizeObserver: ResizeObserver;

  private lights: LightRig | null = null;
  private parsed: ParsedSvg | null = null;
  private built: BuiltModel | null = null;
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private settings: GlyphSettings;

  // Environment state
  private activeEnv: { target: WebGLRenderTarget; backgroundTexture: Texture | null } | null = null;
  private readonly envCache = new Map<string, { target: WebGLRenderTarget; backgroundTexture: Texture | null }>();
  private envToken = 0;

  // Texture state
  private texture: Texture | null = null;
  private textureKey = '';
  private loadingKey = '';
  private imageToken = 0;
  /** Aspect ratio the current UVs were generated for; null = no UVs yet. */
  private uvAspect: number | null = null;

  private dirty = true;
  private userMoved = false;
  private rebuildHandle = 0;
  private disposed = false;

  constructor(container: HTMLElement, options: SceneOptions) {
    this.container = container;
    this.options = options;
    this.settings = options.settings;

    // Initialize WebGLRenderer with graceful attribute fallbacks
    try {
      this.renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      try {
        this.renderer = new WebGLRenderer({
          antialias: true,
          alpha: true,
        });
      } catch {
        this.renderer = new WebGLRenderer({
          antialias: false,
          alpha: true,
        });
      }
    }
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'block h-full w-full touch-none';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Khronos PBR Neutral keeps the artwork's original colors faithful.
    this.renderer.toneMapping = NeutralToneMapping;
    container.appendChild(this.canvas);

    // Survive GPU context loss (common on mobile when the tab is backgrounded).
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    // Pre-filtered Environment Map generator for realistic image-based lighting and reflections
    this.pmrem = new PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    // FR-4.1 – FR-4.3: orbit (drag / one finger), zoom (wheel / pinch), pan (right-drag / two fingers / arrow keys).
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.listenToKeyEvents(container);
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
    });
    this.controls.addEventListener('change', () => {
      this.dirty = true;
    });

    this.applyLighting();
    this.applyEnvironment();
    this.applyBackground();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(this.tick);
  }

  // ───────────────────────────── public API ─────────────────────────────

  /** Replace the displayed artwork (or clear it with `null`). Frames the camera. */
  setModel(parsed: ParsedSvg | null): void {
    this.parsed = parsed;
    this.removeModel();
    if (!parsed) {
      this.pruneMaterials(new Set());
      this.releaseTexture();
      this.dirty = true;
      return;
    }
    this.rebuild(true);
    this.fitCamera();
  }

  /** Apply new settings, touching only what actually changed. */
  update(next: GlyphSettings): void {
    const prev = this.settings;
    this.settings = next;

    if (prev.lighting !== next.lighting) this.applyLighting();
    if (
      prev.background !== next.background ||
      prev.transparentBackground !== next.transparentBackground
    ) {
      this.applyBackground();
    }

    if (prev.environment !== next.environment) {
      if (
        prev.environment.id !== next.environment.id ||
        prev.environment.customUrl !== next.environment.customUrl
      ) {
        this.applyEnvironment();
      } else {
        this.updateEnvironmentProperties();
      }
    }

    if (prev.depth !== next.depth || prev.bevel !== next.bevel) {
      this.queueRebuild(); // a rebuild re-applies appearance too
      return;
    }
    if (
      prev.colorMode !== next.colorMode ||
      prev.material !== next.material ||
      JSON.stringify(prev.materialCustomization) !== JSON.stringify(next.materialCustomization)
    ) {
      this.applyAppearance();
      return;
    }

    switch (next.colorMode) {
      case 'solid':
        if (prev.solidColor !== next.solidColor) this.updateSolidColor();
        break;
      case 'gradient':
        if (JSON.stringify(prev.gradient) !== JSON.stringify(next.gradient)) this.rebakeGradient();
        break;
      case 'texture':
        if (textureSourceChanged(prev.texture, next.texture)) this.applyAppearance();
        else if (transformChanged(prev.texture, next.texture)) this.applyTextureTransform();
        break;
    }
  }

  /** FR-4.4 */
  resetCamera(): void {
    this.fitCamera();
  }

  zoomBy(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const length = Math.min(
      this.controls.maxDistance,
      Math.max(this.controls.minDistance, offset.length() * factor),
    );
    offset.setLength(length);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.dirty = true;
  }

  /**
   * FR-5.1 / FR-5.2 / FR-5.3 — snapshot the current view (colors, material,
   * lighting, camera) to a PNG at `scale`× the on-screen pixel size.
   * If `options.transparent` is true, the background (HDR panorama or canvas color)
   * is hidden during export so the resulting PNG has transparent alpha, while
   * all HDR reflections, lighting, and material colors on the 3D model are fully preserved.
   */
  async exportPng(scale: number, options?: { transparent?: boolean }): Promise<Blob> {
    const renderer = this.renderer;
    const prevRatio = renderer.getPixelRatio();
    const cssSize = renderer.getSize(new Vector2());

    let w = Math.round(cssSize.x * prevRatio * scale);
    let h = Math.round(cssSize.y * prevRatio * scale);
    const k = Math.min(1, EXPORT_MAX_SIDE / Math.max(w, h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));

    const forceTransparent = options?.transparent ?? this.settings.transparentBackground;
    const savedBackground = this.scene.background;

    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);

    if (forceTransparent) {
      // Clear background so only transparent pixels are drawn behind the 3D object
      this.scene.background = null;
      renderer.setClearColor(0x000000, 0);
    }

    try {
      // Render and call toBlob in the same task: the drawing buffer is still valid,
      // so no preserveDrawingBuffer is needed.
      renderer.render(this.scene, this.camera);
      return await new Promise<Blob>((resolve, reject) => {
        this.canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
          'image/png',
        );
      });
    } finally {
      renderer.setPixelRatio(prevRatio);
      renderer.setSize(cssSize.x, cssSize.y, false);

      if (forceTransparent) {
        this.scene.background = savedBackground;
        this.applyBackground();
      }
      this.dirty = true;
    }
  }

  /**
   * Export the 3D model geometry, extrusion depth, bevel, and PBR materials
   * as a standard glTF 2.0 binary (.glb) or JSON (.gltf) file.
   */
  async exportGltf(binary = true): Promise<{ blob: Blob; extension: string }> {
    if (!this.built) throw new Error('No 3D model available to export');

    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();

    const output = await exporter.parseAsync(this.built.root, {
      binary,
      embedImages: true,
      onlyVisible: true,
    });

    if (binary) {
      const blob = new Blob([output as ArrayBuffer], { type: 'model/gltf-binary' });
      return { blob, extension: 'glb' };
    } else {
      const json = JSON.stringify(output, null, 2);
      const blob = new Blob([json], { type: 'model/gltf+json' });
      return { blob, extension: 'gltf' };
    }
  }

  /**
   * Export a smooth 360-degree turntable rotation video of the 3D model
   * at the specified frame rate and duration.
   */
  async exportVideo(options: {
    fps: number;
    duration: number;
    transparent?: boolean;
    onProgress?: (progress: number) => void;
  }): Promise<{ blob: Blob; extension: string }> {
    if (!this.built) throw new Error('No 3D model available to export');

    const { fps, duration, transparent = false, onProgress } = options;
    const totalMs = duration * 1000;
    const initialRotation = this.built.root.rotation.y;
    const savedBackground = this.scene.background;

    if (transparent) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
    }

    return new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
      let stream: MediaStream;
      try {
        stream = this.canvas.captureStream(fps);
      } catch {
        if (transparent) {
          this.scene.background = savedBackground;
          this.applyBackground();
        }
        reject(new Error('Canvas video capture is not supported in this browser.'));
        return;
      }

      // Check preferred codec
      let mimeType = '';
      const preferred = transparent
        ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        : ['video/webm;codecs=vp9', 'video/mp4', 'video/webm'];

      for (const cand of preferred) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(cand)) {
          mimeType = cand;
          break;
        }
      }
      if (!mimeType) mimeType = 'video/webm';

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: 10000000, // 10 Mbps
        });
      } catch {
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          if (transparent) {
            this.scene.background = savedBackground;
            this.applyBackground();
          }
          reject(new Error('MediaRecorder initialization failed in this browser.'));
          return;
        }
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      let animHandle = 0;
      let startTime = 0;

      const finish = () => {
        cancelAnimationFrame(animHandle);
        recorder.onstop = () => {
          if (this.built) this.built.root.rotation.y = initialRotation;
          if (transparent) {
            this.scene.background = savedBackground;
            this.applyBackground();
          }
          this.dirty = true;
          const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
          resolve({ blob, extension: ext });
        };

        recorder.onerror = (e) => {
          if (this.built) this.built.root.rotation.y = initialRotation;
          if (transparent) {
            this.scene.background = savedBackground;
            this.applyBackground();
          }
          this.dirty = true;
          reject(e);
        };

        setTimeout(() => {
          try {
            if (recorder.state !== 'inactive') recorder.stop();
          } catch (e) {
            reject(e);
          }
        }, 120);
      };

      const step = (now: number) => {
        if (!startTime) startTime = now;
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalMs);
        onProgress?.(progress);

        if (this.built) {
          this.built.root.rotation.y = initialRotation + progress * Math.PI * 2;
        }
        this.renderer.render(this.scene, this.camera);

        if (progress < 1) {
          animHandle = requestAnimationFrame(step);
        } else {
          finish();
        }
      };

      recorder.start(100);
      animHandle = requestAnimationFrame(step);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.imageToken++;
    this.envToken++;
    cancelAnimationFrame(this.rebuildHandle);
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.removeModel();
    this.pruneMaterials(new Set());
    this.releaseTexture();
    for (const item of this.envCache.values()) {
      item.target.dispose();
      item.backgroundTexture?.dispose();
    }
    this.envCache.clear();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ─────────────────────────────── internals ──────────────────────────────

  private readonly tick = (): void => {
    const moved = this.controls.update();
    if (moved || this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault(); // allow the browser to restore the context
  };

  private readonly onContextRestored = (): void => {
    this.dirty = true; // three.js re-uploads everything on the next render
  };

  private queueRebuild(): void {
    if (this.rebuildHandle) return;
    // Coalesce slider drags into at most one rebuild per frame.
    this.rebuildHandle = requestAnimationFrame(() => {
      this.rebuildHandle = 0;
      if (this.disposed || !this.parsed) return;
      this.removeModel();
      this.rebuild(false);
    });
  }

  private rebuild(initial: boolean): void {
    const parsed = this.parsed;
    if (!parsed) return;
    const t0 = performance.now();

    const built = buildModel(parsed, this.settings.depth, this.settings.bevel);
    this.built = built;
    this.uvAspect = null; // fresh geometry has no UVs yet
    this.scene.add(built.root);
    this.applyAppearance();

    this.options.onBuild?.({
      meshes: built.meshes.length,
      triangles: Math.round(built.triangles),
      ms: performance.now() - t0 + (initial ? parsed.parseMs : 0),
    });
  }

  /** Remove the current geometry. Materials are kept and reused by the next build. */
  private removeModel(): void {
    if (this.built) {
      this.scene.remove(this.built.root);
      disposeModel(this.built.root);
      this.built = null;
    }
    this.dirty = true;
  }

  // ───────────────────────────── appearance ─────────────────────────────

  /** Dispose every cached material whose key isn't in `keep`. */
  private pruneMaterials(keep: Set<string>): void {
    for (const [key, material] of this.materials) {
      if (keep.has(key)) continue;
      material.dispose();
      this.materials.delete(key);
    }
  }

  /**
   * FR-3.1 – FR-3.4, FR-3.6 — original / solid / gradient / texture, plus the material preset.
   * Materials are looked up by key and updated in place, so unchanged ones keep their compiled shader.
   */
  private applyAppearance(): void {
    const { built, parsed } = this;
    if (!built || !parsed) return;
    const s = this.settings;
    const preset = s.material;
    const customization = s.materialCustomization;
    const used = new Set<string>();
    // Build a cache key fragment from the customization values so slider changes create new materials
    const custKey = preset === 'custom' || customization
      ? `:c${customization.roughness.toFixed(2)}_${customization.metalness.toFixed(2)}_${customization.clearcoat.toFixed(2)}_${customization.clearcoatRoughness.toFixed(2)}_${customization.transmission.toFixed(2)}_${customization.opacity.toFixed(2)}_${customization.ior.toFixed(2)}_${customization.reflectivity.toFixed(2)}`
      : '';

    const acquire = (key: string, create: () => MeshStandardMaterial): MeshStandardMaterial => {
      used.add(key);
      let material = this.materials.get(key);
      if (!material) {
        material = create();
        this.materials.set(key, material);
      }
      return material;
    };

    if (s.colorMode !== 'texture') this.releaseTexture();

    switch (s.colorMode) {
      case 'solid': {
        const material = acquire(`solid:${preset}${custKey}`, () =>
          createMaterial(preset, { color: new Color(s.solidColor), opacity: 1, customization }),
        );
        material.color.set(s.solidColor);
        for (const mesh of built.meshes) mesh.material = material;
        break;
      }

      case 'gradient': {
        const paint = createUserPaint(s.gradient, parsed.bounds);
        const material = acquire(`gradient:${preset}${custKey}`, () =>
          createMaterial(preset, { color: WHITE, opacity: 1, vertexColors: true, customization }),
        );
        for (const mesh of built.meshes) {
          applyPaint(mesh.geometry, paint);
          mesh.userData.colorSource = 'user';
          mesh.material = material;
        }
        break;
      }

      case 'texture': {
        const map = this.ensureTexture();
        this.syncUvAspect((map?.userData.aspect as number | undefined) ?? 1);
        const material = acquire(`texture:${preset}${custKey}`, () =>
          createMaterial(preset, { color: WHITE, opacity: 1, customization }),
        );
        // While an image is still loading, show the solid color instead of a blank model.
        material.color.set(map ? '#ffffff' : s.solidColor);
        if (material.map !== map) {
          const hadMap = material.map !== null;
          material.map = map;
          if (hadMap !== (map !== null)) material.needsUpdate = true; // shader define changes
        }
        for (const mesh of built.meshes) mesh.material = material;
        if (map) this.applyTextureTransform();
        break;
      }

      default:
        this.applyOriginalColors(preset, acquire, custKey);
    }

    this.pruneMaterials(used);
    this.dirty = true;
    this.renderer.render(this.scene, this.camera);
  }

  /** Each path keeps its own SVG fill: flat colors share materials by color, gradients use vertex colors. */
  private applyOriginalColors(
    preset: GlyphSettings['material'],
    acquire: (key: string, create: () => MeshStandardMaterial) => MeshStandardMaterial,
    custKey: string,
  ): void {
    const { built } = this;
    if (!built) return;
    const customization = this.settings.materialCustomization;

    for (const mesh of built.meshes) {
      const color = mesh.userData.color as Color;
      const opacity = mesh.userData.opacity as number;
      const paint = mesh.userData.paint as PaintServer | null;

      let key: string;
      if (paint) {
        if (mesh.userData.colorSource !== 'svg') {
          applyPaint(mesh.geometry, paint);
          mesh.userData.colorSource = 'svg';
        }
        key = `original:${preset}:paint:${opacity.toFixed(2)}${custKey}`;
      } else {
        key = `original:${preset}:${color.getHexString()}:${opacity.toFixed(2)}${custKey}`;
      }
      mesh.material = acquire(key, () =>
        createMaterial(preset, { color, opacity, vertexColors: paint !== null, customization }),
      );
    }
  }

  /** Solid color changed: update all solid materials and mesh colors in place instantly. */
  private updateSolidColor(): void {
    const { built } = this;
    const color = new Color(this.settings.solidColor);
    if (built) {
      for (const mesh of built.meshes) {
        if (mesh.material && 'color' in mesh.material) {
          (mesh.material as MeshStandardMaterial).color.copy(color);
        }
      }
    }
    for (const [key, mat] of this.materials) {
      if (key.startsWith('solid:')) {
        mat.color.copy(color);
      }
    }
    this.dirty = true;
    this.renderer.render(this.scene, this.camera);
  }

  /** Gradient edited: only the vertex colors change — no new materials, no recompiles. */
  private rebakeGradient(): void {
    const { built, parsed } = this;
    if (!built || !parsed) return;
    const paint = createUserPaint(this.settings.gradient, parsed.bounds);
    for (const mesh of built.meshes) applyPaint(mesh.geometry, paint);
    this.dirty = true;
  }

  // ───────────────────────────── textures ─────────────────────────────

  /** Returns the texture for the current settings, or null while an image is still loading. */
  private ensureTexture(): Texture | null {
    const t = this.settings.texture;

    if (t.source === 'pattern') {
      const key = `p:${t.pattern}:${t.colorA}:${t.colorB}`;
      if (key !== this.textureKey || !this.texture) {
        this.imageToken++; // cancel any pending image load
        this.loadingKey = '';
        this.texture?.dispose();
        this.texture = createPatternTexture(t.pattern, t.colorA, t.colorB);
        this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.textureKey = key;
      }
      return this.texture;
    }

    if (!t.imageUrl) {
      this.releaseTexture();
      return null;
    }
    const key = `i:${t.imageUrl}`;
    if (key === this.textureKey && this.texture) return this.texture;
    // While a new image decodes, keep showing the previous image (if any) instead of flashing.
    const previousImage = () =>
      this.texture && this.textureKey.startsWith('i:') ? this.texture : null;
    if (key === this.loadingKey) return previousImage();

    this.loadingKey = key;
    const token = ++this.imageToken;
    loadImageTexture(t.imageUrl)
      .then((texture) => {
        if (this.disposed || token !== this.imageToken) {
          texture.dispose();
          return;
        }
        this.texture?.dispose();
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.texture = texture;
        this.textureKey = key;
        this.loadingKey = '';
        this.applyAppearance();
      })
      .catch(() => {
        if (this.disposed || token !== this.imageToken) return;
        this.loadingKey = '';
        this.options.onTextureError?.(
          'Glyph could not load that image. Try a PNG, JPG or WebP file.',
        );
      });
    return previousImage();
  }

  /** Free the texture (and cancel any pending load) when it is no longer in use. */
  private releaseTexture(): void {
    this.imageToken++;
    this.loadingKey = '';
    this.textureKey = '';
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  private applyTextureTransform(): void {
    const texture = this.texture;
    if (!texture) return;
    const t = this.settings.texture;
    texture.center.set(0.5, 0.5);
    texture.repeat.set(t.repeat, t.repeat);
    texture.rotation = (t.rotation * Math.PI) / 180;
    texture.offset.set(t.offsetX, t.offsetY);
    this.dirty = true;
  }

  /** (Re)generate planar UVs when missing or when the texture's aspect ratio changed. */
  private syncUvAspect(aspect: number): void {
    const { built, parsed } = this;
    if (!built || !parsed) return;
    if (this.uvAspect !== null && Math.abs(aspect - this.uvAspect) < 1e-6) return;
    for (const mesh of built.meshes as Mesh[]) {
      setPlanarUV(mesh.geometry, parsed.bounds, parsed.maxDim, aspect);
    }
    this.uvAspect = aspect;
  }

  // ────────────────────────── lights, background, camera ──────────────────────────

  private applyLighting(): void {
    if (this.lights) this.scene.remove(this.lights.group);
    this.lights = createLightRig(this.settings.lighting);
    this.scene.add(this.lights.group);
    this.updateEnvironmentProperties();
    this.dirty = true;
  }

  private applyBackground(): void {
    this.updateEnvironmentProperties();
  }

  private updateEnvironmentProperties(): void {
    const env = this.settings.environment;
    const baseRig = this.lights?.envIntensity ?? 1;
    const envIntensity = env.intensity * baseRig;
    this.scene.environmentIntensity = envIntensity;
    for (const mat of this.materials.values()) {
      mat.envMapIntensity = envIntensity;
    }

    const rad = (env.rotation * Math.PI) / 180;
    this.scene.environmentRotation.set(0, rad, 0);

    if (env.showBackground && this.activeEnv) {
      this.scene.background = this.activeEnv.backgroundTexture ?? this.activeEnv.target.texture;
      this.scene.backgroundBlurriness = env.backgroundBlur;
      this.scene.backgroundIntensity = env.backgroundIntensity;
      this.scene.backgroundRotation.set(0, rad, 0);
    } else {
      this.scene.background = null;
      this.renderer.setClearColor(
        new Color(this.settings.background),
        this.settings.transparentBackground ? 0 : 1,
      );
    }
    this.dirty = true;
  }

  private applyEnvironment(): void {
    const s = this.settings.environment;
    const key = s.id === 'custom' ? `custom:${s.customUrl ?? ''}` : `preset:${s.id}`;

    const cached = this.envCache.get(key);
    if (cached) {
      this.activeEnv = cached;
      this.scene.environment = cached.target.texture;
      this.updateEnvironmentProperties();
      return;
    }

    const token = ++this.envToken;

    // 1. Built-in procedural environments
    if (s.id === 'cyberpunk') {
      const scene = createCyberpunkScene();
      const target = this.pmrem.fromScene(scene, 0.04);
      const entry = { target, backgroundTexture: null };
      this.envCache.set(key, entry);
      this.activeEnv = entry;
      this.scene.environment = target.texture;
      this.updateEnvironmentProperties();
      return;
    }

    // 2. Custom user-uploaded file (HDR or equirectangular image)
    if (s.id === 'custom') {
      if (!s.customUrl) {
        this.settings = { ...this.settings, environment: { ...this.settings.environment, id: 'studio' } };
        this.applyEnvironment();
        return;
      }

      const isHdr = s.customName?.toLowerCase().endsWith('.hdr') || (s.customUrl.startsWith('blob:') && (s.customName?.toLowerCase().endsWith('.hdr') ?? true));
      if (isHdr) {
        new RGBELoader().load(
          s.customUrl,
          (texture) => {
            if (this.disposed || token !== this.envToken) {
              texture.dispose();
              return;
            }
            texture.mapping = EquirectangularReflectionMapping;
            const target = this.pmrem.fromEquirectangular(texture);
            const entry = { target, backgroundTexture: texture };
            this.envCache.set(key, entry);
            this.activeEnv = entry;
            this.scene.environment = target.texture;
            this.updateEnvironmentProperties();
          },
          undefined,
          () => {
            if (this.disposed || token !== this.envToken) return;
            this.options.onTextureError?.('Could not load that HDR file. Make sure it is a valid Radiance .hdr file.');
          },
        );
      } else {
        new TextureLoader().load(
          s.customUrl,
          (texture) => {
            if (this.disposed || token !== this.envToken) {
              texture.dispose();
              return;
            }
            texture.mapping = EquirectangularReflectionMapping;
            const target = this.pmrem.fromEquirectangular(texture);
            const entry = { target, backgroundTexture: texture };
            this.envCache.set(key, entry);
            this.activeEnv = entry;
            this.scene.environment = target.texture;
            this.updateEnvironmentProperties();
          },
          undefined,
          () => {
            if (this.disposed || token !== this.envToken) return;
            this.options.onTextureError?.('Could not load that environment image.');
          },
        );
      }
      return;
    }

    // 3. HDR Presets loaded from local assets
    const preset = getEnvironmentPreset(s.id);
    if (!preset) {
      this.settings = { ...this.settings, environment: { ...this.settings.environment, id: 'studio' } };
      this.applyEnvironment();
      return;
    }
    if (!preset.url) return;

    const loadWithFallback = (url: string, fallback?: string) => {
      new RGBELoader().load(
        url,
        (texture) => {
          if (this.disposed || token !== this.envToken) {
            texture.dispose();
            return;
          }
          texture.mapping = EquirectangularReflectionMapping;
          const target = this.pmrem.fromEquirectangular(texture);
          const entry = { target, backgroundTexture: texture };
          this.envCache.set(key, entry);
          this.activeEnv = entry;
          this.scene.environment = target.texture;
          this.updateEnvironmentProperties();
        },
        undefined,
        () => {
          if (fallback && url !== fallback) {
            loadWithFallback(fallback);
          } else {
            if (this.disposed || token !== this.envToken) return;
            // Fallback to RoomEnvironment so the scene never renders without lighting
            const room = new RoomEnvironment();
            const target = this.pmrem.fromScene(room, 0.04);
            room.dispose();
            const entry = { target, backgroundTexture: null };
            this.envCache.set(key, entry);
            this.activeEnv = entry;
            this.scene.environment = target.texture;
            this.updateEnvironmentProperties();
            this.options.onTextureError?.(
              `Could not load ${preset.name} environment. Falling back to default studio lighting.`,
            );
          }
        },
      );
    };

    loadWithFallback(preset.url, preset.fallbackUrl);
  }

  /** FR-4.5 — frame the whole model, with a slight 3/4 angle so depth reads immediately. */
  private fitCamera(): void {
    if (!this.built) return;
    const box = new Box3().setFromObject(this.built.root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    const halfFov = (this.camera.fov * Math.PI) / 360;
    const fitHeight = size.y / 2 / Math.tan(halfFov);
    const fitWidth = size.x / 2 / (Math.tan(halfFov) * this.camera.aspect);
    const distance = Math.max(fitHeight, fitWidth) * 1.35 + size.z / 2;

    const direction = new Vector3(0.38, 0.28, 1).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.minDistance = distance * 0.25;
    this.controls.maxDistance = distance * 3.5;
    this.controls.update();

    this.userMoved = false;
    this.dirty = true;
  }

  private resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Keep the model fully visible as the layout changes, unless the user has taken over the camera.
    if (this.built && !this.userMoved) this.fitCamera();
    this.dirty = true;
  }
}

/** Pattern, colors or image changed — the texture itself must be regenerated. */
function textureSourceChanged(a: TextureSettings, b: TextureSettings): boolean {
  return (
    a.source !== b.source ||
    a.pattern !== b.pattern ||
    a.colorA !== b.colorA ||
    a.colorB !== b.colorB ||
    a.imageUrl !== b.imageUrl
  );
}

/** Only placement changed — move the existing texture. */
function transformChanged(a: TextureSettings, b: TextureSettings): boolean {
  return (
    a.repeat !== b.repeat ||
    a.rotation !== b.rotation ||
    a.offsetX !== b.offsetX ||
    a.offsetY !== b.offsetY
  );
}
