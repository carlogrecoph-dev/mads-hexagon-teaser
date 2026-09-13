import { FocusMap } from "@/components/focus-map";
import { MotionPanel } from "@/components/motion-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CAMERAS, PRESET_COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio";
import type { OutputFormat } from "@/engine/types";
import { OPENING_IT, SHOT_IT, SHOOT_MODELS, describeFlight, type DroneFlight } from "@/engine/drone";
import { ChevronDown, ChevronLeft, ChevronRight, Dices, RotateCcw, WandSparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

const FORMATS: { id: OutputFormat; label: string; hint: string }[] = [
  { id: "9:16", label: "9:16", hint: "Stories / Reels" },
  { id: "1:1", label: "1:1", hint: "Quadrato" },
  { id: "16:9", label: "16:9", hint: "Orizzontale" },
];

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 flex items-center justify-between text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
        {value ? <span className="font-mono text-[10px] tracking-normal tabular-nums">{value}</span> : null}
      </span>
      {children}
    </div>
  );
}

export function InspectorPanel() {
  const settings = useStudio((s) => s.settings);
  const setSettings = useStudio((s) => s.setSettings);
  const cameraLock = useStudio((s) => s.cameraLock);
  const setCameraLock = useStudio((s) => s.setCameraLock);
  const art = useStudio((s) => s.artworks.find((a) => a.id === s.activeId));
  const setSeed = useStudio((s) => s.setSeed);
  const randomizeSeed = useStudio((s) => s.randomizeSeed);
  const cycleDroneModel = useStudio((s) => s.cycleDroneModel);
  const rebuildPlan = useStudio((s) => s.rebuildPlan);
  const enqueueActive = useStudio((s) => s.enqueueActive);
  const lastState = useStudio((s) => s.lastState);
  const setIdentityLogo = useStudio((s) => s.setIdentityLogo);
  const setIdentityPortrait = useStudio((s) => s.setIdentityPortrait);
  const setIdentityVrm = useStudio((s) => s.setIdentityVrm);
  const plan = useStudio((s) => s.plan);
  const [advanced, setAdvanced] = useState(false);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <p className="font-display text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Camera e stile
        </p>
        <p className="mt-1 truncate text-sm text-foreground">
          {art ? `In scena: ${art.name}` : "Nessuna opera selezionata"}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Scegli la camera
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {CAMERAS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCameraLock(c.id)}
                className={cn(
                  "min-h-14 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  cameraLock === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-muted-foreground/50",
                )}
              >
                <span className="block text-sm font-semibold leading-tight">{c.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[11px] leading-snug",
                    cameraLock === c.id ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {c.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <FocusMap />

        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Algoritmo di ripresa
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {SHOOT_MODELS.length} scene. Ognuna: fuori, due opere, scenografia. Lei, se c'è, di lato e lontana. Rigenera ne pesca un'altra.
          </p>
          {(() => {
            const idx = settings.droneModel ?? 0;
            const model = SHOOT_MODELS[idx % SHOOT_MODELS.length]!;
            const desc = plan?.drone ? describeFlight(plan.drone as DroneFlight) : null;
            return (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-foreground">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {String(model.id + 1).padStart(2, "0")}/{SHOOT_MODELS.length}
                  </span>{" "}
                  <span className="font-semibold">{model.name}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{model.hint}</p>
                {desc ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {OPENING_IT[desc.opening] ?? desc.opening} · {desc.shots.slice(0, 6).map((s) => SHOT_IT[s] ?? s).join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })()}
          <div className="mt-3 flex gap-1.5">
            <Button size="icon" variant="outline" onClick={() => cycleDroneModel(-1)} aria-label="Modello precedente" disabled={!art}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button className="flex-1" variant="outline" onClick={randomizeSeed} disabled={!art}>
              <Dices className="size-4" />
              Rigenera modello
            </Button>
            <Button size="icon" variant="outline" onClick={() => cycleDroneModel(1)} aria-label="Modello successivo" disabled={!art}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-center font-mono text-[10px] text-muted-foreground">
            seme {art?.seed ?? "—"}
          </p>
        </div>

        <Row label="Stile del movimento">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
            {PRESET_COPY.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSettings({ preset: p.id })}
                className={cn(
                  "min-h-12 rounded-md px-1 py-1.5",
                  settings.preset === p.id ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="block text-xs font-medium">{p.title}</span>
                <span className="block text-[10px] leading-tight opacity-80">{p.hint}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Formato video">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSettings({ format: f.id })}
                className={cn(
                  "min-h-12 rounded-md px-1 py-1.5",
                  settings.format === f.id ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="block font-mono text-xs">{f.label}</span>
                <span className="block text-[10px] leading-tight">{f.hint}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Qualità export">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
            {(
              [
                ["2k", "2K master", "1440p · 30 fps"],
                ["hd", "1080p social", "H.264 · 30 fps"],
                ["fast", "Bozza", "720p · 24 fps"],
              ] as const
            ).map(([id, title, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSettings({ exportQuality: id })}
                className={cn(
                  "min-h-12 rounded-md px-1 py-1.5",
                  (settings.exportQuality ?? "2k") === id ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="block text-xs font-medium">{title}</span>
                <span className="block text-[10px] leading-tight opacity-80">{hint}</span>
              </button>
            ))}
          </div>
        </Row>

        <Button className="w-full" size="lg" onClick={enqueueActive} disabled={!art}>
          <WandSparkles className="size-4" />
          Genera teaser MP4
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {plan
            ? `Clip di ${plan.duration.toFixed(0)} s · MP4 H.264 (AVC) · ${
                (settings.exportQuality ?? "2k") === "2k"
                  ? settings.format === "9:16"
                    ? "1440×2560 30fps"
                    : settings.format === "16:9"
                      ? "2560×1440 30fps"
                      : "1440×1440 30fps"
                  : (settings.exportQuality ?? "2k") === "hd"
                    ? settings.format === "9:16"
                      ? "1080×1920 30fps"
                      : settings.format === "16:9"
                        ? "1920×1080 30fps"
                        : "1080×1080 30fps"
                    : "720p 24fps"
              }. WhatsApp / TikTok.`
            : "Seleziona un'opera a sinistra per creare il piano di ripresa."}
        </p>

        <MotionPanel />

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex h-11 w-full items-center justify-between rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          Controlli avanzati
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", advanced && "rotate-180")} />
        </button>

        {advanced ? (
          <div className="space-y-5">
            {(
              [
                ["cameraIntensity", "Intensità camera"],
                ["zoomIntensity", "Zoom sull'opera"],
                ["panIntensity", "Pan sull'opera"],
                ["handAmplitude", "Gesti delle mani"],
                ["transitionDuration", "Durata passaggi"],
                ["stabilization", "Stabilizzazione"],
              ] as const
            ).map(([key, label]) => (
              <Row key={key} label={label} value={`${Math.round(settings[key] * 100)}%`}>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[settings[key]]}
                  onValueChange={([v]) => setSettings({ [key]: v ?? 0 })}
                />
              </Row>
            ))}

            <Row label="Seme (ripetibilità)">
              <div className="flex gap-1.5">
                <input
                  className="h-11 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs tabular-nums"
                  value={art?.seed ?? 0}
                  onChange={(e) => setSeed(Number(e.target.value) || 0)}
                />
                <Button size="icon" variant="outline" onClick={randomizeSeed} aria-label="Seme casuale">
                  <Dices className="size-3.5" />
                </Button>
                <Button size="icon" variant="outline" onClick={rebuildPlan} aria-label="Ricostruisci">
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            </Row>

            <Row label="Identità del personaggio">
              <div className="grid grid-cols-3 gap-2">
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                  Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void setIdentityLogo(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                  Volto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void setIdentityPortrait(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                  VRM
                  <input
                    type="file"
                    accept=".vrm,model/gltf-binary,model/gltf+json"
                    className="hidden"
                    onChange={(e) => void setIdentityVrm(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </Row>

            <label className="flex h-11 items-center justify-between text-sm">
              <span>Mostra personaggio</span>
              <input
                type="checkbox"
                checked={settings.includeCharacter}
                onChange={(e) => setSettings({ includeCharacter: e.target.checked })}
              />
            </label>
            <label className="flex h-11 items-center justify-between text-sm">
              <span>Occhiali</span>
              <input
                type="checkbox"
                checked={settings.glasses}
                onChange={(e) => setSettings({ glasses: e.target.checked })}
              />
            </label>
          </div>
        ) : null}
      </div>
      {lastState ? (
        <div className="border-t border-border px-3 py-2">
          {art ? (
            <div className="flex justify-center">
              <Badge variant="pink">seme {art.seed}</Badge>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
