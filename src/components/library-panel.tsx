import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { artworkStatusLabel } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio";
import { Check, Trash2, Upload } from "lucide-react";
import { useMemo, useRef } from "react";

function useThumbUrl(blob?: Blob) {
  return useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
}

function ArtworkCard({
  id,
  name,
  width,
  height,
  status,
  thumb,
  selected,
  active,
}: {
  id: string;
  name: string;
  width: number;
  height: number;
  status: string;
  thumb?: Blob;
  seed: number;
  selected: boolean;
  active: boolean;
}) {
  const url = useThumbUrl(thumb);
  const selectArtwork = useStudio((s) => s.selectArtwork);
  const toggleSelected = useStudio((s) => s.toggleSelected);
  const removeArtwork = useStudio((s) => s.removeArtwork);
  const aspect = width / Math.max(1, height);
  const orient = aspect >= 1.2 ? "orizzontale" : aspect <= 0.85 ? "verticale" : "quadrato";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-colors",
        active ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40",
      )}
    >
      <button type="button" onClick={() => selectArtwork(id)} className="block w-full text-left">
        <div className="relative aspect-[4/3] bg-muted">
          {url ? (
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain bg-background" />
          ) : null}
          <span className="absolute left-2 top-2 flex gap-1">
            {active ? <Badge variant="pink">In scena</Badge> : null}
            <Badge variant={status === "completed" ? "live" : "default"}>{artworkStatusLabel(status)}</Badge>
          </span>
        </div>
        <div className="px-2.5 py-2">
          <p className="truncate font-display text-sm font-medium">{name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
            {width}×{height} · {orient}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {active ? "Visibile sui sette monitor" : "Clicca per metterla nell'esagono"}
          </p>
        </div>
      </button>
      <button
        type="button"
        aria-label={selected ? "Togli dal lotto" : "Includi nel lotto"}
        title={selected ? "Nel lotto" : "Aggiungi al lotto"}
        onClick={() => toggleSelected(id)}
        className={cn(
          "absolute right-2 top-2 flex size-9 items-center justify-center rounded-md border",
          selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card/80 text-muted-foreground",
        )}
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Rimuovi"
        onClick={() => void removeArtwork(id)}
        className="absolute bottom-2 right-2 hidden size-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive group-hover:flex"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function LibraryPanel() {
  const artworks = useStudio((s) => s.artworks);
  const activeId = useStudio((s) => s.activeId);
  const selectedIds = useStudio((s) => s.selectedIds);
  const addFiles = useStudio((s) => s.addFiles);
  const selectAll = useStudio((s) => s.selectAll);
  const enqueueSelected = useStudio((s) => s.enqueueSelected);
  const busy = useStudio((s) => s.busy);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchCount = selectedIds.length;

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Opere
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {artworks.length ? `${artworks.length} in libreria` : "Vuota"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload className="size-3.5" />
          Carica
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) void addFiles(files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
        Clicca un'opera per vederla sui monitor. Il segno di spunta serve solo per i lotti.
      </p>
      <div className="flex gap-2 px-3 pb-3">
        <Button size="sm" variant="secondary" className="h-11 flex-1" onClick={selectAll} disabled={!artworks.length}>
          {batchCount === artworks.length && artworks.length ? "Deseleziona" : "Seleziona tutte"}
        </Button>
        <Button size="sm" className="h-11 flex-1" onClick={enqueueSelected} disabled={!batchCount}>
          {batchCount ? `Genera ${batchCount}` : "Genera lotto"}
        </Button>
      </div>
      {busy ? <p className="px-3 pb-2 text-xs text-accent">{busy}</p> : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {artworks.map((a) => (
          <ArtworkCard
            key={a.id}
            id={a.id}
            name={a.name}
            width={a.width}
            height={a.height}
            status={a.status}
            thumb={a.thumb}
            seed={a.seed}
            selected={selectedIds.includes(a.id)}
            active={a.id === activeId}
          />
        ))}
        {!artworks.length ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center rounded-lg border border-dashed border-border px-3 py-10 text-center"
          >
            <Upload className="mb-2 size-5 text-muted-foreground" />
            <p className="text-sm text-foreground">Carica un'opera</p>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG o WebP. Resta su questo dispositivo.</p>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
