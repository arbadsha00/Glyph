import type { GlyphSettings, MaterialCustomization, MaterialPreset } from '../lib/types';
import { DEFAULT_MATERIAL_CUSTOMIZATION } from '../lib/types';
import { getPresetValues } from '../lib/materials';
import { ResetIcon } from './icons';
import { Button, Group, Segmented, Slider } from './ui';

const MATERIALS: { value: MaterialPreset; label: string }[] = [
  { value: 'matte', label: 'Matte' },
  { value: 'glossy', label: 'Glossy' },
  { value: 'metallic', label: 'Metal' },
  { value: 'glass', label: 'Glass' },
  { value: 'custom', label: 'Custom' },
];

interface Props {
  settings: GlyphSettings;
  onChange: (patch: Partial<GlyphSettings>) => void;
}

export default function MaterialEditor({ settings, onChange }: Props) {
  const mat = settings.materialCustomization;

  const updateMat = (patch: Partial<MaterialCustomization>) => {
    onChange({
      materialCustomization: { ...mat, ...patch },
    });
  };

  const handlePresetChange = (material: MaterialPreset) => {
    if (material === 'custom') {
      // Keep current customization values when switching to custom
      onChange({ material });
    } else {
      // Seed the sliders with the preset's base values
      const presetValues = getPresetValues(material);
      onChange({
        material,
        materialCustomization: presetValues,
      });
    }
  };

  const resetCustomization = () => {
    if (settings.material === 'custom') {
      onChange({ materialCustomization: DEFAULT_MATERIAL_CUSTOMIZATION });
    } else {
      const presetValues = getPresetValues(settings.material);
      onChange({ materialCustomization: presetValues });
    }
  };

  return (
    <>
      <Group title="Material Preset">
        <Segmented
          label="Material preset"
          options={MATERIALS}
          value={settings.material}
          onChange={handlePresetChange}
        />

        {settings.material !== 'custom' && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{MATERIALS.find((m) => m.value === settings.material)?.label}</span> preset active — adjust sliders below to fine-tune, or pick
            {' '}<span className="font-medium text-foreground">Custom</span> for full manual control.
          </p>
        )}

        {settings.material === 'custom' && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Full manual control over all PBR material properties. Every slider is yours.
          </p>
        )}
      </Group>

      <Group title="Surface">
        <Slider
          label="Roughness"
          value={Math.round(mat.roughness * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ roughness: val / 100 })}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          0% = mirror-smooth · 100% = fully diffuse
        </p>

        <Slider
          label="Metalness"
          value={Math.round(mat.metalness * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ metalness: val / 100 })}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          0% = dielectric (plastic, wood) · 100% = full metal
        </p>
      </Group>

      <Group title="Clearcoat">
        <Slider
          label="Clearcoat intensity"
          value={Math.round(mat.clearcoat * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ clearcoat: val / 100 })}
        />

        <Slider
          label="Clearcoat roughness"
          value={Math.round(mat.clearcoatRoughness * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ clearcoatRoughness: val / 100 })}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          Adds a thin glossy lacquer layer over the base surface — like car paint or varnish.
        </p>
      </Group>

      <Group title="Transparency & Glass">
        <Slider
          label="Transmission"
          value={Math.round(mat.transmission * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ transmission: val / 100 })}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          0% = opaque · 100% = fully see-through (glass / crystal)
        </p>

        <Slider
          label="Opacity"
          value={Math.round(mat.opacity * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ opacity: val / 100 })}
        />

        {mat.transmission > 0.01 && (
          <Slider
            label="Index of Refraction"
            value={mat.ior}
            min={1}
            max={2.5}
            step={0.01}
            onChange={(ior) => updateMat({ ior })}
          />
        )}
        {mat.transmission > 0.01 && (
          <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
            1.0 = air · 1.33 = water · 1.5 = glass · 2.42 = diamond
          </p>
        )}
      </Group>

      <Group title="Reflections">
        <Slider
          label="Reflectivity"
          value={Math.round(mat.reflectivity * 100)}
          min={0}
          max={200}
          step={1}
          unit="%"
          onChange={(val) => updateMat({ reflectivity: val / 100 })}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground -mt-1">
          How bright environment reflections appear on the surface. Works best with HDR environments.
        </p>
      </Group>

      <Group>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={resetCustomization}>
          <ResetIcon className="h-3 w-3" />
          Reset material
        </Button>
      </Group>
    </>
  );
}
