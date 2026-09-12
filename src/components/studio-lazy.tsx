import { HexMark } from "@/components/hex-mark";
import { useEffect, useState, type ComponentType } from "react";

const studioPromise =
  typeof window !== "undefined" ? import("@/scene/StudioCanvas") : null;

export function StudioLazy() {
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void (studioPromise ?? import("@/scene/StudioCanvas"))
      .then((m) => {
        if (on) setCanvas(() => m.StudioCanvas);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load studio");
      });
    return () => {
      on = false;
    };
  }, []);
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-center">
        <p className="max-w-sm text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!Canvas) {
    return (
      <div className="relative flex h-full items-center justify-center bg-background">
        <canvas width={8} height={8} className="pointer-events-none absolute size-0 opacity-0" aria-hidden />
        <div className="text-center">
          <HexMark className="mx-auto mb-3 size-10 text-primary" />
          <p className="font-display text-sm tracking-wide">Carico lo studio…</p>
        </div>
      </div>
    );
  }
  return <Canvas />;
}
