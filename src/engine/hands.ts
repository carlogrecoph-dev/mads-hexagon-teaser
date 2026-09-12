import { HEX, MOVEMENT_PRESETS } from "./config.ts";
import { clamp, computeBlit, lerp, zoomFromSpread } from "./math.ts";
import type { EngineSettings, GestureId, InteractionState, TeaserState } from "./types.ts";

/**
 * 55" glass: near the operator is LOW, far edge is HIGH.
 * Matches TableMonitor Rx(-tilt) after the screen is laid flat.
 */
export function tableY(z: number) {
  return HEX.tableHeight + 0.008 + Math.tan(HEX.tableTilt) * (z - HEX.tableZ);
}

const NY = Math.cos(HEX.tableTilt);
const NZ = -Math.sin(HEX.tableTilt);
/** Bezel half-depth + palm pad — wrist sits ON the glass, mesh never through. */
const PALM_CLEAR = 0.05;
const HALF_W = HEX.screen55.width * 0.47;
const HALF_D = (HEX.screen55.height / 2) * Math.cos(HEX.tableTilt);
const Z_MIN = HEX.tableZ - HALF_D + 0.05;
const Z_MAX = HEX.tableZ + HALF_D - 0.05;
const MIN_HALF = 0.07;

/**
 * RULE: a working palm sits exactly on the 55" glass.
 * Wrist is PALM_CLEAR along the screen normal so the pad rests, never through.
 */
export function onGlass(x: number, z: number, extra = 0) {
  const xx = clamp(x, -HALF_W, HALF_W);
  const zz = clamp(z, Z_MIN, Z_MAX);
  const c = PALM_CLEAR + extra;
  return { x: xx, y: tableY(zz) + NY * c, z: zz + NZ * c };
}

export function isOnMonitor(z: number) {
  return z > HEX.tableZ - 0.32;
}

function onHip(side: 1 | -1, pose: GestureId) {
  return { x: side * 0.2, y: 0.99, z: HEX.personZ + 0.1, pose };
}

export function soloHand(pose: GestureId, lead: number, panX: number) {
  if (pose === "PAN_LEFT") return "left" as const;
  if (pose === "PAN_RIGHT") return "right" as const;
  if (lead < -0.15) return "left" as const;
  if (lead > 0.15) return "right" as const;
  return panX < 0 ? ("left" as const) : ("right" as const);
}

export function worldToGlassUv(x: number, z: number) {
  const u = (HALF_W - x) / Math.max(1e-6, 2 * HALF_W);
  const v = (Z_MAX - z) / Math.max(1e-6, Z_MAX - Z_MIN);
  return { u: clamp(u, -0.08, 1.08), v: clamp(v, -0.08, 1.08) };
}

/**
 * Where an artwork point sits on the 55" after the table mesh Rz(π):
 * canvas right → world −X, canvas top → world +Z (far).
 */
export function glassForArtPoint(
  cx: number,
  cy: number,
  zoom: number,
  artW = 1,
  artH = 1,
) {
  const blit = computeBlit(artW, artH, 16, 9, { cx, cy, zoom: Math.max(1, zoom) });
  const ax = clamp(cx, 0, 1) * artW;
  const ay = clamp(cy, 0, 1) * artH;
  const u = (blit.dx + ((ax - blit.sx) / Math.max(1e-6, blit.sw)) * blit.dw) / 16;
  const v = (blit.dy + ((ay - blit.sy) / Math.max(1e-6, blit.sh)) * blit.dh) / 9;
  return {
    x: lerp(HALF_W, -HALF_W, clamp(u, 0, 1)),
    z: lerp(Z_MAX, Z_MIN, clamp(v, 0, 1)),
  };
}

/**
 * Palms always on glass. Home = where the inspected point sits on the 55".
 * Two hands spread around that point = zoom. One hand slides = pan.
 */
export function handsFromInteraction(
  interaction: InteractionState,
  settings: EngineSettings,
  artW = 1,
  artH = 1,
): TeaserState["hands"] {
  const pose = interaction.gesture;
  const spread = clamp(interaction.spread, 0, 1);
  const lead = clamp(interaction.lead ?? 0, -1, 1);
  const glance = clamp(interaction.glance ?? 0, 0, 1);
  const lift = glance > 0.45 ? 0.01 : 0;

  const tx = interaction.targetCx ?? 0.5;
  const ty = interaction.targetCy ?? 0.5;
  const zoomMax = lerp(2.35, MOVEMENT_PRESETS[settings.preset].zoomMax, settings.zoomIntensity);
  const base = clamp(interaction.baseZoom ?? 1.05, 1.05, zoomMax);
  const cap = clamp(interaction.targetZoom ?? zoomMax, 1.05, Math.max(zoomMax, 4.4));
  const zoom = zoomFromSpread(base, cap, spread);
  const home = glassForArtPoint(tx, ty, zoom, artW, artH);
  const half = lerp(0.048, 0.125, spread);
  const dragging = pose.startsWith("PAN");

  if (dragging) {
    const slide = 0.11;
    let mx = home.x;
    let mz = home.z;
    if (pose === "PAN_RIGHT") mx += slide;
    else if (pose === "PAN_LEFT") mx -= slide;
    else if (pose === "PAN_UP") mz += slide;
    else if (pose === "PAN_DOWN") mz -= slide;
    const leadRight = pose === "PAN_RIGHT" || (pose !== "PAN_LEFT" && lead >= 0);
    const trail = onGlass(home.x + (leadRight ? -half : half), home.z, lift);
    const moving = onGlass(mx, mz, lift);
    return leadRight
      ? { left: { ...trail, pose }, right: { ...moving, pose } }
      : { left: { ...moving, pose }, right: { ...trail, pose } };
  }

  return {
    left: { ...onGlass(home.x - half, home.z, lift), pose },
    right: { ...onGlass(home.x + half, home.z, lift), pose },
  };
}

export { PALM_CLEAR, Z_MIN, Z_MAX, HALF_W };

export function handSeparation(hands: TeaserState["hands"]) {
  return Math.hypot(hands.right.x - hands.left.x, hands.right.z - hands.left.z);
}
