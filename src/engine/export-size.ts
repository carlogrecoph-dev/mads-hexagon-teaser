import type { OutputFormat } from "./types.ts";
import { MASTER_PIXELS, OUTPUT_PIXELS } from "./types.ts";

export type ExportQuality = "fast" | "hd" | "2k";

function even(n: number) {
  return Math.max(2, Math.round(n) & ~1);
}

export function normalizeQuality(q: string | undefined): ExportQuality {
  if (q === "fast") return "fast";
  if (q === "2k") return "2k";
  return "hd";
}

/** Master 2K, social 1080p, bozza 720p. Always even, 30 fps except draft. */
export function exportSize(format: OutputFormat, quality: string | undefined, draft?: boolean) {
  const q = draft ? "fast" : normalizeQuality(quality);
  const master = MASTER_PIXELS[format];
  const social = OUTPUT_PIXELS[format];
  if (q === "2k") return { w: even(master.w), h: even(master.h), fps: 30, label: "2K" };
  if (q === "hd") return { w: even(social.w), h: even(social.h), fps: 30, label: "1080p" };
  return { w: even(social.w * (2 / 3)), h: even(social.h * (2 / 3)), fps: 24, label: "720p" };
}
