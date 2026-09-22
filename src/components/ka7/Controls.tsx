import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PRESET_LABELS,
  settingsFromPreset,
  type Align,
  type Dither,
  type Preset,
  type ProcessSettings,
} from "@/lib/ka7/bitmap";
import { cn } from "@/lib/utils";

interface Props {
  value: ProcessSettings;
  onChange: (s: ProcessSettings) => void;
}

const PRESET_HINT: Record<Preset, string> = {
  pixelart: "nearest-neighbor · sem dithering",
  foto: "Floyd-Steinberg · contraste leve",
  logo: "limiar alto · recorte automático",
};

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {value !== undefined && (
          <span className="font-mono text-[11px] tabular-nums text-foreground/80">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function Controls({ value: s, onChange }: Props) {
  const set = <K extends keyof ProcessSettings>(k: K, v: ProcessSettings[K]) =>
    onChange({ ...s, [k]: v });

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Preset</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(settingsFromPreset(p))}
              className={cn(
                "rounded-md border px-2 py-2 text-left transition-colors",
                s.preset === p
                  ? "border-primary/70 bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <div className="text-xs font-semibold">{PRESET_LABELS[p]}</div>
              <div className="mt-0.5 font-mono text-[10px] leading-tight opacity-70">
                {PRESET_HINT[p]}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Field label="Threshold" value={s.threshold}>
        <Slider
          min={0}
          max={255}
          step={1}
          value={[s.threshold]}
          onValueChange={([v]) => set("threshold", v ?? s.threshold)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Brilho" value={s.brightness > 0 ? `+${s.brightness}` : s.brightness}>
          <Slider
            min={-100}
            max={100}
            step={1}
            value={[s.brightness]}
            onValueChange={([v]) => set("brightness", v ?? s.brightness)}
          />
        </Field>
        <Field label="Contraste" value={s.contrast > 0 ? `+${s.contrast}` : s.contrast}>
          <Slider
            min={-100}
            max={100}
            step={1}
            value={[s.contrast]}
            onValueChange={([v]) => set("contrast", v ?? s.contrast)}
          />
        </Field>
      </div>

      <Field label="Dithering">
        <ToggleGroup
          type="single"
          value={s.dither}
          onValueChange={(v) => v && set("dither", v as Dither)}
          className="grid w-full grid-cols-3 gap-1"
        >
          <ToggleGroupItem value="none" className="h-8 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            Nenhum
          </ToggleGroupItem>
          <ToggleGroupItem value="floyd" className="h-8 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            Floyd-St.
          </ToggleGroupItem>
          <ToggleGroupItem value="atkinson" className="h-8 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            Atkinson
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
          Inverter
          <Switch checked={s.invert} onCheckedChange={(v) => set("invert", v)} />
        </label>
        <label className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
          Recortar bordas
          <Switch checked={s.autoCrop} onCheckedChange={(v) => set("autoCrop", v)} />
        </label>
      </div>

      <Field label="Largura do conteúdo" value={`${s.scale}%`}>
        <Slider
          min={10}
          max={100}
          step={1}
          value={[s.scale]}
          onValueChange={([v]) => set("scale", v ?? s.scale)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Margem esq." value={`${s.marginLeft} dots`}>
          <Slider
            min={0}
            max={192}
            step={8}
            value={[s.marginLeft]}
            onValueChange={([v]) => set("marginLeft", v ?? s.marginLeft)}
          />
        </Field>
        <Field label="Margem dir." value={`${s.marginRight} dots`}>
          <Slider
            min={0}
            max={192}
            step={8}
            value={[s.marginRight]}
            onValueChange={([v]) => set("marginRight", v ?? s.marginRight)}
          />
        </Field>
      </div>

      <Field label="Alinhamento">
        <ToggleGroup
          type="single"
          value={s.align}
          onValueChange={(v) => v && set("align", v as Align)}
          className="grid w-full grid-cols-3 gap-1"
        >
          <ToggleGroupItem value="left" aria-label="Esquerda" className="h-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Centro" className="h-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Direita" className="h-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </div>
  );
}