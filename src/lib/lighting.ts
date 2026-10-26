import { AmbientLight, DirectionalLight, Group, HemisphereLight } from 'three';
import type { LightingPreset } from './types';

export interface LightRig {
  group: Group;
  /** Strength of the image-based environment light that drives reflections. */
  envIntensity: number;
}

/** FR-3.5 — studio, soft and dramatic lighting presets. */
export function createLightRig(preset: LightingPreset): LightRig {
  const group = new Group();
  group.name = 'lights';

  const directional = (color: number, intensity: number, x: number, y: number, z: number) => {
    const light = new DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    group.add(light);
  };

  switch (preset) {
    case 'studio':
      directional(0xffffff, 2.4, 6, 8, 10); // key
      directional(0xdfe6ff, 0.9, -8, 2, 6); // fill
      directional(0xffffff, 1.6, 0, 6, -9); // rim
      group.add(new AmbientLight(0xffffff, 0.25));
      return { group, envIntensity: 0.9 };

    case 'soft':
      group.add(new HemisphereLight(0xffffff, 0x8a8fa8, 1.4));
      directional(0xffffff, 0.9, 3, 6, 8);
      return { group, envIntensity: 1.3 };

    case 'dramatic':
      directional(0xffffff, 4, 9, 5, 3); // hard key from the side
      directional(0x6d4aff, 2.2, -8, -2, -6); // colored rim
      group.add(new AmbientLight(0xffffff, 0.05));
      return { group, envIntensity: 0.25 };
  }
}
