import type { ArtworkViewport } from "./types.ts";
import { DISPLAY_ASPECT } from "./config.ts";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function zoomFromSpread(base: number, cap: number, spread: number) {
  if (Math.abs(cap - base) < 0.05) return cap;
  return lerp(base, cap, clamp(spread, 0, 1));
}

export type Rng = () => number;

/** Mulberry32 — deterministic, seedable. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng: Rng, min: number, max: number) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export function rngRange(rng: Rng, min: number, max: number) {
  return min + rng() * (max - min);
}

export function smootherstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function easeInOutCubic(t: number) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t: number) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

export function easeInOutSine(t: number) {
  const x = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

export function easeInOutQuad(t: number) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export interface BlitRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Visible source window (pixels) of the artwork on a 16:9 panel.
 * Portrait images keep full width and a short horizontal slice —
 * so the crop MUST be allowed to travel to the top (eyes) and bottom.
 */
export function sourceCrop(
  artW: number,
  artH: number,
  zoom: number,
  displayAspect = DISPLAY_ASPECT,
): { sw: number; sh: number } {
  const z = Math.max(1, zoom);
  const artAspect = artW / Math.max(1e-6, artH);
  const fill = clamp((z - 1) / 0.85, 0, 1);
  const destAspect = lerp(artAspect, displayAspect, fill);
  let baseSw: number;
  let baseSh: number;
  if (artAspect > destAspect) {
    baseSh = artH;
    baseSw = artH * destAspect;
  } else {
    baseSw = artW;
    baseSh = artW / destAspect;
  }
  let sw = Math.min(artW, baseSw / z);
  let sh = sw / destAspect;
  if (sh > artH) {
    sh = artH;
    sw = sh * destAspect;
  }
  if (sw > artW) {
    sw = artW;
    sh = sw / destAspect;
  }
  return { sw, sh };
}

/** Zoom so a normalized (width,height) region fills the 16:9 panel. */
export function zoomToFitRegion(
  artW: number,
  artH: number,
  width: number,
  height: number,
  displayAspect = DISPLAY_ASPECT,
): number {
  const aw = Math.max(0.04, width) * 1.28;
  const ah = Math.max(0.04, height) * 1.28;
  const artAspect = artW / Math.max(1e-6, artH);
  const zW = 1 / aw;
  const zH = artAspect / displayAspect / ah;
  return clamp(Math.min(zW, zH), 1.25, 4.2);
}

export function computeBlit(
  artW: number,
  artH: number,
  displayW: number,
  displayH: number,
  viewport: ArtworkViewport,
): BlitRect {
  const zoom = Math.max(1, viewport.zoom);
  const artAspect = artW / Math.max(1e-6, artH);
  const dispAspect = displayW / Math.max(1e-6, displayH);

  let cdw: number;
  let cdh: number;
  if (artAspect > dispAspect) {
    cdw = displayW;
    cdh = displayW / artAspect;
  } else {
    cdh = displayH;
    cdw = displayH * artAspect;
  }
  const cdx = (displayW - cdw) / 2;
  const cdy = (displayH - cdh) / 2;

  const fill = clamp((zoom - 1) / 0.85, 0, 1);
  const dx = lerp(cdx, 0, fill);
  const dy = lerp(cdy, 0, fill);
  const dw = lerp(cdw, displayW, fill);
  const dh = lerp(cdh, displayH, fill);

  const { sw, sh } = sourceCrop(artW, artH, zoom, dispAspect);

  let sx = viewport.cx * artW - sw / 2;
  let sy = viewport.cy * artH - sh / 2;
  sx = clamp(sx, 0, Math.max(0, artW - sw));
  sy = clamp(sy, 0, Math.max(0, artH - sh));

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

export function clampViewport(
  v: ArtworkViewport,
  artW = 1,
  artH = 1,
  displayAspect = DISPLAY_ASPECT,
): ArtworkViewport {
  const zoom = clamp(v.zoom, 1, 4.4);
  if (zoom <= 1.0001) return { zoom: 1, cx: 0.5, cy: 0.5 };
  const { sw, sh } = sourceCrop(artW, artH, zoom, displayAspect);
  const padX = sw / Math.max(1e-6, artW) / 2;
  const padY = sh / Math.max(1e-6, artH) / 2;
  return {
    zoom,
    cx: clamp(v.cx, padX, 1 - padX),
    cy: clamp(v.cy, padY, 1 - padY),
  };
}

export function containSize(artW: number, artH: number, displayAspect = DISPLAY_ASPECT) {
  const artAspect = artW / Math.max(1e-6, artH);
  if (artAspect > displayAspect) {
    return { w: 1, h: displayAspect / artAspect };
  }
  return { w: artAspect / displayAspect, h: 1 };
}

export function quadBezier(p0: number, p1: number, p2: number, t: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export function lerpVec(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function hashSeed(n: number, salt = 0) {
  let x = (n + salt * 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Irregular 1D wander — hashed keys, not a repeating sine. */
export function wander(t: number, seed: number, channel: number, hz: number) {
  const u = Math.max(0, t) * hz + channel * 13.17;
  const i = Math.floor(u);
  const f = u - i;
  const a = hashSeed(seed, i * 4099 + channel * 17) / 4294967296;
  const b = hashSeed(seed, (i + 1) * 4099 + channel * 17) / 4294967296;
  const s = f * f * (3 - 2 * f);
  return (a * 2 - 1) * (1 - s) + (b * 2 - 1) * s;
}

/** Unsteady hand on glass: always a little off, never a loop you can hum. */
export function liveHand(t: number, seed: number) {
  const slowx = wander(t, seed, 1, 0.33) * 0.62 + wander(t, seed, 5, 0.79) * 0.38;
  const slowy = wander(t, seed, 2, 0.29) * 0.58 + wander(t, seed, 6, 0.71) * 0.42;
  const slowz = wander(t, seed, 3, 0.24) * 0.65 + wander(t, seed, 7, 0.67) * 0.35;
  const fx = wander(t, seed, 21, 3.05) * 0.55 + wander(t, seed, 24, 5.4) * 0.45;
  const fy = wander(t, seed, 22, 2.73) * 0.55 + wander(t, seed, 25, 4.8) * 0.45;
  const fz = wander(t, seed, 23, 2.2) * 0.7 + wander(t, seed, 26, 3.9) * 0.3;
  return {
    cx: slowx * 0.02 + fx * 0.009,
    cy: slowy * 0.026 + fy * 0.011,
    zoom: slowz * 0.06 + fz * 0.022,
    spread: wander(t, seed, 11, 1.45) * 0.038,
  };
}
