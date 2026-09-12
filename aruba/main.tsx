import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/app-shell";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("root missing");
createRoot(el).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
