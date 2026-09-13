import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { engineBridge } from "./bridge";
import { evaluateTeaser } from "./choreography";
import type { EngineSettings, OutputFormat, TeaserPlan } from "./types";
import { OUTPUT_PIXELS } from "./types";
import { exportSize, normalizeQuality } from "./export-size";
import { slugify } from "@/lib/utils";

export type { ExportQuality } from "./export-size";
export { exportSize, normalizeQuality } from "./export-size";

export interface ExportOptions {
  plan: TeaserPlan;
  settings: EngineSettings;
  artworkName: string;
  format: OutputFormat;
  onProgress?: (p: number, label?: string) => void;
  signal?: AbortSignal;
  draft?: boolean;
}

export function videoFileName(artworkName: string, seed: number, format: OutputFormat, w?: number, h?: number) {
  const px = OUTPUT_PIXELS[format];
  return `mads-hexagon_${slugify(artworkName)}_${seed}_${w ?? px.w}x${h ?? px.h}.mp4`;
}

function bitrateFor(w: number, h: number, fps: number) {
  const px = w * h;
  if (px >= 1440 * 2560) return 12_000_000;
  if (px >= 1080 * 1920) return 8_000_000;
  return 4_000_000;
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

async function avcOk(w: number, h: number, bitrate: number) {
  try {
    return await canEncodeVideo("avc", { width: w, height: h, bitrate });
  } catch {
    if (typeof VideoEncoder === "undefined") return false;
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec: "avc1.4D4028",
        width: w,
        height: h,
        bitrate,
        framerate: 30,
        avc: { format: "avc" },
      });
      return Boolean(r.supported);
    } catch {
      return false;
    }
  }
}

async function pickSize(format: OutputFormat, wanted: ReturnType<typeof exportSize>) {
  const ladder = [wanted];
  if (wanted.w !== OUTPUT_PIXELS[format].w) {
    const social = exportSize(format, "hd");
    ladder.push(social);
  }
  const draft = exportSize(format, "fast");
  if (ladder.every((s) => s.w !== draft.w)) ladder.push(draft);
  for (const size of ladder) {
    if (await avcOk(size.w, size.h, bitrateFor(size.w, size.h, size.fps))) return size;
  }
  return wanted;
}

async function encodeAvcMp4(
  canvas: HTMLCanvasElement,
  opts: ExportOptions,
  w: number,
  h: number,
  fps: number,
) {
  const frames = Math.max(1, Math.round(opts.plan.duration * fps));
  const bridge = engineBridge.current!;
  const bitrate = bitrateFor(w, h, fps);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: "avc",
    bitrate,
    bitrateMode: "variable",
    latencyMode: "quality",
    keyFrameInterval: 2,
    alpha: "discard",
  });
  output.addVideoTrack(source, { frameRate: fps });

  let audio: AudioBufferSource | null = null;
  try {
    if (await canEncodeAudio("aac")) {
      audio = new AudioBufferSource({ codec: "aac", bitrate: 96_000 });
      output.addAudioTrack(audio);
    }
  } catch {
    audio = null;
  }

  const mobile = isMobile();
  try {
    await output.start();
    if (audio) {
      const rate = 44100;
      const n = Math.max(rate, Math.floor(opts.plan.duration * rate));
      const ctx = new OfflineAudioContext(1, n, rate);
      await audio.add(ctx.createBuffer(1, n, rate));
    }
    const t0 = evaluateTeaser(opts.plan, 0, opts.settings);
    bridge.applyState(t0);
    bridge.renderFrame();
    await wait(24);

    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      bridge.applyState(evaluateTeaser(opts.plan, i / fps, opts.settings));
      bridge.renderFrame();
      await source.add(i / fps, 1 / fps);
      if (i % 8 === 0 || i === frames - 1) {
        opts.onProgress?.(i / frames, `${i + 1}/${frames} · H.264 ${w}×${h} ${fps}fps`);
      }
      if (mobile && i % 4 === 0) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      } else if (!mobile && i % 30 === 0) {
        await wait(0);
      }
    }
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength < 80_000) throw new Error("File troppo piccolo — encoder vuoto.");
    opts.onProgress?.(1, "MP4 H.264 pronto");
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
    "video/mp4;codecs=avc1.4D4028",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1.640028",
    "video/mp4",
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
  if (!mime || !mime.includes("mp4")) throw new Error("H.264 MP4 non disponibile in questo browser.");
  const frames = Math.max(1, Math.round(opts.plan.duration * fps));
  const bridge = engineBridge.current!;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(w, h, fps) });
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
    if (i % 8 === 0) opts.onProgress?.(i / frames, `${i + 1} / ${frames} · H.264`);
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: "video/mp4" });
  if (blob.size < 80_000) throw new Error("Registrazione vuota.");
  opts.onProgress?.(1, "MP4 H.264 pronto");
  return blob;
}

export async function exportTeaser(opts: ExportOptions): Promise<{ blob: Blob; name: string }> {
  const bridge = await waitForBridge(opts.signal);
  const wanted = exportSize(opts.format, opts.settings.exportQuality ?? "2k", opts.draft);
  const { w, h, fps } = await pickSize(opts.format, wanted);

  bridge.setExporting(true);
  bridge.setPixelSize(w, h);
  await wait(60);
  const canvas = bridge.getCanvas();
  if (!canvas) {
    bridge.setExporting(false);
    bridge.restoreSize();
    throw new Error("No render canvas.");
  }

  try {
    try {
      const blob = await encodeAvcMp4(canvas, opts, w, h, fps);
      return { blob, name: videoFileName(opts.artworkName, opts.plan.seed, opts.format, w, h) };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const blob = await encodeRecorder(canvas, opts, w, h, fps);
      return { blob, name: videoFileName(opts.artworkName, opts.plan.seed, opts.format, w, h) };
    }
  } finally {
    bridge.setExporting(false);
    bridge.restoreSize();
  }
}
