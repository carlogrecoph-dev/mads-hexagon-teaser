import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { deliverTeaser } from "@/lib/save-file";
import { useStudio } from "@/store/studio";
import { Download, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function ExportHud() {
  const jobs = useStudio((s) => s.jobs);
  const running = useStudio((s) => s.queueRunning);
  const progress = useStudio((s) => s.exportProgress);
  const frame = useStudio((s) => s.exportFrame);
  const cancelJobs = useStudio((s) => s.cancelJobs);
  const current = jobs.find((j) => j.status === "rendering");
  const ready = jobs.find((j) => j.status === "completed" && (j.videoBlob || j.videoHref));
  const [dismissed, setDismissed] = useState(false);
  const showReady = !running && Boolean(ready) && !dismissed;

  const blobUrl = useMemo(
    () => (showReady && ready?.videoBlob ? URL.createObjectURL(ready.videoBlob) : null),
    [showReady, ready?.id, ready?.videoBlob],
  );
  const href = ready?.videoHref || blobUrl;

  useEffect(() => {
    if (running) setDismissed(false);
  }, [running]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  if (!running && !showReady) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-3 md:items-center">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md">
        {running ? (
          <>
            <p className="font-display text-sm font-semibold text-foreground">
              Rendering {current ? `«${current.artworkName}»` : "teaser"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{frame || "Avvio…"}</p>
            <Progress value={Math.round(progress * 100)} className="mt-3" />
            <p className="mt-2 text-xs text-muted-foreground">Non chiudere la pagina. Poi compare Scarica.</p>
            <button
              type="button"
              onClick={cancelJobs}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
            >
              <Square className="size-3.5" />
              Annulla
            </button>
          </>
        ) : href && ready ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-sm font-semibold text-foreground">Teaser pronto</p>
              <button type="button" className="text-muted-foreground" onClick={() => setDismissed(true)} aria-label="Chiudi">
                <X className="size-4" />
              </button>
            </div>
            <video src={href} controls playsInline className="mt-3 max-h-64 w-full rounded-lg bg-black object-contain" />
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className={cn(buttonVariants({ variant: "live", size: "lg" }), "w-full")}
                onClick={() =>
                  void deliverTeaser(ready.videoBlob, ready.videoName ?? "teaser.mp4", ready.videoHref)
                }
              >
                <Download className="size-4" />
                Scarica MP4
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                Si apre una scheda col video. Se non parte: tasto destro sul video → Salva.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
