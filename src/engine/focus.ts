import { zoomToFitRegion } from "./math.ts";
import type { FocusPoint, FocusSemantic } from "./types.ts";

function idx(x: number, y: number, w: number) {
  return (y * w + x) * 4;
}

function nmsPeaks(
  map: Float32Array,
  w: number,
  h: number,
  count: number,
  radius: number,
): { x: number; y: number; score: number }[] {
  const used = new Uint8Array(w * h);
  const peaks: { x: number; y: number; score: number }[] = [];
  const r2 = radius * radius;
  for (let n = 0; n < count; n++) {
    let best = -1;
    let bi = 0;
    for (let i = 0; i < map.length; i++) {
      if (used[i]) continue;
      const v = map[i] ?? 0;
      if (v > best) {
        best = v;
        bi = i;
      }
    }
    if (best < 0.022) break;
    const px = bi % w;
    const py = Math.floor(bi / w);
    peaks.push({ x: px, y: py, score: best });
    for (let y = Math.max(0, py - radius); y < Math.min(h, py + radius); y++) {
      for (let x = Math.max(0, px - radius); x < Math.min(w, px + radius); x++) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy <= r2) used[y * w + x] = 1;
      }
    }
  }
  return peaks;
}

function refinePeak(map: Float32Array, w: number, h: number, px: number, py: number) {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const r = 3;
  for (let y = Math.max(0, py - r); y <= Math.min(h - 1, py + r); y++) {
    for (let x = Math.max(0, px - r); x <= Math.min(w - 1, px + r); x++) {
      const v = map[y * w + x] ?? 0;
      sx += x * v;
      sy += y * v;
      sw += v;
    }
  }
  if (sw < 1e-6) return { x: px, y: py };
  return { x: sx / sw, y: sy / sw };
}

function blobExtent(
  map: Float32Array,
  w: number,
  h: number,
  px: number,
  py: number,
  thresh: number,
): { rw: number; rh: number } {
  const peak = map[py * w + px] ?? 0;
  const cut = Math.max(thresh, peak * 0.42);
  let x0 = px;
  let x1 = px;
  let y0 = py;
  let y1 = py;
  const maxR = Math.round(Math.min(w, h) * 0.22);
  for (let r = 1; r <= maxR; r++) {
    let ring = 0;
    let hit = 0;
    for (let a = 0; a < 24; a++) {
      const x = Math.round(px + Math.cos((a / 24) * Math.PI * 2) * r);
      const y = Math.round(py + Math.sin((a / 24) * Math.PI * 2) * r);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      ring++;
      if ((map[y * w + x] ?? 0) >= cut) {
        hit++;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    if (ring > 0 && hit / ring < 0.22) break;
  }
  return {
    rw: Math.max(0.045, (x1 - x0 + 1) / w / 2),
    rh: Math.max(0.045, (y1 - y0 + 1) / h / 2),
  };
}

function classify(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
): FocusSemantic {
  let skin = 0;
  let sat = 0;
  let edge = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor((cx - rw) * w));
  const x1 = Math.min(w - 1, Math.floor((cx + rw) * w));
  const y0 = Math.max(0, Math.floor((cy - rh) * h));
  const y1 = Math.min(h - 1, Math.floor((cy + rh) * h));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y, w);
      const r = (data[i] ?? 0) / 255;
      const g = (data[i + 1] ?? 0) / 255;
      const b = (data[i + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sat += max - min;
      const isSkin = r > 0.35 && g > 0.2 && b > 0.12 && r > g && g > b * 0.7 && r - b > 0.1;
      if (isSkin) skin++;
      if (x + 1 <= x1 && y + 1 <= y1) {
        const i2 = idx(x + 1, y, w);
        const i3 = idx(x, y + 1, w);
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        const l2 =
          0.3 * ((data[i2] ?? 0) / 255) +
          0.59 * ((data[i2 + 1] ?? 0) / 255) +
          0.11 * ((data[i2 + 2] ?? 0) / 255);
        const l3 =
          0.3 * ((data[i3] ?? 0) / 255) +
          0.59 * ((data[i3 + 1] ?? 0) / 255) +
          0.11 * ((data[i3 + 2] ?? 0) / 255);
        edge += Math.abs(l - l2) + Math.abs(l - l3);
      }
      n++;
    }
  }
  if (n === 0) return "composition";
  const skinR = skin / n;
  const satR = sat / n;
  const edgeR = edge / n;
  if (skinR > 0.16 && cy < 0.58) return "face";
  if (skinR > 0.09) return "figure";
  if (satR > 0.28) return "color";
  if (edgeR > 0.1) return "texture";
  if (satR > 0.16) return "contrast";
  return "composition";
}

