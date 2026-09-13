import { CoachOverlay, useCoach } from "@/components/coach-overlay";
import { HexMark } from "@/components/hex-mark";
import { InspectorPanel } from "@/components/inspector-panel";
import { LibraryPanel } from "@/components/library-panel";
import { QueueBar } from "@/components/queue-bar";
import { InstallAppButton } from "@/components/install-app";
import { Button } from "@/components/ui/button";
import { StudioLazy } from "@/components/studio-lazy";
import { useStudio } from "@/store/studio";
import { registerPwa } from "@/lib/pwa";
import { Clapperboard, CircleHelp, Library, Settings2, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type MobileTab = "studio" | "library" | "motion" | "queue";

function Header({ onHelp }: { onHelp: () => void }) {
  const enqueueActive = useStudio((s) => s.enqueueActive);
  const playing = useStudio((s) => s.playing);
  const lastState = useStudio((s) => s.lastState);
  const art = useStudio((s) => s.artworks.find((a) => a.id === s.activeId));
  const artCount = useStudio((s) => s.artworks.length);
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-3 md:px-4">
      <HexMark className="size-7 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
          M.A.D.S. Art Gallery
        </p>
        <h1 className="truncate font-display text-sm font-semibold tracking-tight md:text-base">
          Hexagon Teaser
        </h1>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
            playing ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 rounded-full", playing ? "bg-accent" : "bg-muted-foreground")} />
          {playing ? "In play" : "Pausa"}
        </span>
        <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground md:inline">
          {art?.name ?? (artCount ? "Nessuna opera" : "Caricamento…")}
        </span>
        <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
          {lastState?.cameraId.toUpperCase() ?? "—"}
        </span>
      </div>
      <Button size="icon-sm" variant="ghost" onClick={onHelp} aria-label="Apri guida" className="hidden sm:inline-flex">
        <CircleHelp className="size-4" />
      </Button>
      <a
        href="/mads-hexagon/index.html"
        className="hidden rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground md:inline-flex"
      >
        Pacchetto Aruba
      </a>
      <InstallAppButton />
      <Button size="sm" onClick={enqueueActive} disabled={!art} className="hidden lg:inline-flex">
        <WandSparkles className="size-3.5" />
        Genera teaser
      </Button>
    </header>
  );
}

function MobileNav({ tab, setTab }: { tab: MobileTab; setTab: (t: MobileTab) => void }) {
  const items: { id: MobileTab; label: string; icon: typeof Library }[] = [
    { id: "studio", label: "Studio", icon: Clapperboard },
    { id: "library", label: "Opere", icon: Library },
    { id: "motion", label: "Camera", icon: Settings2 },
    { id: "queue", label: "Coda", icon: WandSparkles },
  ];
  return (
    <nav className="grid grid-cols-4 border-t border-border bg-card lg:hidden">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => setTab(it.id)}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
            tab === it.id ? "text-primary" : "text-muted-foreground",
          )}
        >
          <it.icon className="size-4" />
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export function AppShell() {
  const hydrate = useStudio((s) => s.hydrate);
  const [tab, setTab] = useState<MobileTab>("studio");
  const coach = useCoach();

  useEffect(() => {
    registerPwa();
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <Header onHelp={coach.reopen} />
      <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className={cn("min-h-0 overflow-hidden", tab === "library" ? "block" : "hidden lg:block")}>
          <LibraryPanel />
        </div>
        <div className={cn("relative min-h-0 h-full min-h-[240px]", tab === "studio" ? "block" : "hidden lg:block")}>
          <StudioLazy />
          <CoachOverlay open={coach.open} onClose={coach.close} />
        </div>
        <div className={cn("min-h-0 overflow-hidden", tab === "motion" ? "block" : "hidden lg:block")}>
          <InspectorPanel />
        </div>
      </div>
      <div className={cn(tab === "queue" ? "block" : "hidden lg:block")}>
        <QueueBar />
      </div>
      <MobileNav tab={tab} setTab={setTab} />
    </div>
  );
}
