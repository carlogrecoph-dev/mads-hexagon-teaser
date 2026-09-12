import { Button } from "@/components/ui/button";
import { HexMark } from "@/components/hex-mark";
import { useEffect, useState } from "react";

const KEY = "mads-coach-v1";

export function CoachOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-background/70 p-4 backdrop-blur-[2px] md:items-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <HexMark className="size-6" />
          <p className="font-display text-sm font-semibold tracking-[0.18em] uppercase">Guida rapida</p>
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Tre gesti, poi il video</h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-foreground">
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs">
              1
            </span>
            <span>
              A sinistra, <strong>clicca un'opera</strong>. I sette monitor la mostrano nell'esagono.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs">
              2
            </span>
            <span>
              Sotto il video, premi <strong>Alto</strong>, <strong>Destra</strong> o <strong>Sinistra</strong> per
              cambiare camera. Auto fa il giro da sola.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-mono text-xs">
              3
            </span>
            <span>
              Premi <strong>Genera teaser</strong>. Il file MP4 9:16 compare in basso, pronto da scaricare.
            </span>
          </li>
        </ol>
        <Button className="mt-5 w-full" onClick={onClose}>
          Ho capito, inizia
        </Button>
      </div>
    </div>
  );
}

export function useCoach() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const reopen = () => setOpen(true);
  return { open, close, reopen };
}
