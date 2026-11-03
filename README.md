# Glyph

**A real-time framework for 3D geometry synthesis from Scalable Vector Graphics.**

Drop in an SVG and Glyph parses its paths, extrudes each one into a 3D mesh, and renders it live in the browser with physically-based materials and HDR environment lighting. Restyle with original colors, a flat color, gradient, or texture; fine-tune PBR material properties; switch between HDR environments; orbit around it; and export as PNG, turntable video, or a full 3D glTF model. Everything runs client-side — files never leave the browser.
Live Link : https://glyphbd.netlify.app/
Project report / PRD: [`docs/Glyph_PRD.pdf`](docs/Glyph_PRD.pdf) — Tejgaon College, Dept. of CSE.

System design & architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — complete module walkthrough.

Software Requirements Specification: [`docs/SRS.md`](docs/SRS.md) — IEEE 830 compliant project details & requirements.

## Getting started

Requires Node.js 20.3+ (see `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm run preview    # serve the production build
npm run typecheck  # astro sync + tsc --noEmit
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, …).

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Astro 5 (static output, one React island) |
| UI | React 19 + Tailwind CSS 4 |
| 3D | Three.js ^0.170 (WebGL) — `SVGLoader`, `ExtrudeGeometry`, `OrbitControls`, `MeshPhysicalMaterial`, `PMREMGenerator` |
| Export | PNG (`canvas.toBlob`), Video (`MediaRecorder` + `captureStream`), glTF 2.0 (`GLTFExporter`) |
| State | React hooks |

## Project structure

```
src/
  pages/index.astro        Page shell; mounts the editor island
  layouts/Layout.astro     <head>, meta, global CSS
  components/
    GlyphApp.tsx           App state, upload, drag & drop, export, layout
    ControlPanel.tsx       4-tab sidebar: Style, Material, HDR Env, Scene
    Viewport.tsx           React wrapper around the Three.js scene
    FillEditor.tsx         Solid / gradient / texture editors
    MaterialEditor.tsx     PBR material customization (roughness, metalness, etc.)
    EnvironmentEditor.tsx  HDR environment selection & tuning
    ExportModal.tsx        Export dialog (PNG / Video / glTF)
    ui.tsx, icons.tsx      shadcn-style primitives and icons
  lib/
    svgParser.ts           Validation + SVG → shapes/fills       (Upload, Parser)
    model.ts               Shapes → extruded meshes, gradient    (Geometry Engine)
    materials.ts           PBR material factory + custom presets  (Material Manager)
    lighting.ts            studio / soft / dramatic rigs
    environments.ts        8 HDR environments + procedural scenes
    scene.ts               Renderer, camera, controls, export    (Viewport, Export)
    gradients.ts           SVG gradient resolver + editor gradients
    patterns.ts            Procedural 2D patterns (no three.js — loads with the UI)
    textures.ts, presets.ts  Three.js textures, built-in colors / gradients / patterns
    constants.ts           File-size limits
    types.ts               Settings and data types
  assets/sample-logo.svg   Built-in sample
```

## Features

### Fill Customisation

| Mode | Built-in | Custom |
| --- | --- | --- |
| Original | Each path's own SVG fill, including linear and radial gradients | — |
| Solid | 14 preset swatches | Color picker + hex input |
| Gradient | 8 presets | Linear/radial, 2–5 stops (add, remove, reorder by position), angle, reverse |
| Texture | 7 procedural patterns (checker, stripes, dots, grid, grain, marble, wood) with editable colors | Upload or drop your own image; scale, rotation and offset |

### Material Customisation

5 material presets (Matte, Glossy, Metal, Glass, Custom) with full PBR overrides:

| Property | Range | Description |
| --- | --- | --- |
| Roughness | 0–100% | Mirror-smooth → fully diffuse |
| Metalness | 0–100% | Dielectric → full metal |
| Clearcoat | 0–100% | Lacquer layer intensity (car paint / varnish) |
| Clearcoat Roughness | 0–100% | Roughness of the clearcoat film |
| Transmission | 0–100% | See-through glass / crystal |
| Opacity | 0–100% | Overall surface opacity |
| IOR | 1.0–2.5 | Index of refraction (1.0 = air, 1.5 = glass, 2.42 = diamond) |
| Reflectivity | 0–200% | Environment reflection intensity |

Selecting a preset seeds all sliders with its base values. Switch to **Custom** for full manual control.

### HDR Environments

8 built-in environments across 5 categories (Studio, Outdoor, Sunset, Night, Stylized):

- **3 procedural** (instant, offline): Studio Room, Cyberpunk Neon, Warm Sunset Glow
- **5 HDR** (loaded from CDN with fallback): Venice Sunset, Royal Esplanade, San Giuseppe Bridge, Blouberg Sunrise, Moonless Night
- **Custom HDRI upload**: .hdr files or equirectangular panorama images
- **Drag-and-drop**: Drop a .hdr file anywhere on the viewport

Tuning controls: lighting intensity (0–300%), rotation (0–360°), show as background, background blur, background brightness.

### Export

| Format | Description |
| --- | --- |
| **PNG** | Standard or 2× high-res; optional transparent background (preserves HDR reflections and lighting) |
| **Turntable Video** | 360° rotation; configurable FPS (30/60) and duration (4/6/8s); transparent WebM alpha support |
| **3D glTF** | Binary `.glb` or JSON `.gltf`; full geometry, PBR materials; compatible with Blender, Figma, AR Quick Look |

## UI

shadcn/ui-style design: neutral zinc tokens, light and dark themes (toggle in the header,
remembered), 4-tab sidebar (Style / Material / HDR Env / Scene), and a sticky export button with modal dialog.

### Responsive layout

| Width | Layout |
| --- | --- |
| < 768 px (phones) | 3D view on top, controls in a panel underneath — the model stays visible while you edit |
| ≥ 768 px (tablet, desktop) | Docked sidebar (300 px, 340 px from 1024 px) beside the 3D view |

Touch screens get larger buttons, sliders and swatches (≥ 40 px), 16 px text inputs (no iOS
focus-zoom) and pinch / two-finger gestures in the viewport.

## Performance

- **Lazy 3D engine.** three.js is code-split into its own cacheable chunk and loaded in
  parallel with the UI; the parser is prefetched shortly after load. The first paint needs
  only React and the interface.
- **Render on demand.** The canvas only redraws when the camera or the scene changes.
- **No shader recompiles while dragging.** Materials are cached and updated in place, so
  moving a color, gradient or texture slider never rebuilds a shader. Gradient edits only
  rewrite vertex colors (in the existing GPU buffer); texture UVs are generated only when a
  texture is in use.
- **Coalesced rebuilds.** Depth and bevel sliders trigger at most one geometry rebuild per
  frame.
- **Environment caching.** PMREM-filtered environment maps are cached by configuration key.
- Pixel ratio capped at 2, image textures downscaled to 2048 px, textures and geometry
  disposed when no longer used, WebGL context loss handled.

## Notes and limits

- Only filled paths are extruded. Stroke-only paths are skipped (Glyph tells you how many); convert strokes to outlines in your design tool first.
- `<pattern>` fills fall back to neutral gray in *Original* mode (Glyph tells you how many); SVG gradients are supported.
- PNG export is capped at 4096 px on the longest side.
- Video export uses `MediaRecorder` + `canvas.captureStream()` — requires a modern browser (Chrome, Edge, Firefox).
