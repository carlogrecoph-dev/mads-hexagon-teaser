import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  MOTION_DEFAULTS,
  MOTION_GROUPS,
  MOTION_PRESETS,
  MOTION_RANGES,
  isDefaultTuning,
  loadTuning,
  onTuningChange,
  resetTuning,
  setTuning,
  tuning,
  tuningSnapshot,
  type MotionTuning,
} from "@/engine/tuning";
import { ChevronDown, RotateCcw, Sliders } from "lucide-react";
import { useEffect, useState } from "react";

const KEYS = Object.keys(MOTION_DEFAULTS) as (keyof MotionTuning)[];

/** Percentages read better than raw multipliers for everything here. */
function show(key: keyof MotionTuning, value: number) {
  const unit = MOTION_RANGES[key].unit;
  if (unit === "s") return `${value.toFixed(2)} s`;
  return `${Math.round(value * 100)}%`;
}

export function MotionPanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const [preset, setPreset] = useState("default");

  useEffect(() => {
    loadTuning();
    return onTuningChange(() => bump((n) => n + 1));
  }, []);

  const atDefault = isDefaultTuning();

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground"
      >
        <span className="flex items-center gap-2">
          <Sliders className="size-4 text-muted-foreground" />
          Movimenti della figura
          {atDefault ? null : (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              modificati
            </span>
          )}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-5 rounded-lg border border-border bg-background/40 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Si applicano subito, anche mentre trascini. Restano salvati su questo browser e
            valgono anche per l&apos;export.
          </p>

          <div>
            <p className="mb-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Carattere
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.hint}
                  onClick={() => {
                    setPreset(p.id);
                    resetTuning(p.values);
                  }}
                  className={cn(
                    "h-10 rounded-md border px-2 text-xs transition-colors",
                    preset === p.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {MOTION_GROUPS.map((group) => (
            <div key={group} className="space-y-4">
              <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                {group}
              </p>
              {KEYS.filter((k) => MOTION_RANGES[k].group === group).map((key) => {
                const r = MOTION_RANGES[key];
                return (
                  <label key={key} className="block">
                    <span className="mb-1.5 flex items-center justify-between text-xs text-foreground">
                      {r.label}
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {show(key, tuning[key])}
                      </span>
                    </span>
                    <Slider
                      min={r.min}
                      max={r.max}
                      step={r.step}
                      value={[tuning[key]]}
                      onValueChange={([v]) => {
                        setPreset("");
                        setTuning({ [key]: v ?? MOTION_DEFAULTS[key] });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          ))}

          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 text-xs"
              onClick={() => {
                setPreset("default");
                resetTuning();
              }}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Ripristina
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(tuningSnapshot(), null, 2));
              }}
            >
              Copia valori
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
