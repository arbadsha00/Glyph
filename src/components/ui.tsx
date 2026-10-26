import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { normalizeHex } from '../lib/presets';

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ───────────────────────────────── Button ─────────────────────────────────

type Variant = 'default' | 'outline' | 'ghost' | 'secondary';
type Size = 'default' | 'sm' | 'icon';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:opacity-90',
  secondary: 'bg-muted text-foreground hover:bg-accent',
  outline: 'border border-input bg-background text-foreground shadow-sm hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
};
// Slightly larger on small screens so every control is a comfortable touch target (≥ 40 px).
const SIZES: Record<Size, string> = {
  default: 'h-10 px-4 text-sm md:h-9',
  sm: 'h-9 px-3 text-xs md:h-8',
  icon: 'h-10 w-10 md:h-9 md:w-9',
};

export function buttonClass(variant: Variant = 'default', size: Size = 'default', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

// ───────────────────────────── Layout helpers ─────────────────────────────

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b px-4 py-5 last:border-b-0">
      {title && (
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

// ───────────────────────────────── Slider ─────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  const id = useId();
  const fill = `${((value - min) / (max - min || 1)) * 100}%`;
  const shown = Number.isInteger(step) ? value : Number(value.toFixed(2));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <output htmlFor={id} className="text-xs tabular-nums text-muted-foreground">
          {shown}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="slider w-full"
        style={{ '--fill': fill } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ─────────────────────────────── Segmented control ───────────────────────────────

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-lg bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-w-0 truncate rounded-md px-2 py-2 text-xs font-medium transition-colors md:py-1.5',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────── Switch ─────────────────────────────────

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  );
}

// ───────────────────────────────── Colors ─────────────────────────────────

/** Swatch (native picker) + hex text input that accepts #rgb / #rrggbb. */
export function ColorInput({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    else setText(value);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-input shadow-sm md:h-9 md:w-9"
        style={{ background: value }}
      >
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="swatch absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <input
        type="text"
        aria-label={`${label} hex value`}
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          const hex = normalizeHex(val);
          if (hex && (val.length === 4 || val.length === 7)) {
            onChange(hex);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        // 16 px on touch screens: smaller text makes iOS Safari zoom the page when the field is focused.
        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 font-mono text-base uppercase shadow-sm md:h-9 md:text-xs"
      />
    </div>
  );
}

/** Row of preset color swatches. */
export function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preset colors">
      {colors.map((color) => {
        const active = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={active}
            title={color}
            onClick={() => onChange(color)}
            className={cn(
              'h-7 w-7 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 md:h-6 md:w-6 dark:border-white/15',
              active && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
            style={{ background: color }}
          />
        );
      })}
    </div>
  );
}

// ───────────────────────────────── Preview tile ─────────────────────────────────

/** A selectable tile showing a CSS background (gradient / pattern thumbnail) with a caption. */
export function Tile({
  label,
  background,
  active,
  onClick,
}: {
  label: string;
  background: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group space-y-1.5 rounded-lg p-1 text-left transition-colors hover:bg-accent',
        active && 'bg-accent',
      )}
    >
      <span
        className={cn(
          'block h-12 rounded-md border border-black/10 bg-cover shadow-sm dark:border-white/10',
          active && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
        )}
        style={{ background }}
      />
      <span className="block truncate px-0.5 text-[11px] text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </button>
  );
}
