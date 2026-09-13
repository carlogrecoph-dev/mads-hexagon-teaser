import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { deliverTeaser } from "@/lib/save-file";
import { useStudio } from "@/store/studio";
import { Download, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function ExportHud() {
  const jobs = useStudio((s) => s.jobs);
  const running = useStudio((s) => s.queueRunning);
  const progress = useStudio((s) => s.exportProgress);
  const frame = useStudio((s) => s.exportFrame);
  const cancelJobs = useStudio((s) => s.cancelJobs);
  const hudJobId = useStudio((s) => s.hudJobId);
  const downloadedIds = useStudio((s) => s.downloadedIds);
  const closeExportHud = useStudio((s) => s.closeExportHud);
  const markDownloaded = useStudio((s) => s.markDownloaded);
  const discardVideo = useStudio((s) => s.discardVideo);
  const current = jobs.find((j) => j.status === "rendering");
  const ready = jobs.find((j) => j.id === hudJobId && j.status === "completed" && (j.videoBlob || j.videoHref));
  const [ask, setAsk] = useState(false);
  const downloaded = ready ? downloadedIds.includes(ready.id) : false;

  const blobUrl = useMemo(
    () => (ready?.videoBlob ? URL.createObjectURL(ready.videoBlob) : null),
    [ready?.id, ready?.videoBlob],
  );
  const href = ready?.videoHref || blobUrl;

  useEffect(() => {
    setAsk(false);
  }, [ready?.id]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const tryClose = () => {
    if (ready && !downloaded) {
      setAsk(true);
      return;
    }
    closeExportHud();
  };

  if (!running && !ready) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-3 md:items-center">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 bg-black/40"
        aria-label="Chiudi"
        onClick={running ? undefined : tryClose}
      />
      <div className="pointer-events-auto relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-4 pt-5 shadow-2xl">
        <button
          type="button"
          onClick={running ? cancelJobs : tryClose}
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-muted"
          aria-label="Chiudi"
        >
          <X className="size-5" />
        </button>
        {running ? (
          <>
            <p className="pr-12 font-display text-sm font-semibold text-foreground">
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
            <p className="pr-12 font-display text-sm font-semibold text-foreground">Teaser pronto</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{ready.artworkName}</p>
            <video src={href} controls playsInline className="mt-3 max-h-64 w-full rounded-lg bg-black object-contain" />
            {ask ? (
              <div className="mt-3 rounded-lg border border-border bg-background p-3">
                <p className="text-sm text-foreground">Il video non è stato scaricato. Lo tieni in libreria o lo cesti?</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    className={cn(buttonVariants({ size: "sm" }), "w-full")}
                    onClick={() => {
                      setAsk(false);
                      closeExportHud();
                    }}
                  >
                    Tieni in libreria
                  </button>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
                    onClick={() => discardVideo(ready.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Cestina — va rifatto
                  </button>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setAsk(false)}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href={href}
                  download={ready.videoName ?? "teaser.mp4"}
                  className={cn(buttonVariants({ variant: "live", size: "lg" }), "w-full")}
                  onClick={() => {
                    markDownloaded(ready.id);
                    void deliverTeaser(ready.videoBlob, ready.videoName ?? "teaser.mp4", ready.videoHref);
                  }}
                >
                  <Download className="size-4" />
                  Scarica MP4
                </a>
                <p className="text-center text-[11px] text-muted-foreground">
                  Se non parte: tasto destro sul video → Salva video come…
                </p>
                <button type="button" className="text-xs text-muted-foreground" onClick={tryClose}>
                  Chiudi
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
