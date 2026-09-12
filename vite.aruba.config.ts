import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/** Static SPA for Apache/Aruba — no Node server. */
export default defineConfig({
  root: resolve(__dirname, "aruba"),
  publicDir: false,
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: resolve(__dirname, "dist-aruba"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
  },
});