export function analyzeImageData(imageData: ImageData): FocusPoint[] {
  const { width: w, height: h, data } = imageData;
  const lum = new Float32Array(w * h);
  const sal = new Float32Array(w * h);
  const skin = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const r = (data[i] ?? 0) / 255;
      const g = (data[i + 1] ?? 0) / 255;
      const b = (data[i + 2] ?? 0) / 255;
      lum[y * w + x] = 0.3 * r + 0.59 * g + 0.11 * b;
      skin[y * w + x] =
        r > 0.35 && g > 0.2 && b > 0.12 && r > g && g > b * 0.7 && r - b > 0.1 ? 1 : 0;
    }
  }

  const win = 4;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let mean = 0;
      let n = 0;
      for (let yy = y - win; yy <= y + win; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = x - win; xx <= x + win; xx++) {
          if (xx < 0 || xx >= w) continue;
          mean += lum[yy * w + xx] ?? 0;
          n++;
        }
      }
      mean /= Math.max(1, n);
      let v = 0;
      for (let yy = y - win; yy <= y + win; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = x - win; xx <= x + win; xx++) {
          if (xx < 0 || xx >= w) continue;
          const d = (lum[yy * w + xx] ?? 0) - mean;
          v += d * d;
        }
      }
      const gx =
        (lum[y * w + x + 1] ?? 0) -
        (lum[y * w + x - 1] ?? 0) +
        0.5 * ((lum[(y + 1) * w + x + 1] ?? 0) - (lum[(y + 1) * w + x - 1] ?? 0));
      const gy =
        (lum[(y + 1) * w + x] ?? 0) -
        (lum[(y - 1) * w + x] ?? 0) +
        0.5 * ((lum[(y + 1) * w + x + 1] ?? 0) - (lum[(y - 1) * w + x + 1] ?? 0));
      const edge = Math.hypot(gx, gy);
      const i = idx(x, y, w);
      const r = (data[i] ?? 0) / 255;
      const g = (data[i + 1] ?? 0) / 255;
      const b = (data[i + 2] ?? 0) / 255;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const nx = x / w - 0.5;
      const ny = y / h - 0.5;
      const center = Math.exp(-(nx * nx * 2.4 + ny * ny * 2.4));
      const thirds =
        Math.exp(-Math.pow((x / w - 1 / 3) * 7, 2)) +
        Math.exp(-Math.pow((x / w - 2 / 3) * 7, 2)) +
        Math.exp(-Math.pow((y / h - 1 / 3) * 7, 2)) +
        Math.exp(-Math.pow((y / h - 2 / 3) * 7, 2));
      const skinBoost = (skin[y * w + x] ?? 0) * (y / h < 0.58 ? 0.55 : 0.18);
      sal[y * w + x] =
        Math.sqrt(v / Math.max(1, n)) * 1.85 +
        edge * 1.15 +
        sat * 0.62 +
        center * 0.16 +
        thirds * 0.07 +
        skinBoost;
    }
  }

  const radius = Math.max(6, Math.round(Math.min(w, h) * 0.048));
  const peaks = nmsPeaks(sal, w, h, 16, radius);
  const skinPeaks = nmsPeaks(skin, w, h, 3, Math.max(10, Math.round(Math.min(w, h) * 0.07)));
  const maxScore = Math.max(0.001, peaks[0]?.score ?? 1);

  const points: FocusPoint[] = [];
  const used: { x: number; y: number }[] = [];

  const pushPeak = (
    p: { x: number; y: number; score: number },
    semanticHint?: FocusSemantic,
  ) => {
    const refined = refinePeak(sal, w, h, p.x, p.y);
    const cx = (refined.x + 0.5) / w;
    const cy = (refined.y + 0.5) / h;
    if (used.some((u) => Math.hypot(u.x / w - cx, u.y / h - cy) < 0.045)) return;
    used.push({ x: p.x, y: p.y });
    const ext = blobExtent(sal, w, h, p.x, p.y, maxScore * 0.12);
    const semantic = semanticHint ?? classify(data, w, h, cx, cy, ext.rw, ext.rh);
    const zoomBase =
      semantic === "face"
        ? 3.05
        : semantic === "texture"
          ? 2.85
          : semantic === "color"
            ? 2.35
            : 2.55;
    const tight = 1 - Math.min(ext.rw, ext.rh) / 0.22;
    points.push({
      id: `f${points.length}-${Math.round(cx * 10000)}-${Math.round(cy * 10000)}`,
      cx,
      cy,
      width: ext.rw * 2,
      height: ext.rh * 2,
      score: p.score / maxScore,
      semantic,
      recommendedZoom: Math.min(4.1, zoomBase + tight * 0.7),
      locked: false,
      source: "auto",
    });
  };

  for (const sp of skinPeaks) {
    if (sp.score < 0.08) continue;
    const cy = (sp.y + 0.5) / h;
    if (cy > 0.62) continue;
    pushPeak({ ...sp, score: Math.max(sp.score, maxScore * 0.92) }, "face");
  }
  for (const p of peaks) pushPeak(p);

  return points.slice(0, 14);
}

