import { Button, buttonVariants } from "@/components/ui/button";
import { canPromptInstall, isStandalone, promptInstall, subscribeInstall } from "@/lib/pwa";
import { cn } from "@/lib/utils";
import { Download, Monitor, X } from "lucide-react";
import { useEffect, useState } from "react";

export function InstallAppButton() {
  const [open, setOpen] = useState(false);
  const [promptable, setPromptable] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setPromptable(canPromptInstall());
    return subscribeInstall(() => setPromptable(canPromptInstall()));
  }, []);

  if (standalone) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="hidden sm:inline-flex">
        <Monitor className="size-3.5" />
        App desktop
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} className="sm:hidden" aria-label="App desktop">
        <Monitor className="size-4" />
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-base font-semibold">Icona sul desktop</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scarica lo zip (circa 16 MB), estrailo, metti l’app sul Desktop.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground" aria-label="Chiudi">
                <X className="size-4" />
              </button>
            </div>
            <a
              href="/MADS-Hexagon-desktop.zip"
              download="MADS-Hexagon-desktop.zip"
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "live", size: "lg" }), "mt-4 w-full")}
            >
              <Download className="size-4" />
              Scarica MADS-Hexagon-desktop.zip
            </a>
            <ol className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">Mac:</b> tasto destro su <b>MADS Hexagon.app</b> → Apri. Poi
                trascinalo sul Desktop.
              </li>
              <li>
                <b className="text-foreground">Windows:</b> doppio clic su <b>Avvia Hexagon.bat</b>.
              </li>
            </ol>
            {promptable ? (
              <Button variant="outline" className="mt-3 w-full" onClick={() => void promptInstall()}>
                Installa in questo browser
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
