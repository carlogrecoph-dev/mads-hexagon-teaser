import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/app-shell";
import "./styles.css";

class BootGuard extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "Errore" };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[hexagon]", err, info.componentStack);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, color: "#f3f1ec", fontFamily: "Outfit, system-ui, sans-serif" }}>
          <p style={{ color: "#e83a7a", fontWeight: 600 }}>Lo studio non è partito</p>
          <p style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>{this.state.err}</p>
          <button
            type="button"
            style={{ marginTop: 16, padding: "8px 12px" }}
            onClick={() => location.reload()}
          >
            Ricarica
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById("root");
if (!el) throw new Error("root missing");
createRoot(el).render(
  <StrictMode>
    <BootGuard>
      <AppShell />
    </BootGuard>
  </StrictMode>,
);
