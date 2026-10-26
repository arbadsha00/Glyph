# Software Requirements Specification (SRS)
## Project: Glyph — Real-Time 3D Vector Geometry Synthesis & Rendering Platform

**Document Version:** 1.0.0  
**Status:** Approved / Production  
**Standard:** IEEE 830-1998 Compliant  
**Target System:** Client-Side Web Application (In-Browser WebGL/WebGPU-ready)

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 Purpose
   - 1.2 Document Conventions
   - 1.3 Intended Audience & Reading Suggestions
   - 1.4 Project Scope
   - 1.5 References
2. [Overall Description](#2-overall-description)
   - 2.1 Product Perspective
   - 2.2 Product Features Summary
   - 2.3 User Classes & Personas
   - 2.4 Operating Environment
   - 2.5 Design & Implementation Constraints
   - 2.6 Assumptions & Dependencies
3. [System Architecture & Design](#3-system-architecture--design)
   - 3.1 High-Level Architecture
   - 3.2 State Management & Unidirectional Data Flow
   - 3.3 Three.js Scene Engine & Lifecycle
   - 3.4 Material Shader Cache & Instant Updates Architecture
   - 3.5 Extrusion & Tessellation Pipeline
4. [Functional Requirements](#4-functional-requirements)
   - 4.1 Module 1: Vector Ingestion & SVG Parsing Engine
   - 4.2 Module 2: 3D Parametric Geometry Synthesis
   - 4.3 Module 3: Physically-Based Rendering (PBR) & Material Customization
   - 4.4 Module 4: High Dynamic Range (HDR) Environment Lighting (IBL)
   - 4.5 Module 5: Fill Modes & Texture Projection Subsystem
   - 4.6 Module 6: Camera Orbit & Interactive Viewport Controls
   - 4.7 Module 7: Multi-Format Production Export Pipeline
   - 4.8 Module 8: Responsive Layout, Ergonomics & Accessibility
5. [External Interface Requirements](#5-external-interface-requirements)
   - 5.1 User Interface (UI) Specification
   - 5.2 Hardware & GPU Interfaces
   - 5.3 Software & Library Interfaces
   - 5.4 File Format Specifications
6. [Non-Functional Requirements (NFR)](#6-non-functional-requirements-nfr)
   - 6.1 Performance & Latency
   - 6.2 Reliability & Fault Tolerance
   - 6.3 Security & Privacy
   - 6.4 Maintainability & Extensibility
7. [Verification, Validation & Acceptance Criteria](#7-verification-validation--acceptance-criteria)

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) provides a complete, authoritative description of the functional, non-functional, and architectural requirements for **Glyph**, an in-browser platform that transforms 2D Scalable Vector Graphics (SVG) into production-grade 3D meshes with real-time physically-based rendering (PBR), High Dynamic Range (HDR) image-based lighting, and professional export pipelines (ultra-high resolution transparent PNGs, 360° turntable video recordings, and standard 3D glTF/GLB models).

### 1.2 Document Conventions
- **MUST / SHALL**: Absolute requirements for compliance.
- **SHOULD**: Highly recommended features implemented unless technical blocks exist.
- **MAY**: Optional capability or enhancement.
- **FR-[n].[m]**: Functional Requirement identifier.
- **NFR-[n].[m]**: Non-Functional Requirement identifier.

### 1.3 Intended Audience & Reading Suggestions
- **Frontend & 3D Graphics Engineers**: Review Sections 3 (Architecture), 4 (Functional Requirements), and 6 (Performance).
- **UI/UX Designers**: Review Section 4.8 (Ergonomics) and Section 5.1 (UI Specifications).
- **QA & Test Engineers**: Review Section 7 (Acceptance Criteria & Verification).
- **Project Stakeholders**: Review Section 2 (Product Perspective & Features).

### 1.4 Project Scope
Glyph executes entirely inside the client’s browser sandbox using standard Web APIs, WebGL 2.0, HTML5 Canvas, and WebAssembly/JavaScript. It eliminates server-side 3D rendering queues, subscriptions, and native 3D software overhead (e.g., Blender, Maya) for web designers, vector illustrators, brand teams, and 3D digital artists.

### 1.5 References
1. IEEE Std 830-1998: *Recommended Practice for Software Requirements Specifications*.
2. W3C Scalable Vector Graphics (SVG) 1.1 / 2.0 Specifications.
3. Khronos Group glTF™ 2.0 (GL Transmission Format) Specification.
4. Three.js Documentation (r170) & Physically Based Rendering (PBR) standards.
5. Radiance High Dynamic Range (.hdr / RGBE) Image Format Specification.

---

## 2. Overall Description

### 2.1 Product Perspective
Glyph is an autonomous single-page web application. It integrates reactive DOM-based UI controls with an imperative WebGL graphics engine. 

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     User Inputs       │       │    SVG / HDR Files    │  │
│  └──────────┬────────────┘       └──────────┬────────────┘  │
│             │                               │               │
│             ▼                               ▼               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                React 19 State Layer                   │  │
│  │   (GlyphSettings, Viewport State, Theme, Export Modal)│  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ update(settings)              │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           GlyphScene Three.js 3D Engine               │  │
│  │  - SVG Path Parser       - Parametric Extruder        │  │
│  │  - PBR Material Cache    - PMREM HDR IBL Lighting     │  │
│  │  - Orbit Camera Controls - Canvas Export Capture      │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ WebGL Draw Calls              │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     HTML5 Canvas                      │  │
│  │     (Interactive 60 FPS Viewport + Hardware Render)   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Product Features Summary
1. **Instant Drag-and-Drop Ingestion**: Parse complex multi-path SVGs, SVG linear/radial gradients, and embedded shapes in under 50 milliseconds.
2. **Parametric Extrusion & Beveling**: Real-time extrusion depth (1–100px) and bevel radius (0–50%) calculation with hole detection (winding rule parity).
3. **PBR Material Customization**: Real-time customization of Metallic, Roughness, Clearcoat, Clearcoat Roughness, Transmission (refractive glass), Opacity, IOR, and Reflectivity.
4. **Preset Materials**: Instant selection between **Metallic** (Default), **Glossy**, **Matte**, **Glass**, and **Custom**.
5. **HDR Environment Image-Based Lighting**: Pre-filtered Environment Map (PMREM) generator using local high-resolution HDR environments (Photo Studio, Green Park, Golden Sunset, City Night), procedural Cyberpunk chamber, and custom `.hdr`/`.exr` equirectangular environments.
6. **Instant Color & Texture Updates**: Instantaneous color swatch selection, custom hex input, linear/radial multi-stop CSS gradient vertex baking, and procedural image textures without geometry re-computation.
7. **Comprehensive Export Options**:
   - High-resolution transparent PNG (1×, 2×, 4× scale) with preserved HDR lighting and reflections.
   - Smooth 360° turntable WebM/MP4 rotation video (30 / 60 FPS, 4s / 6s / 8s duration).
   - Standard 3D glTF 2.0 (Binary `.glb` and JSON `.gltf`) with embedded materials.

### 2.3 User Classes & Personas
- **UI/UX & Brand Designers**: Need 3D icons and vector logos rendered quickly without opening native 3D software.
- **Motion Designers & Marketers**: Export turntable animations and transparent assets for web and video presentations.
- **Frontend Web Developers**: Export lightweight glTF/GLB models directly into web projects.

### 2.4 Operating Environment
- **Browser Compatibility**: Chrome 90+, Firefox 90+, Safari 15.4+, Edge 90+.
- **Graphics Pipeline**: WebGL 2.0 with hardware acceleration enabled.
- **Responsive Viewport**: Desktop (sidebar layout) down to mobile (docked bottom sheet).

---

## 3. System Architecture & Design

### 3.1 Architectural Principles
- **Separation of Concerns**: React owns the UI state (`GlyphSettings`). Three.js owns the GPU scene graph and WebGL context.
- **Zero-Latency Differential Updates**: Modifying a surface color or slider does NOT trigger an expensive geometry re-tessellation. Each change routes through the lowest-cost path:
  1. *Color change*: In-place uniform update on mesh material (`material.color.set()`), synchronous render.
  2. *Slider customization*: Material cache lookup (`acquire()`) with composite key.
  3. *Lighting/Env*: Environment rotation and PMREM intensity updates.
  4. *Depth/Bevel*: Debounced geometry extrusion rebuild.

### 3.2 State Management & Settings Schema
The system state is defined by the immutable `GlyphSettings` object:
```typescript
interface GlyphSettings {
  colorMode: 'original' | 'solid' | 'gradient' | 'texture';
  solidColor: string;
  gradient: GradientSettings;
  texture: TextureSettings;
  material: 'matte' | 'glossy' | 'metallic' | 'glass' | 'custom';
  materialCustomization: MaterialCustomization;
  lighting: 'studio' | 'soft' | 'dramatic';
  environment: EnvironmentSettings;
  export: ExportSettings;
  depth: number;
  bevel: number;
  background: string;
  transparentBackground: boolean;
}
```

### 3.3 Default Material Configuration
- **Default Preset**: `metallic`
- **Default PBR Properties**:
  - `metalness`: 1.0 (Full metallic specular conduction)
  - `roughness`: 0.28 (Smooth metallic sheen)
  - `reflectivity`: 0.8
  - `ior`: 1.5
  - `clearcoat`: 0.0
  - `transmission`: 0.0
  - `opacity`: 1.0
  - `envMapIntensity`: 1.0 (Vibrant HDR reflection capture)

### 3.4 Instant Solid Color Architecture
```
User clicks Swatch / Color Picker
       │
       ▼
React setSettings({ solidColor, colorMode: 'solid' })
       │
       ▼
Viewport useEffect triggers scene.update(settings)
       │
       ▼
scene.ts -> updateSolidColor()
       │
       ├─► Iterate built.meshes -> mesh.material.color.copy(newColor)
       ├─► Iterate materials cache -> mat.color.copy(newColor)
       ├─► dirty = true
       └─► renderer.render(scene, camera) [Synchronous GPU Draw]
```
*Result: Exact 0-millisecond perceptual delay.*

---

## 4. Functional Requirements

### 4.1 Module 1: Vector Ingestion & SVG Parsing Engine
- **FR-1.1**: The system SHALL accept SVG files via drag-and-drop onto the viewport or via native file dialog.
- **FR-1.2**: The parser SHALL extract path definitions (`<path>`, `<rect>`, `<circle>`, `<polygon>`) and convert them into Three.js `Shape` and `Path` contours.
- **FR-1.3**: The parser SHALL correctly compute compound shapes containing inner holes (e.g., characters like 'O', 'B', 'P') using even-odd or non-zero fill winding rules.
- **FR-1.4**: The system SHALL detect and parse native SVG gradients (`<linearGradient>`, `<radialGradient>`) and compute average representative colors for fallback display.
- **FR-1.5**: If the SVG contains unsupported elements or errors, the system SHALL display non-blocking error notifications without crashing the WebGL context.

### 4.2 Module 2: 3D Parametric Geometry Synthesis
- **FR-2.1**: The system SHALL generate a 3D manifold mesh by extruding 2D shapes along the Z-axis.
- **FR-2.2**: The extrusion depth SHALL be parametrically adjustable from 1 unit to 100 units.
- **FR-2.3**: The bevel offset and bevel thickness SHALL be adjustable from 0% (sharp edge) to 50% (smooth filleted edge).
- **FR-2.4**: The geometry builder SHALL automatically center the synthesized 3D model at the origin `(0, 0, 0)` and normalize scale.
- **FR-2.5**: The system SHALL compute vertex normals with smooth shading across curved contours.

### 4.3 Module 3: Physically-Based Rendering (PBR) & Material Customization
- **FR-3.1**: The system SHALL support Five Material Presets:
  1. **Metallic (Default)**: `metalness: 1.0`, `roughness: 0.28`, `reflectivity: 0.8`.
  2. **Glossy**: `metalness: 0.05`, `roughness: 0.20`, `clearcoat: 1.0`.
  3. **Matte**: `metalness: 0.0`, `roughness: 0.88`, `clearcoat: 0.0`.
  4. **Glass**: `transmission: 1.0`, `roughness: 0.05`, `ior: 1.5`, `transparent: true`.
  5. **Custom**: Free slider control over all physical parameters.
- **FR-3.2**: When switching presets, the UI sliders SHALL automatically seed with the preset's calibrated base values.
- **FR-3.3**: The material system SHALL utilize Three.js `MeshPhysicalMaterial` for full PBR energy conservation and accurate Fresnel reflections.
- **FR-3.4**: When adjusting any material slider, the material cache SHALL dynamically update without re-extruding geometry.

### 4.4 Module 4: High Dynamic Range (HDR) Environment Lighting (IBL)
- **FR-4.1**: The system SHALL provide local bundled and procedural HDR environments categorized into Studio, Outdoor, Sunset, Night, and Stylized:
  - **Photo Studio**: Neutral softbox studio lighting loaded from local asset (`/hdr preset/studio.hdr`).
  - **Green Park**: Natural open daylight park atmosphere loaded from local asset (`/hdr preset/park.hdr`).
  - **Golden Sunset**: Warm twilight horizon lighting loaded from local asset (`/hdr preset/sunset.hdr`).
  - **City Night**: Deep nocturnal contrast and crisp specular reflections loaded from local asset (`/hdr preset/night.hdr`).
  - **Cyberpunk Neon**: Procedural high-contrast neon cyan and magenta illumination.
- **FR-4.2**: The system SHALL load built-in HDR presets directly from local assets in `public/hdr preset/` for zero-latency switching without external network or CDN dependencies.
- **FR-4.3**: The system SHALL accept custom `.hdr` (Radiance RGBE) and `.exr` environment files dragged directly into the viewport or uploaded via file picker.
- **FR-4.4**: The environment map SHALL be pre-filtered using `PMREMGenerator` for real-time specular convolutions.
- **FR-4.5**: In the event that an HDR preset fails to decode, the engine SHALL automatically fall back to Three.js `RoomEnvironment` to prevent unlit models.
- **FR-4.6**: The system SHALL allow users to:
  - Toggle environment background visibility independently from object reflections.
  - Rotate environment map from 0° to 360°.
  - Adjust environment reflection intensity from 0% to 300%.
  - Adjust background blurriness (0.0 to 1.0) and background intensity (0% to 300%).

### 4.5 Module 5: Fill Modes & Texture Projection Subsystem
- **FR-5.1**: The system SHALL provide four fill modes:
  - **Original**: Retains individual colors and SVG gradients from the source file.
  - **Solid**: Unifies all paths under a single solid color with instant swatch clicking and hex editing.
  - **Gradient**: Projects a custom linear or radial multi-stop gradient directly into vertex colors.
  - **Texture**: Projects planar procedural patterns (grid, dots, checker, stripes) or user-uploaded images.
- **FR-5.2**: The solid color editor SHALL provide 12 quick-pick curated swatches and a native color picker with manual hex input.
- **FR-5.3**: Clicking any solid swatch SHALL update the 3D model color instantaneously (<16ms).

### 4.6 Module 6: Camera Orbit & Interactive Viewport Controls
- **FR-6.1**: The viewport SHALL support 1-finger / left-click drag orbit rotation around the model's center.
- **FR-6.2**: The viewport SHALL support pinch / mouse wheel zoom with bounded minimum and maximum distances.
- **FR-6.3**: The viewport SHALL support 2-finger / right-click pan across the screen space.
- **FR-6.4**: The system SHALL provide Viewport Overlay actions:
  - Reset Camera to default 3/4 framing.
  - Zoom In (+20%) and Zoom Out (-20%).
  - Quick Export button.

### 4.7 Module 7: Multi-Format Production Export Pipeline
- **FR-7.1 Transparent PNG Export**:
  - The system SHALL export the current scene as a 32-bit PNG with transparent alpha channel.
  - When exporting with transparent background, the system SHALL temporarily suppress the canvas background and HDR panorama while preserving all lighting, material reflections, and shadows on the 3D model.
  - Supported resolution multipliers: 1× (viewport resolution), 2×, and 4× up to 4096px max dimension.
- **FR-7.2 Turntable Video Export**:
  - The system SHALL render a complete 360° rotation video of the model around its vertical axis.
  - Supported frame rates: 30 FPS and 60 FPS.
  - Supported durations: 4 seconds, 6 seconds, and 8 seconds.
  - Supported formats: WebM (VP9/VP8) with alpha transparency support, or MP4 fallback.
  - The system SHALL display a real-time progress bar during video capture.
- **FR-7.3 3D glTF / GLB Export**:
  - The system SHALL export the extruded 3D mesh as standard glTF 2.0.
  - Formats: Binary `.glb` (single file with embedded textures/materials) or JSON `.gltf`.

### 4.8 Module 8: Responsive Layout, Ergonomics & Accessibility
- **FR-8.1**: On desktop screens (>= 768px), controls SHALL dock into a 320px–340px sidebar with 4 tabs:
  - **Style Tab**: Geometry depth, bevel, and Fill mode.
  - **Material Tab**: Preset selector and PBR sliders.
  - **HDR Env Tab**: Environment selector, rotation, intensity, and blur.
  - **Scene Tab**: Directional light presets, background color, and export triggers.
- **FR-8.2**: On mobile screens (< 768px), controls SHALL display as a touch-friendly bottom sheet keeping the 3D viewport visible at all times.
- **FR-8.3**: All interactive buttons, sliders, and swatches SHALL have explicit `aria-label`, `role`, and keyboard navigation support (`Enter`, `Tab`).
- **FR-8.4**: The system SHALL support Dark Mode and Light Mode with seamless theme switching.

---

## 5. External Interface Requirements

### 5.1 User Interfaces
- **Viewport Canvas**: Interactive WebGL canvas occupying all available space.
- **Floating Header**: Application title, sample model loader, theme toggle, and export trigger.
- **Sidebar Tabs**: Segmented control with instant switching between Style, Material, HDR Env, and Scene.
- **Modal Dialogs**: Export configuration modal with tabs for PNG, Video, and 3D glTF.

### 5.2 Hardware & GPU Interfaces
- **Target GPU**: Intel UHD 620 equivalent or higher, Apple Silicon M-series, NVIDIA GeForce / AMD Radeon.
- **Device Pixel Ratio**: Automatic adaptation to Retina / High-DPI screens (`Math.min(window.devicePixelRatio, 2)`).
- **Context Loss Handling**: Listeners for `webglcontextlost` and `webglcontextrestored` to recover scene resources gracefully after OS GPU interruptions.

### 5.3 Software & Library Interfaces
| Dependency | Version | Purpose |
| :--- | :--- | :--- |
| **Astro** | `^5.13.0` | Ultra-fast application shell & static build framework |
| **React / React DOM** | `^19.1.0` | Declarative UI component tree & state management |
| **Three.js** | `^0.170.0` | WebGL 3D graphics engine, PMREM, MeshPhysicalMaterial |
| **TailwindCSS** | `^4.1.0` | Design tokens, typography, and responsive layouts |

---

## 6. Non-Functional Requirements (NFR)

### 6.1 Performance & Latency
- **NFR-1 (Frame Rate)**: The 3D viewport SHALL maintain a steady 60 FPS during camera orbit and turntable animations on standard desktop hardware.
- **NFR-2 (Solid Color Latency)**: Modifying a solid color swatch SHALL reflect on screen in under 16 milliseconds (1 frame).
- **NFR-3 (Extrusion Latency)**: Extruding an average SVG (< 50 paths) SHALL complete in under 50 milliseconds.
- **NFR-4 (Memory Management)**: Disposed geometries, textures, render targets, and materials SHALL be explicitly released (`dispose()`) to prevent memory leaks during extended user sessions.

### 6.2 Reliability & Fault Tolerance
- **NFR-5**: Malformed SVG paths SHALL be caught by triangulation try/catch blocks and reported via toast notification without freezing the UI.
- **NFR-6**: Large images uploaded as textures (> 5MB or > 4096px) SHALL be rejected with human-friendly guidance.

### 6.3 Security & Privacy
- **NFR-7 (Client-Side Privacy)**: All SVGs, textures, HDR panoramas, and exported media SHALL be processed strictly inside browser memory. No vector artwork or user assets are ever uploaded to an external server.
- **NFR-8 (Sanitization)**: Ingested SVG XML SHALL be parsed via DOMParser inside an isolated document to neutralize script injection (`<script>`, `onload`).

---

## 7. Verification, Validation & Acceptance Criteria

| Req ID | Verification Method | Acceptance Criteria |
| :--- | :--- | :--- |
| **FR-1.1** | Manual Test / Automation | Dragging `.svg` into viewport instantly parses and displays 3D model. |
| **FR-3.1** | Visual Verification | Default material preset is **Metallic** with high specular reflection and smooth roughness (`0.28`). |
| **FR-4.2** | File Upload Test | Uploading `.hdr` sets IBL reflections immediately on metallic surface. |
| **FR-5.3** | Interactive Test | Clicking any color swatch changes the 3D model color with 0 perceptible lag. |
| **FR-7.1** | Export Inspection | Exported PNG has transparent background while preserving all HDR reflections on the object. |
| **FR-7.2** | Video Playback Test | Exported WebM/MP4 plays 360° smooth turntable rotation. |
| **FR-7.3** | 3D Viewer Verification | Exported `.glb` opens in standard glTF viewers (e.g. Windows 3D Viewer, Babylon.js sandbox) with correct geometry and materials. |

---

*End of Software Requirements Specification (SRS).*
