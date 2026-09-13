import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio";
import { refineFocusPoint } from "@/engine/focus";
import type { FocusPoint } from "@/engine/types";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_POINTS = 16;
/** Pixels the map is sampled at when snapping a point onto a detail. */
const SNAP_SAMPLE = 900;

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function containRect(hostW: number, hostH: number, artW: number, artH: number) {
  const imgA = artW / Math.max(1, artH);
  const boxA = hostW / Math.max(1, hostH);
  if (boxA > imgA) {
    const h = hostH;
    const w = h * imgA;
    return { ox: (hostW - w) / 2, oy: 0, w, h };
  }
  const w = hostW;
  const h = w / imgA;
  return { ox: 0, oy: (hostH - h) / 2, w, h };
}

function eventToUv(
  e: { clientX: number; clientY: number },
  host: HTMLElement,
  artW: number,
  artH: number,
) {
  const r = host.getBoundingClientRect();
  const box = containRect(r.width, r.height, artW, artH);
  const cx = (e.clientX - r.left - box.ox) / Math.max(1, box.w);
  const cy = (e.clientY - r.top - box.oy) / Math.max(1, box.h);
  const inside = cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1;
  return { cx: clamp01(cx), cy: clamp01(cy), inside };
}

export function FocusMap() {
  const activeId = useStudio((s) => s.activeId);
  const art = useStudio((s) => s.artworks.find((a) => a.id === s.activeId));
  const setFocusPoints = useStudio((s) => s.setFocusPoints);
  const plan = useStudio((s) => s.plan);
  const host = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { cx: number; cy: number }>>({});
  const [size, setSize] = useState({ w: 1, h: 1 });
  const url = useMemo(() => {
    const blob = art?.thumb ?? art?.blob;
    return blob ? URL.createObjectURL(blob) : undefined;
  }, [art?.thumb, art?.blob]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  /** The artwork's own pixels, sampled once, so a click can find its detail. */
  const pixels = useRef<ImageData | null>(null);
  useEffect(() => {
    pixels.current = null;
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, SNAP_SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(32, Math.round(img.naturalWidth * scale));
      const h = Math.max(32, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      try {
        ctx.drawImage(img, 0, 0, w, h);
        pixels.current = ctx.getImageData(0, 0, w, h);
      } catch {
        pixels.current = null;
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, [art?.id]);

  if (!art || !activeId) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Seleziona un'opera a sinistra, poi clicca sulla mappa per segnare i dettagli da zoomare.
      </p>
    );
  }

  /**
   * Always write against the freshest list.
   *
   * Handlers close over the points as they were when the component rendered.
   * A click that promotes a point followed by the pointer-up of the same
   * gesture would otherwise write the pre-click list straight back over it,
   * quietly undoing the edit. Read the current state, then update it.
   */
  const persist = (update: (points: FocusPoint[]) => FocusPoint[]) => {
    const latest = useStudio.getState().artworks.find((a) => a.id === activeId)?.focusPoints ?? [];
    void setFocusPoints(activeId, update(latest));
  };

  const addAt = (cx: number, cy: number) => {
    if (art.focusPoints.length >= MAX_POINTS) return;
    const portrait = art.height > art.width * 1.08;
    /**
     * Snap to the detail actually under the click, and size the zoom to it.
     * A click is worth a few pixels of accuracy; at ×4 those pixels are the
     * difference between an eye and a cheekbone.
     */
    const snapped = pixels.current ? refineFocusPoint(pixels.current, cx, cy) : null;
    const p: FocusPoint = {
      id: `manual-${Date.now()}`,
      cx: snapped?.cx ?? cx,
      cy: snapped?.cy ?? cy,
      width: snapped?.width ?? (portrait ? 0.1 : 0.14),
      height: snapped?.height ?? (portrait ? 0.08 : 0.14),
      score: 1,
      semantic: "manual",
      recommendedZoom: snapped ? Math.round(snapped.zoom * 10) / 10 : portrait ? (cy < 0.42 ? 3.1 : 2.6) : 2.6,
      locked: true,
      source: "manual",
    };
    persist((pts) => (pts.length >= MAX_POINTS ? pts : [...pts, p]));
    setSelected(p.id);
  };

  /**
   * Promote a suggested point into the path.
   * Automatic points are proposals: they sit on the map as plain dots until
   * you touch one, and then they are yours — numbered, ordered, visited.
   */
  const promote = (id: string) => {
    persist((pts) => pts.map((p) => (p.id === id ? { ...p, locked: true, source: "manual", semantic: "manual" } : p)));
  };

  /** Nudge the selected point by a whisker — for the last half percent. */
  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    persist((pts) =>
      pts.map((p) => (p.id === selected ? { ...p, cx: clamp01(p.cx + dx), cy: clamp01(p.cy + dy) } : p)),
    );
  };

  const move = (id: string, cx: number, cy: number, commit: boolean) => {
    if (commit) {
      persist((pts) => pts.map((p) => (p.id === id ? { ...p, cx, cy } : p)));
      setDraft({});
    } else {
      setDraft({ [id]: { cx, cy } });
    }
  };

  const setZoom = (id: string, zoom: number) => {
    persist((pts) => pts.map((p) => (p.id === id ? { ...p, recommendedZoom: zoom, locked: true } : p)));
  };

  const remove = (id: string) => {
    persist((pts) => pts.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
  };

  const shift = (id: string, dir: -1 | 1) => {
    persist((pts) => {
      const i = pts.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= pts.length) return pts;
      const next = [...pts];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return next;
    });
  };

  const points = art.focusPoints.map((p) => (draft[p.id] ? { ...p, ...draft[p.id] } : p));
  const current = points.find((p) => p.id === selected);
  const visitIds = plan?.focusIds ?? points.filter((p) => p.source === "manual" || p.locked).map((p) => p.id);
  const box = containRect(size.w, size.h, art.width, art.height);
  const toPct = (cx: number, cy: number) => ({
    left: ((box.ox + cx * box.w) / size.w) * 100,
    top: ((box.oy + cy * box.h) / size.h) * 100,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Mappa dell'opera</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Clicca sul dipinto: il punto si aggancia al dettaglio sotto il dito e lo zoom si adatta alla sua
          dimensione. L'ordine dei numeri è il percorso del teaser — li visita tutti.
        </p>
      </div>
      <div
        ref={host}
        tabIndex={0}
        /**
         * The frame takes the artwork's own proportions: a portrait stops being
         * a thin strip inside a 4:3 box, so every click lands on a pixel of the
         * painting instead of a pixel of letterbox.
         */
        style={{
          aspectRatio: `${Math.max(1, art.width)} / ${Math.max(1, art.height)}`,
          maxWidth: `${Math.round((320 * Math.max(1, art.width)) / Math.max(1, art.height))}px`,
        }}
        className="relative mx-auto w-full cursor-crosshair overflow-hidden rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.01 : 0.002;
          if (e.key === "ArrowLeft") nudge(-step, 0);
          else if (e.key === "ArrowRight") nudge(step, 0);
          else if (e.key === "ArrowUp") nudge(0, -step);
          else if (e.key === "ArrowDown") nudge(0, step);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (!host.current) return;
          const uv = eventToUv(e, host.current, art.width, art.height);
          if (!uv.inside) return;
          const rect = host.current.getBoundingClientRect();
          const b = containRect(rect.width, rect.height, art.width, art.height);
          const hit = points.find((p) => {
            const px = b.ox + p.cx * b.w;
            const py = b.oy + p.cy * b.h;
            const dx = e.clientX - rect.left - px;
            const dy = e.clientY - rect.top - py;
            return Math.hypot(dx, dy) < 16;
          });
          if (hit) {
            dragId.current = hit.id;
            setSelected(hit.id);
            // a suggestion you touch becomes part of the path
            if (!visitIds.includes(hit.id)) promote(hit.id);
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            return;
          }
          addAt(uv.cx, uv.cy);
        }}
        onPointerMove={(e) => {
          if (!dragId.current || !host.current) return;
          const uv = eventToUv(e, host.current, art.width, art.height);
          move(dragId.current, uv.cx, uv.cy, false);
        }}
        onPointerUp={(e) => {
          if (!dragId.current || !host.current) return;
          const uv = eventToUv(e, host.current, art.width, art.height);
          move(dragId.current, uv.cx, uv.cy, true);
          dragId.current = null;
        }}
      >
        {url ? (
          <img src={url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {visitIds.length > 1 ? (
            <polyline
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              className="text-primary"
              points={visitIds
                .map((id) => points.find((p) => p.id === id))
                .filter(Boolean)
                .map((p) => {
                  const q = toPct(p!.cx, p!.cy);
                  return `${q.left},${q.top}`;
                })
                .join(" ")}
            />
          ) : null}
          {current ? (
            (() => {
              const halfW = Math.max(0.04, current.width * 0.5, 0.45 / current.recommendedZoom);
              const halfH = Math.max(0.04, current.height * 0.5, 0.45 / current.recommendedZoom);
              const x0 = clamp01(current.cx - halfW);
              const y0 = clamp01(current.cy - halfH);
              const x1 = clamp01(current.cx + halfW);
              const y1 = clamp01(current.cy + halfH);
              const a = toPct(x0, y0);
              const b = toPct(x1, y1);
              return (
                <rect
                  x={`${a.left}%`}
                  y={`${a.top}%`}
                  width={`${b.left - a.left}%`}
                  height={`${b.top - a.top}%`}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.85}
                  strokeWidth={1.25}
                  className="text-accent"
                />
              );
            })()
          ) : null}
        </svg>
        {points.map((p) => {
          const n = visitIds.indexOf(p.id);
          const used = n >= 0;
          // only points the teaser actually visits carry a number; the rest are
          // suggestions, and look like it
          const label = used ? n + 1 : "";
          const on = p.id === selected;
          const pos = toPct(p.cx, p.cy);
          return (
            <span
              key={p.id}
              title={used ? `Punto ${n + 1} del percorso` : "Suggerimento — clicca per metterlo nel percorso"}
              className={cn(
                "pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-semibold",
                used ? "size-6 text-[10px]" : "size-2.5 text-[0px]",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : used
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-foreground/40 bg-background/70",
              )}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            >
              {label}
            </span>
          );
        })}
      </div>

      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {points.map((p, i) => {
          const n = visitIds.indexOf(p.id);
          const on = p.id === selected;
          return (
            <li key={p.id}>
              <div
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1",
                  on ? "border-primary bg-primary/10" : "border-border bg-background",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px]">
                    {n >= 0 ? n + 1 : "–"}
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {(p.cx * 100).toFixed(1)}×{(p.cy * 100).toFixed(1)} · ×{p.recommendedZoom.toFixed(1)}
                  </span>
                </button>
                <button type="button" aria-label="Su" onClick={() => shift(p.id, -1)} className="p-1">
                  <ChevronUp className={cn("size-3.5", i === 0 ? "text-border" : "text-muted-foreground")} />
                </button>
                <button type="button" aria-label="Giù" onClick={() => shift(p.id, 1)} className="p-1">
                  <ChevronDown
                    className={cn("size-3.5", i === points.length - 1 ? "text-border" : "text-muted-foreground")}
                  />
                </button>
                <button type="button" aria-label="Togli" onClick={() => remove(p.id)} className="p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {current ? (
        <div className="space-y-2 rounded-lg border border-border bg-background px-2.5 py-2">
          <p className="text-xs text-foreground">
            Punto {visitIds.indexOf(current.id) + 1} · x {(current.cx * 100).toFixed(1)}% · y{" "}
            {(current.cy * 100).toFixed(1)}% · zoom ×{current.recommendedZoom.toFixed(1)}
          </p>
          <Slider
            min={1.3}
            max={4.4}
            step={0.1}
            value={[current.recommendedZoom]}
            onValueChange={([v]) => setZoom(current.id, v ?? 2.4)}
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            1.3 tutta l'opera · 4.4 dettaglio. Frecce = ordine di visita. Con la mappa selezionata, i tasti
            freccia spostano il punto di un soffio (Shift = passo più largo).
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Clicca l'opera per un punto, poi regola lo zoom.</p>
      )}
    </div>
  );
}