/**
 * Snap a hand-placed point onto the detail that is actually under it.
 *
 * A click lands where the eye aimed, give or take a few pixels; the teaser
 * then zooms to ×3 or ×4, where those few pixels are half a face. So take a
 * small window around the click, find the strongest feature inside it, and
 * measure how big that feature is — the point comes back centred on real
 * paint, with the zoom that frames it exactly.
 */
export function refineFocusPoint(
  imageData: ImageData,
  cx: number,
  cy: number,
  windowFrac = 0.09,
): { cx: number; cy: number; width: number; height: number; semantic: FocusSemantic; zoom: number } | null {
  const { width: w, height: h, data } = imageData;
  const rx = Math.max(4, Math.round(w * windowFrac));
  const ry = Math.max(4, Math.round(h * windowFrac));
  const px = Math.round(clamp01(cx) * (w - 1));
  const py = Math.round(clamp01(cy) * (h - 1));
  const x0 = Math.max(1, px - rx);
  const x1 = Math.min(w - 2, px + rx);
  const y0 = Math.max(1, py - ry);
  const y1 = Math.min(h - 2, py + ry);
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;

  const ww = x1 - x0 + 1;
  const hh = y1 - y0 + 1;
  const local = new Float32Array(ww * hh);
  let peak = 0;
  let bx = px;
  let by = py;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y, w);
      const r = (data[i] ?? 0) / 255;
      const g = (data[i + 1] ?? 0) / 255;
      const b = (data[i + 2] ?? 0) / 255;
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      const ir = idx(x + 1, y, w);
      const ib = idx(x, y + 1, w);
      const lr =
        0.3 * ((data[ir] ?? 0) / 255) + 0.59 * ((data[ir + 1] ?? 0) / 255) + 0.11 * ((data[ir + 2] ?? 0) / 255);
      const lb =
        0.3 * ((data[ib] ?? 0) / 255) + 0.59 * ((data[ib + 1] ?? 0) / 255) + 0.11 * ((data[ib + 2] ?? 0) / 255);
      const edge = Math.abs(l - lr) + Math.abs(l - lb);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // stay near where the finger actually landed: the further out, the less it counts
      const dx = (x - px) / rx;
      const dy = (y - py) / ry;
      const near = Math.exp(-(dx * dx + dy * dy) * 1.6);
      const v = (edge * 1.5 + sat * 0.5) * near;
      local[(y - y0) * ww + (x - x0)] = v;
      if (v > peak) {
        peak = v;
        bx = x;
        by = y;
      }
    }
  }
  if (peak < 1e-4) return null;

  const refined = refinePeak(local, ww, hh, bx - x0, by - y0);
  const fx = (x0 + refined.x + 0.5) / w;
  const fy = (y0 + refined.y + 0.5) / h;
  const ext = blobExtent(local, ww, hh, Math.round(refined.x), Math.round(refined.y), peak * 0.18);
  const width = clamp01(ext.rw * 2 * (ww / w));
  const height = clamp01(ext.rh * 2 * (hh / h));
  const semantic = classify(data, w, h, fx, fy, Math.max(0.02, width / 2), Math.max(0.02, height / 2));
  return {
    cx: clamp01(fx),
    cy: clamp01(fy),
    width: Math.max(0.04, width),
    height: Math.max(0.04, height),
    semantic,
    zoom: zoomToFitRegion(w, h, Math.max(0.04, width), Math.max(0.04, height)),
  };
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export async function analyzeArtwork(
  source: CanvasImageSource & { width: number; height: number },
): Promise<FocusPoint[]> {
  const max = 560;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const w = Math.max(48, Math.round(source.width * scale));
  const h = Math.max(48, Math.round(source.height * scale));
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return fallbackFoci();
  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const points = analyzeImageData(imageData);
  return points.length ? points : fallbackFoci();
}

export function fallbackFoci(): FocusPoint[] {
  return [
    {
      id: "thirds-a",
      cx: 0.33,
      cy: 0.33,
      width: 0.18,
      height: 0.18,
      score: 0.5,
      semantic: "composition",
      recommendedZoom: 2.55,
      locked: false,
      source: "auto",
    },
    {
      id: "center",
      cx: 0.5,
      cy: 0.5,
      width: 0.24,
      height: 0.24,
      score: 0.45,
      semantic: "composition",
      recommendedZoom: 2.15,
      locked: false,
      source: "auto",
    },
    {
      id: "thirds-b",
      cx: 0.66,
      cy: 0.62,
      width: 0.16,
      height: 0.16,
      score: 0.4,
      semantic: "composition",
      recommendedZoom: 2.7,
      locked: false,
      source: "auto",
    },
  ];
}

export function sampleSkinTone(
  source: CanvasImageSource & { width: number; height: number },
): { r: number; g: number; b: number } {
  const w = 48;
  const h = 48;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { r: 0.78, g: 0.62, b: 0.48 };
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = 12; y < 36; y++) {
    for (let x = 14; x < 34; x++) {
      const i = (y * w + x) * 4;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  }
  return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
}
