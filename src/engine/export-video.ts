import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
} from "mediabunny";
import { engineBridge } from "./bridge";
import { evaluateTeaser } from "./choreography";
import type { EngineSettings, OutputFormat, TeaserPlan } from "./types";
import { OUTPUT_PIXELS } from "./types";
import { slugify } from "@/lib/utils";

export interface ExportOptions {
  plan: TeaserPlan;
  settings: EngineSettings;
  artworkName: string;
  format: OutputFormat;
  onProgress?: (p: number, label?: string) => void;
  signal?: AbortSignal;
  draft?: boolean;
}

export function exportSize(format: OutputFormat, quality: "fast" | "hd" | undefined, draft?: boolean) {
  const px = OUTPUT_PIXELS[format];
  const s = draft ? 0.5 : quality === "hd" ? 1 : 2 / 3;
  const fps = quality === "hd" && !draft ? 30 : 24;
  return { w: Math.round(px.w * s) & ~1, h: Math.round(px.h * s) & ~1, fps };
}

export function videoFileName(artworkName: string, seed: number, format: OutputFormat, w?: number, h?: number) {
  const px = OUTPUT_PIXELS[format];
  return `mads-hexagon_${slugify(artworkName)}_${seed}_${w ?? px.w}x${h ?? px.h}.mp4`;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMobile() {
  return typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

async function waitForBridge(signal?: AbortSignal) {
  for (let i = 0; i < 50; i++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const bridge = engineBridge.current;
    const canvas = bridge?.getCanvas() ?? null;
    if (bridge && canvas && canvas.width > 8 && canvas.height > 8) return bridge;
    await wait(40);
  }
  throw new Error("Studio non pronto. Aspetta che l'anteprima 3D sia visibile e riprova.");
}

async function codecSupported(codec: "avc" | "vp9", w: number, h: number, fps: number) {
  if (typeof VideoEncoder === "undefined") return false;
  const spec = codec === "avc" ? "avc1.4d001f" : "vp09.00.41.08";
  try {
    const r = await VideoEncoder.isConfigSupported({
      codec: spec,
      width: w,
      height: h,
      bitrate: 5_000_000,
      framerate: fps,
    });
    return Boolean(r.supported);
  } catch {
    return false;
  }
}

async function encodeWebCodecs(
  canvas: HTMLCanvasElement,
  opts: ExportOptions,
  w: number,
  h: number,
  fps: number,
  codec: "avc" | "vp9",
) {
  const frames = Math.max(1, Math.round(opts.plan.duration * fps));
  const bridge = engineBridge.current!;
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: opts.draft ? QUALITY_MEDIUM : QUALITY_HIGH,
  });
  output.addVideoTrack(source, { frameRate: fps });
  const mobile = isMobile();

  try {
    await output.start();
    const t0 = evaluateTeaser(opts.plan, 0, opts.settings);
    bridge.applyState(t0);
    bridge.renderFrame();
    await wait(32);

    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const t = i / fps;
      bridge.applyState(evaluateTeaser(opts.plan, t, opts.settings));
      bridge.renderFrame();
      await source.add(t, 1 / fps);
      if (i % 10 === 0 || i === frames - 1) {
        opts.onProgress?.(i / frames, `${i + 1} / ${frames} · ${w}×${h} ${fps}fps`);
      }
      if (mobile && i % 6 === 0) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      } else if (!mobile && i % 24 === 0) {
        await wait(0);
      }
    }
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength < 80_000) throw new Error("File troppo piccolo — encoder vuoto.");
    opts.onProgress?.(1, "Pronto");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (err) {
    try {
      await output.cancel();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function pickRecorderMime() {
  const types = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function encodeRecorder(
  canvas: HTMLCanvasElement,
  opts: ExportOptions,
  w: number,
  h: number,
  fps: number,
) {
  const mime = pickRecorderMime();
  if (!mime) throw new Error("Nessun encoder video in questo browser.");
  const frames = Math.max(1, Math.round(opts.plan.duration * fps));
  const bridge = engineBridge.current!;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    rec.onstop = () => resolve();
    rec.onerror = () => reject(new Error("MediaRecorder error"));
  });
  rec.start(250);
  const t0 = evaluateTeaser(opts.plan, 0, opts.settings);
  bridge.applyState(t0);
  bridge.renderFrame();
  track.requestFrame?.();
  await wait(40);

  for (let i = 0; i < frames; i++) {
    if (opts.signal?.aborted) {
      rec.stop();
      throw new DOMException("Cancelled", "AbortError");
    }
    bridge.applyState(evaluateTeaser(opts.plan, i / fps, opts.settings));
    bridge.renderFrame();
    track.requestFrame?.();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (i % 8 === 0) opts.onProgress?.(i / frames, `${i + 1} / ${frames} · registrazione`);
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: mime.includes("mp4") ? "video/mp4" : "video/webm" });
  if (blob.size < 80_000) throw new Error("Registrazione vuota.");
  opts.onProgress?.(1, "Pronto");
  return blob;
}

export async function exportTeaser(opts: ExportOptions): Promise<{ blob: Blob; name: string }> {
  const bridge = await waitForBridge(opts.signal);
  const { w, h, fps } = exportSize(opts.format, opts.settings.exportQuality ?? "fast", opts.draft);

  bridge.setExporting(true);
  bridge.setPixelSize(w, h);
  await wait(60);
  const canvas = bridge.getCanvas();
  if (!canvas) {
    bridge.setExporting(false);
    bridge.restoreSize();
    throw new Error("No render canvas.");
  }

  const codecs: Array<"avc" | "vp9"> = [];
  if (await codecSupported("avc", w, h, fps)) codecs.push("avc");
  if (await codecSupported("vp9", w, h, fps)) codecs.push("vp9");

  try {
    let lastErr: unknown = new Error("Impossibile codificare il video.");
    for (const codec of codecs) {
      try {
        const blob = await encodeWebCodecs(canvas, opts, w, h, fps, codec);
        return { blob, name: videoFileName(opts.artworkName, opts.plan.seed, opts.format, w, h) };
      } catch (err) {
        lastErr = err;
        if (opts.signal?.aborted) throw err;
      }
    }
    try {
      const blob = await encodeRecorder(canvas, opts, w, h, fps);
      const ext = blob.type.includes("webm") ? "webm" : "mp4";
      return {
        blob,
        name: videoFileName(opts.artworkName, opts.plan.seed, opts.format, w, h).replace(/\.mp4$/, `.${ext}`),
      };
    } catch (err) {
      throw lastErr instanceof Error ? lastErr : err;
    }
  } finally {
    bridge.setExporting(false);
    bridge.restoreSize();
  }
}
