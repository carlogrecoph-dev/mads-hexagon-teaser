import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { jobStatusLabel } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { deliverTeaser } from "@/lib/save-file";
import { useStudio } from "@/store/studio";
import { Download, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo } from "react";

export function QueueBar() {
  const jobs = useStudio((s) => s.jobs);
  const cancelJobs = useStudio((s) => s.cancelJobs);
  const retryFailed = useStudio((s) => s.retryFailed);
  const current = jobs.find((j) => j.status === "rendering");
  const pending = jobs.filter((j) => j.status === "pending").length;
  const done = jobs.filter((j) => j.status === "completed" && (j.videoBlob || j.videoHref));
  const failed = jobs.filter((j) => j.status === "failed").length;
  const ready = done[0];
  const exportProgress = useStudio((s) => s.exportProgress);
  const exportFrame = useStudio((s) => s.exportFrame);
  const clipUrl = useMemo(() => {
    if (ready?.videoHref) return ready.videoHref;
    return ready?.videoBlob ? URL.createObjectURL(ready.videoBlob) : null;
  }, [ready?.id, ready?.videoBlob, ready?.videoHref]);

  useEffect(() => {
    return () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  const pct = current ? Math.round(exportProgress * 100) : done.length && jobs.length ? 100 : 0;
  const headline = current
    ? `Generazione di «${current.artworkName}» — ${exportFrame || `${pct}%`}`
    : clipUrl
      ? `«${ready?.artworkName}» è pronto. Clicca Scarica MP4 (link diretto).`
      : jobs.length
        ? `${done.length} pronti · ${pending} in coda · ${failed} errori`
        : "Nessun video in coda. Premi Genera teaser sotto l'anteprima.";

  return (
    <footer className="flex min-h-16 items-center gap-3 border-t border-border bg-card px-3 py-2">
      {clipUrl ? (
        <video
          src={clipUrl}
          controls
          playsInline
          className="h-20 w-[45px] shrink-0 rounded-sm bg-black object-contain"
          aria-label="Anteprima teaser 9:16"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="truncate text-xs text-muted-foreground">{headline}</p>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {current ? `${pct}%` : done.length ? `${done.length} MP4` : ""}
          </span>
        </div>
        <Progress value={pct} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={cancelJobs} disabled={!current && !pending}>
          <Square className="size-3.5" />
          Annulla
        </Button>
        <Button size="sm" variant="outline" onClick={retryFailed} disabled={!failed}>
          <RotateCcw className="size-3.5" />
          Riprova
        </Button>
        {ready && (ready.videoBlob || ready.videoHref) ? (
          <Button asChild size="sm" variant="live">
            <a
              href={clipUrl || ready.videoHref || "#"}
              download={ready.videoName ?? "teaser.mp4"}
              onClick={(e) => {
                if (!clipUrl && !ready.videoHref) e.preventDefault();
                void deliverTeaser(ready.videoBlob, ready.videoName ?? "teaser.mp4", ready.videoHref);
              }}
            >
              <Download className="size-3.5" />
              Scarica MP4
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="live" disabled>
            <Download className="size-3.5" />
            Scarica MP4
          </Button>
        )}
      </div>
      {current || done.length ? (
        <ul className="hidden max-w-xs text-[11px] text-muted-foreground lg:block">
          {jobs.slice(0, 4).map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {j.artworkName} · {jobStatusLabel(j.status)}
                {j.error ? ` — ${j.error}` : ""}
              </span>
              {j.status === "completed" && (j.videoBlob || j.videoHref) ? (
                <a
                  href={j.videoHref || clipUrl || "#"}
                  download={j.videoName ?? "teaser.mp4"}
                  className="text-accent hover:underline"
                  onClick={(e) => {
                    if (!j.videoHref && !j.videoBlob) e.preventDefault();
                    void deliverTeaser(j.videoBlob, j.videoName ?? "teaser.mp4", j.videoHref);
                  }}
                >
                  scarica
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </footer>
  );
}
