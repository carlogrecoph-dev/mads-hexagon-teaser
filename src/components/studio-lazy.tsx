import { HexMark } from "@/components/hex-mark";
import { Component, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";

async function loadStudio(attempt = 0): Promise<ComponentType> {
  try {
    const m = await import("@/scene/StudioCanvas");
    return m.StudioCanvas;
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    return loadStudio(attempt + 1);
  }
}

class Guard extends Component<{ children: ReactNode }, { err: string | null; n: number }> {
  state = { err: null as string | null, n: 0 };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "Studio crash" };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[studio]", err, info.componentStack);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <p className="max-w-sm text-sm text-destructive">{this.state.err}</p>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm"
            onClick={() => this.setState({ err: null, n: this.state.n + 1 })}
          >
            Riprova
          </button>
        </div>
      );
    }
    return <div className="contents" key={this.state.n}>{this.props.children}</div>;
  }
}

export function StudioLazy() {
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void loadStudio()
      .then((C) => {
        if (on) setCanvas(() => C);
      })
      .catch((err: unknown) => {
        if (on) setError(err instanceof Error ? err.message : "Failed to load studio");
      });
    return () => {
      on = false;
    };
  }, []);
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="max-w-sm text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-sm"
          onClick={() => {
            setError(null);
            setCanvas(null);
            void loadStudio().then((C) => setCanvas(() => C)).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Failed to load studio");
            });
          }}
        >
          Riprova
        </button>
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
  return (
    <Guard>
      <Canvas />
    </Guard>
  );
}
