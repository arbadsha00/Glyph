import {
  BackSide,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
} from 'three';
import type { EnvironmentId } from './types';

export type EnvironmentCategory = 'Studio' | 'Outdoor' | 'Sunset' | 'Night' | 'Stylized';

export interface EnvironmentPreset {
  id: EnvironmentId;
  name: string;
  category: EnvironmentCategory;
  description: string;
  type: 'procedural' | 'hdr';
  url?: string;
  fallbackUrl?: string;
  previewGradient: string;
  badge?: string;
}

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'studio',
    name: 'Photo Studio',
    category: 'Studio',
    description: 'Clean, neutral studio lighting with softbox diffusers and professional reflections.',
    type: 'hdr',
    url: '/hdr%20preset/studio.hdr',
    fallbackUrl: '/hdr preset/studio.hdr',
    previewGradient: 'radial-gradient(circle at 50% 30%, #a1a1aa, #3f3f46 60%, #18181b 100%)',
    badge: 'Local HDR',
  },
  {
    id: 'park',
    name: 'Green Park',
    category: 'Outdoor',
    description: 'Vibrant open park with lush green trees, natural daylight, and soft sky ambient.',
    type: 'hdr',
    url: '/hdr%20preset/park.hdr',
    fallbackUrl: '/hdr preset/park.hdr',
    previewGradient: 'linear-gradient(135deg, #38bdf8 0%, #22c55e 50%, #166534 100%)',
    badge: 'Local HDR',
  },
  {
    id: 'sunset',
    name: 'Golden Sunset',
    category: 'Sunset',
    description: 'Warm golden hour horizon with rich orange, amber, and purple ambient lighting.',
    type: 'hdr',
    url: '/hdr%20preset/sunset.hdr',
    fallbackUrl: '/hdr preset/sunset.hdr',
    previewGradient: 'linear-gradient(135deg, #fb923c 0%, #db2777 50%, #4338ca 100%)',
    badge: 'Local HDR',
  },
  {
    id: 'night',
    name: 'City Night',
    category: 'Night',
    description: 'Deep nocturnal atmosphere with high-contrast reflections and crisp specular highlights.',
    type: 'hdr',
    url: '/hdr%20preset/night.hdr',
    fallbackUrl: '/hdr preset/night.hdr',
    previewGradient: 'radial-gradient(circle at 60% 40%, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
    badge: 'Local HDR',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'Stylized',
    description: 'High-energy chamber illuminated by intense cyan and magenta neon light tubes.',
    type: 'procedural',
    previewGradient: 'linear-gradient(135deg, #06b6d4 0%, #1e1b4b 50%, #ec4899 100%)',
    badge: 'Stylized',
  },
];

export function getEnvironmentPreset(id: EnvironmentId): EnvironmentPreset | undefined {
  return ENVIRONMENT_PRESETS.find((p) => p.id === id);
}

/** Procedural multi-colored neon light chamber for high-impact metallic and glass reflections. */
export function createCyberpunkScene(): Scene {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  geometry.deleteAttribute('uv');

  // Dark reflective enclosure
  const roomMat = new MeshStandardMaterial({
    side: BackSide,
    roughness: 0.15,
    metalness: 0.85,
    color: 0x050510,
  });
  const room = new Mesh(geometry, roomMat);
  room.scale.set(32, 28, 30);
  scene.add(room);

  // Intense cyan vertical light strip
  const cyanMat = new MeshBasicMaterial({ color: 0x00ffff });
  cyanMat.color.setScalar(55);
  const cyanLight = new Mesh(geometry, cyanMat);
  cyanLight.position.set(-15.5, 2, 4);
  cyanLight.scale.set(0.2, 20, 3.2);
  scene.add(cyanLight);

  // Intense magenta vertical light strip on opposite wall
  const magentaMat = new MeshBasicMaterial({ color: 0xff0080 });
  magentaMat.color.setScalar(55);
  const magentaLight = new Mesh(geometry, magentaMat);
  magentaLight.position.set(15.5, 2, -4);
  magentaLight.scale.set(0.2, 20, 3.2);
  scene.add(magentaLight);

  // Deep purple overhead light panel
  const purpleMat = new MeshBasicMaterial({ color: 0x8b5cf6 });
  purpleMat.color.setScalar(30);
  const purpleLight = new Mesh(geometry, purpleMat);
  purpleLight.position.set(0, 13.8, 0);
  purpleLight.scale.set(12, 0.2, 12);
  scene.add(purpleLight);

  // Amber rim backlight
  const goldMat = new MeshBasicMaterial({ color: 0xffaa00 });
  goldMat.color.setScalar(35);
  const goldLight = new Mesh(geometry, goldMat);
  goldLight.position.set(0, -5, 14.8);
  goldLight.scale.set(16, 2, 0.2);
  scene.add(goldLight);

  return scene;
}

/** Procedural warm sunset scene with low golden sun and rich dusk sky. */
export function createSunsetScene(): Scene {
  const scene = new Scene();
  const geometry = new BoxGeometry();
  geometry.deleteAttribute('uv');

  // Dusk room envelope
  const roomMat = new MeshStandardMaterial({
    side: BackSide,
    roughness: 0.35,
    color: 0x1f112e,
  });
  const room = new Mesh(geometry, roomMat);
  room.scale.set(32, 28, 30);
  scene.add(room);

  // Intense low sun disk
  const sunMat = new MeshBasicMaterial({ color: 0xffba3b });
  sunMat.color.setScalar(70);
  const sun = new Mesh(geometry, sunMat);
  sun.position.set(12, 2, 12);
  sun.scale.set(4, 4, 0.2);
  scene.add(sun);

  // Fiery orange horizon band
  const horizonMat = new MeshBasicMaterial({ color: 0xff4d00 });
  horizonMat.color.setScalar(30);
  const horizon = new Mesh(geometry, horizonMat);
  horizon.position.set(0, -3, 14.8);
  horizon.scale.set(30, 4.5, 0.2);
  scene.add(horizon);

  // Soft violet ambient ceiling
  const skyMat = new MeshBasicMaterial({ color: 0x581c87 });
  skyMat.color.setScalar(18);
  const sky = new Mesh(geometry, skyMat);
  sky.position.set(0, 13.8, 0);
  sky.scale.set(24, 0.2, 24);
  scene.add(sky);

  return scene;
}
