import { HEX, MOVEMENT_PRESETS } from "./config.ts";
import {
  artPointToUv,
  FINGER_BACK,
  glassFingerDir,
  glassUvToWorld,
  PALM_CLEAR,
  projectToGlass,
  tableY,
  worldPosToGlassUv,
  worldToGlassUv,
  wristOnUv,
} from "./glass.ts";
import { clamp, lerp, zoomFromSpread } from "./math.ts";
import type { EngineSettings, GestureId, InteractionState, TeaserState } from "./types.ts";
import type { TouchBeat } from "./touch.ts";

export type { TouchBeat };

const HALF_W = HEX.screen55.width * 0.47;
const HALF_D = (HEX.screen55.height / 2) * Math.cos(HEX.tableTilt);
const Z_MIN = HEX.tableZ - HALF_D + 0.04;
const Z_MAX = HEX.tableZ + HALF_D - 0.04;

export {
  FINGER_BACK,
  glassFingerDir,
  PALM_CLEAR,
  projectToGlass,
  tableY,
  worldPosToGlassUv,
  worldToGlassUv,
  Z_MIN,
  Z_MAX,
  HALF_W,
};

export function onGlass(x: number, z: number, extra = 0) {
  return projectToGlass(x, tableY(z) + 0.05, z, PALM_CLEAR + extra);
}

export function isOnMonitor(z: number) {
  return z > HEX.tableZ - 0.38;
}

export function soloHand(pose: GestureId, lead: number, panX: number) {
  if (pose === "PAN_LEFT") return "left" as const;
  if (pose === "PAN_RIGHT") return "right" as const;
  if (lead < -0.15) return "left" as const;
  if (lead > 0.15) return "right" as const;
  return panX < 0 ? ("left" as const) : ("right" as const);
}

export function glassForArtPoint(cx: number, cy: number, zoom: number, artW = 1, artH = 1) {
  const { u, v } = artPointToUv(cx, cy, zoom, artW, artH);
  const p = glassUvToWorld(u, v, 0);
  return { x: p.x, z: p.z, u, v };
}

export function handsFromInteraction(
  interaction: InteractionState,
  settings: EngineSettings,
  artW = 1,
  artH = 1,
  _beat?: TouchBeat,
): TeaserState["hands"] {
  const pose = interaction.gesture;
  const spread = clamp(interaction.spread, 0, 1);
  const lead = clamp(interaction.lead ?? 0, -1, 1);
  const glance = clamp(interaction.glance ?? 0, 0, 1);
  const lift = glance > 0.45 ? 0.012 : 0;

  const tx = interaction.targetCx ?? 0.5;
  const ty = interaction.targetCy ?? 0.5;
  const zoomMax = lerp(2.35, MOVEMENT_PRESETS[settings.preset].zoomMax, settings.zoomIntensity);
  const base = clamp(interaction.baseZoom ?? 1.05, 1.05, zoomMax);
  const cap = clamp(interaction.targetZoom ?? zoomMax, 1.05, Math.max(zoomMax, 4.4));
  const zoom = zoomFromSpread(base, cap, spread);
  const { u, v } = artPointToUv(tx, ty, zoom, artW, artH);
  const du = lerp(0.045, 0.11, spread);
  const dragging = pose.startsWith("PAN");

  let uL = clamp(u - du, 0.04, 0.96);
  let uR = clamp(u + du, 0.04, 0.96);
  let vL = v;
  let vR = v;
  if (dragging) {
    const slide = 0.09;
    const leadRight = pose === "PAN_RIGHT" || (pose !== "PAN_LEFT" && lead >= 0);
    if (pose === "PAN_RIGHT") {
      if (leadRight) uR = clamp(u + slide, 0.04, 0.96);
      else uL = clamp(u + slide, 0.04, 0.96);
    } else if (pose === "PAN_LEFT") {
      if (leadRight) uR = clamp(u - slide, 0.04, 0.96);
      else uL = clamp(u - slide, 0.04, 0.96);
    } else if (pose === "PAN_UP") {
      const vv = clamp(v - slide, 0.04, 0.96);
      if (leadRight) vR = vv;
      else vL = vv;
    } else if (pose === "PAN_DOWN") {
      const vv = clamp(v + slide, 0.04, 0.96);
      if (leadRight) vR = vv;
      else vL = vv;
    }
  }

  return {
    left: { ...wristOnUv(uL, vL, lift), pose, lift, press: 1 - lift, role: "pinch" },
    right: { ...wristOnUv(uR, vR, lift), pose, lift, press: 1 - lift, role: "pinch" },
  };
}

export function handSeparation(hands: TeaserState["hands"]) {
  return Math.hypot(hands.right.x - hands.left.x, hands.right.z - hands.left.z);
}
