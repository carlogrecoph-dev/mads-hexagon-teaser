import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CAMERAS } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio";
import { Box, Pause, Play, Scan, WandSparkles } from "lucide-react";

export function ViewportDock() {
  const cameraLock = useStudio((s) => s.cameraLock);
  const setCameraLock = useStudio((s) => s.setCameraLock);
  const playing = useStudio((s) => s.playing);
  const play = useStudio((s) => s.play);
  const pause = useStudio((s) => s.pause);
  const seek = useStudio((s) => s.seek);
  const plan = useStudio((s) => s.plan);
  const time = useStudio((s) => s.time);
  const art = useStudio((s) => s.artworks.find((a) => a.id === s.activeId));
  const enqueueActive = useStudio((s) => s.enqueueActive);
  const jobs = useStudio((s) => s.jobs);
  const arOverlay = useStudio((s) => s.arOverlay);
  const toyMode = useStudio((s) => s.toyMode);
  const setArOverlay = useStudio((s) => s.setArOverlay);
  const setToyMode = useStudio((s) => s.setToyMode);
  const current = jobs.find((j) => j.status === "rendering");
  const duration = plan?.duration ?? 12;

  return (
    <div className="shrink-0 border-t border-border bg-card px-2 py-2 md:px-3">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="size-11 shrink-0"
          onClick={() => (playing ? pause() : play())}
          aria-label={playing ? "Pausa" : "Riproduci"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-background p-1">
          {CAMERAS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCameraLock(c.id)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-lg px-1 text-center transition-colors",
                cameraLock === c.id && !toyMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="text-xs font-semibold">{c.short}</span>
              <span
                className={cn(
                  "hidden text-[10px] leading-none xl:block",
                  cameraLock === c.id && !toyMode ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {c.id === "auto" ? "ciclo" : c.id === "top" ? "dall'alto" : c.id === "right" ? "spalla dx" : "spalla sx"}
              </span>
            </button>
          ))}
        </div>
        <Button size="lg" className="hidden h-11 shrink-0 px-3 lg:inline-flex" onClick={enqueueActive} disabled={!art}>
          <WandSparkles className="size-4" />
          Genera
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setArOverlay(!arOverlay)}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            arOverlay ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          <Scan className="size-4" />
          Overlay AR
        </button>
        <button
          type="button"
          onClick={() => setToyMode(!toyMode)}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            toyMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          <Box className="size-4" />
          Gioco 3D
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(time, duration)}
        onChange={(e) => seek(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer accent-primary"
        aria-label="Tempo del teaser"
      />
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{time.toFixed(1)}s</span>
        <span>{duration.toFixed(1)}s</span>
      </div>
      <Button className="mt-2 w-full lg:hidden" onClick={enqueueActive} disabled={!art}>
        <WandSparkles className="size-4" />
        Genera teaser
      </Button>
      {current ? (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted-foreground">
            Sto generando «{current.artworkName}» — {Math.round(current.progress * 100)}%
          </p>
          <Progress value={current.progress * 100} />
        </div>
      ) : null}
    </div>
  );
}
