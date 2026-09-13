import {
  CAMERA_PRESETS,
  CAMERA_SEQUENCES,
  LIMITS,
  MOVEMENT_PRESETS,
} from "./config.ts";
import {
  clamp,
  clampViewport,
  createRng,
  easeInOutCubic,
  easeInOutSine,
  easeOutCubic,
  lerp,
  lerpVec,
  quadBezier,
  rngPick,
  rngRange,
  smootherstep,
  zoomFromSpread,
  zoomToFitRegion,
  liveHand,
  seedUnit,
} from "./math.ts";
import { handsFromInteraction } from "./hands.ts";
import { distractionAt } from "./idle.ts";
import { applyFormatOptics, droneCameraId, droneLabel, evaluateDrone, generateDroneFlight } from "./drone.ts";
import type {
  CameraId,
  CameraPose,
  EngineSettings,
  FocusPoint,
  GestureId,
  HoldSegment,
  InteractionState,
  PlanSegment,
  TeaserPlan,
  TransitionPrimitive,
  TransitionSegment,
} from "./types.ts";

const PRIMITIVES: TransitionPrimitive[] = [
  "DRONE_RISE",
  "DRONE_DESCEND",
  "DRONE_ARC_LEFT",
  "DRONE_ARC_RIGHT",
  "DRONE_PULLBACK",
  "DRONE_PUSH_FORWARD",
  "DRONE_ORBIT",
  "MONITOR_PASS",
  "SHOULDER_PASS",
  "TOP_REVEAL",
];

const MAX_VISITS = 10;
const SECONDS_PER_VISIT = 7.5;
const VISIT_TAIL = 6;
const MAX_DURATION = 72;

const REST: InteractionState = {
  spread: 0.08,
  panX: 0,
  panY: 0,
  point: 0,
  lead: 0,
  glance: 0,
  glanceDir: 0,
  stretch: 0,
  targetZoom: 1.05,
  baseZoom: 1.05,
  gesture: "HOLD",
};

export interface PlanInput {
  seed: number;
  focusPoints: FocusPoint[];
  settings: EngineSettings;
  duration?: number;
  artWidth?: number;
  artHeight?: number;
}

function orderPath(points: FocusPoint[]): FocusPoint[] {
  if (points.length <= 1) return points;
  const remaining = [...points];
  remaining.sort((a, b) => b.score - a.score);
  const path: FocusPoint[] = [remaining.shift()!];
  while (remaining.length) {
    const last = path[path.length - 1]!;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]!;
      const d = Math.hypot(p.cx - last.cx, p.cy - last.cy) - p.score * 0.12;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    path.push(remaining.splice(bi, 1)[0]!);
  }
  return path;
}

function pickFoci(points: FocusPoint[], rng: () => number, n: number) {
  const manual = points.filter((p) => p.source === "manual" || p.locked);
  if (manual.length) return manual.slice(0, 16);
  const rest = [...points].sort((a, b) => b.score - a.score);
  const out: FocusPoint[] = [];
  for (const p of rest) {
    if (out.length >= n) break;
    if (!out.some((o) => Math.hypot(o.cx - p.cx, o.cy - p.cy) < 0.055)) out.push(p);
  }
  if (out.length === 0) {
    out.push({
      id: "center",
      cx: 0.5,
      cy: 0.5,
      width: 0.3,
      height: 0.3,
      score: 1,
      semantic: "composition",
      recommendedZoom: 1.7,
      locked: false,
      source: "auto",
    });
  }
  void rng;
  return orderPath(out);
}

function expandPortraitPath(points: FocusPoint[], artW: number, artH: number): FocusPoint[] {
  if (artH <= artW * 1.08 || points.length < 2) return points;
  const out: FocusPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1];
    if (
      b &&
      Math.abs(a.cy - b.cy) < 0.09 &&
      Math.abs(a.cx - b.cx) > 0.06 &&
      Math.abs(a.cx - b.cx) < 0.42
    ) {
      const cx = (a.cx + b.cx) * 0.5;
      const cy = (a.cy + b.cy) * 0.5;
      const w = Math.abs(a.cx - b.cx) + Math.max(a.width, b.width) * 0.5;
      const h = Math.max(a.height, b.height) + Math.abs(a.cy - b.cy);
      out.push({
        id: `pair-${a.id}-${b.id}`,
        cx,
        cy,
        width: w,
        height: h,
        score: Math.max(a.score, b.score) + 0.05,
        semantic: "figure",
        recommendedZoom: zoomToFitRegion(artW, artH, w, h),
        locked: true,
        source: a.source,
      });
    }
    const zFit = zoomToFitRegion(artW, artH, Math.max(0.08, a.width), Math.max(0.08, a.height));
    out.push({
      ...a,
      recommendedZoom:
        a.source === "manual" || a.locked ? Math.max(a.recommendedZoom, zFit * 0.92) : a.recommendedZoom,
    });
  }
  return out;
}

function interactionForFocus(
  focus: FocusPoint | undefined,
  settings: EngineSettings,
  kind: GestureId,
  rng: () => number,
  boost = 1,
): InteractionState {
  const panI = settings.panIntensity;
  if (!focus) {
    return { ...REST, gesture: kind };
  }
  const zMax = lerp(2.35, MOVEMENT_PRESETS[settings.preset].zoomMax, settings.zoomIntensity);
  const z = clamp(focus.recommendedZoom * boost, 1.2, Math.max(zMax, 4.4));
  const span = Math.max(0.2, zMax - 1);
  const spread =
    kind === "SPREAD"
      ? clamp((z - 1) / span, 0.62, 1)
      : kind === "PINCH" || kind === "RETURN"
        ? clamp((z - 1) / span, 0.04, 0.16)
        : clamp((z - 1) / span, 0.22, 0.7);
  const panX = clamp((focus.cx - 0.5) * 2.15, -1, 1) * (0.75 + 0.25 * panI);
  const panY = clamp((focus.cy - 0.5) * 2.15, -1, 1) * (0.75 + 0.25 * panI);
  const lead = kind === "SPREAD" || kind === "PINCH" || kind === "RETURN" ? 0 : panX < 0 ? -1 : 1;
  void rng;
  return {
    spread,
    panX,
    panY,
    point: kind === "DETAIL_POINT" ? 0.9 : kind === "SPREAD" ? 0.35 : 0.22,
    lead,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: focus.cx,
    targetCy: focus.cy,
    targetZoom: z,
    gesture: kind,
  };
}

function missionFor(
  prev: InteractionState,
  f: FocusPoint,
): { kind: GestureId; lead: number } {
  const dx = f.cx - (prev.targetCx ?? 0.5);
  const dy = f.cy - (prev.targetCy ?? 0.5);
  const pz = prev.targetZoom ?? 1;
  if (f.recommendedZoom > pz * 1.12) return { kind: "SPREAD", lead: 0 };
  if (f.recommendedZoom < pz * 0.72) return { kind: "PINCH", lead: 0 };
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { kind: dx < 0 ? "PAN_LEFT" : "PAN_RIGHT", lead: dx < 0 ? -1 : 1 };
  }
  return { kind: dy < 0 ? "PAN_UP" : "PAN_DOWN", lead: f.cx < 0.5 ? -1 : 1 };
}

function panAtZoom(base: InteractionState, rng: () => number, scale = 1): InteractionState {
  const z = Math.max(1.15, base.targetZoom ?? 1.6);
  const step = (0.042 / z) * scale;
  const dirX = rng() > 0.5 ? 1 : -1;
  const dirY = rng() > 0.42 ? (rng() > 0.5 ? 1 : -1) : 0;
  const gesture: GestureId =
    dirY > 0 ? "PAN_UP" : dirY < 0 ? "PAN_DOWN" : dirX > 0 ? "PAN_RIGHT" : "PAN_LEFT";
  return {
    ...base,
    spread: rngRange(rng, 0.06, 0.12),
    panX: dirX,
    panY: dirY,
    lead: dirX,
    point: 0.12,
    glance: 0,
    targetCx: clamp((base.targetCx ?? 0.5) + dirX * step, 0.07, 0.93),
    targetCy: clamp((base.targetCy ?? 0.5) - dirY * step * 0.9, 0.07, 0.93),
    targetZoom: z,
    baseZoom: z,
    gesture,
  };
}

function moonPan(base: InteractionState, rng: () => number): [InteractionState, InteractionState] {
  const z = Math.max(1.15, base.targetZoom ?? 1.6);
  const r = (0.04 / z) * rngRange(rng, 0.85, 1.35);
  const a0 = rngRange(rng, 0, Math.PI * 2);
  const sweep = (rng() > 0.5 ? 1 : -1) * rngRange(rng, Math.PI * 0.5, Math.PI * 0.95);
  const cx = base.targetCx ?? 0.5;
  const cy = base.targetCy ?? 0.5;
  const at = (ang: number): InteractionState => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const gesture: GestureId =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "PAN_RIGHT" : "PAN_LEFT") : dy > 0 ? "PAN_UP" : "PAN_DOWN";
    return {
      ...base,
      spread: rngRange(rng, 0.06, 0.12),
      panX: dx,
      panY: dy,
      lead: dx >= 0 ? 0.4 : -0.4,
      point: 0.12,
      glance: 0,
      targetCx: clamp(cx + dx * r, 0.07, 0.93),
      targetCy: clamp(cy - dy * r, 0.07, 0.93),
      targetZoom: z,
      baseZoom: z,
      gesture,
    };
  };
  return [at(a0 + sweep * 0.5), at(a0 + sweep)];
}

function oneHandPan(
  base: InteractionState,
  dir: "up" | "down" | "left" | "right",
  lead: number,
): InteractionState {
  const panX = dir === "right" ? 1 : dir === "left" ? -1 : 0;
  const panY = dir === "up" ? 1 : dir === "down" ? -1 : 0;
  const gesture: GestureId =
    dir === "up" ? "PAN_UP" : dir === "down" ? "PAN_DOWN" : dir === "right" ? "PAN_RIGHT" : "PAN_LEFT";
  const hand = dir === "left" ? -1 : dir === "right" ? 1 : lead >= 0 ? 1 : -1;
  return {
    ...base,
    spread: Math.min(0.14, Math.max(0.1, base.spread || 0.12)),
    panX,
    panY,
    lead: hand,
    point: 0.18,
    glance: 0,
    stretch: 0.22,
    targetZoom: base.targetZoom,
    baseZoom: base.baseZoom ?? base.targetZoom,
    gesture,
  };
}

function heldPose(base: InteractionState, rng: () => number, glance: boolean): InteractionState {
  const z = Math.max(1.05, base.targetZoom ?? 1.15);
  const dir = rng() > 0.5 ? 1 : -1;
  return {
    ...base,
    spread: rngRange(rng, 0.05, 0.1),
    panX: (base.panX ?? 0) * 0.4,
    panY: (base.panY ?? 0) * 0.4,
    point: 0.05,
    lead: 0,
    glance: glance ? rngRange(rng, 0.68, 1) : rngRange(rng, 0, 0.1),
    glanceDir: glance ? dir : 0,
    stretch: glance ? rngRange(rng, 0.25, 0.7) : rngRange(rng, 0, 0.1),
    targetZoom: z,
    baseZoom: z,
    gesture: "HOLD",
  };
}

function fullFrame(rng: () => number): InteractionState {
  return {
    spread: rngRange(rng, 0.05, 0.1),
    panX: 0,
    panY: 0,
    point: 0.2,
    lead: 0,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: 0.5,
    targetCy: 0.5,
    targetZoom: 1.05,
    baseZoom: 1.05,
    gesture: "PINCH",
  };
}

function closeHands(f: FocusPoint, zHeld: number, rng: () => number): InteractionState {
  return {
    spread: rngRange(rng, 0.05, 0.1),
    panX: 0,
    panY: 0,
    point: 0.72,
    lead: 0,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: f.cx,
    targetCy: f.cy,
    targetZoom: zHeld,
    baseZoom: zHeld,
    gesture: "DETAIL_POINT",
  };
}

function openHands(f: FocusPoint, zHeld: number, zGoal: number, rng: () => number): InteractionState {
  return {
    spread: rngRange(rng, 0.84, 0.98),
    panX: 0,
    panY: 0,
    point: 0.3,
    lead: 0,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: f.cx,
    targetCy: f.cy,
    targetZoom: zGoal,
    baseZoom: zHeld,
    gesture: "SPREAD",
  };
}

function zoomState(
  f: FocusPoint,
  z: number,
  zMax: number,
  gesture: GestureId,
  rng: () => number,
): InteractionState {
  const span = Math.max(0.35, zMax - 1);
  const spread =
    gesture === "PINCH" || gesture === "RETURN"
      ? clamp((z - 1) / span, 0.08, 0.2)
      : clamp((z - 1) / span, 0.88, 1);
  void rng;
  return {
    spread,
    panX: clamp((f.cx - 0.5) * 2.1, -1, 1),
    panY: clamp((f.cy - 0.5) * 2.1, -1, 1),
    point: gesture === "SPREAD" ? 0.32 : 0.14,
    lead: 0,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: f.cx,
    targetCy: f.cy,
    targetZoom: z,
    gesture,
  };
}

function crawl(base: InteractionState, rng: () => number): InteractionState {
  if ((base.glance ?? 0) > 0.6) return base;
  const r = rngRange(rng, 0.032, 0.068);
  const a = rngRange(rng, 0, Math.PI * 2);
  return {
    ...base,
    targetCx: clamp((base.targetCx ?? 0.5) + Math.cos(a) * r, 0.06, 0.94),
    targetCy: clamp((base.targetCy ?? 0.5) + Math.sin(a) * r, 0.06, 0.94),
    targetZoom: clamp((base.targetZoom ?? 1.2) * rngRange(rng, 0.985, 1.025), 1.08, 4.2),
    panX: clamp((base.targetCx ?? 0.5) * 2 - 1, -1, 1),
    panY: clamp((base.targetCy ?? 0.5) * 2 - 1, -1, 1),
  };
}

function phraseWeight(prev: InteractionState, next: InteractionState, kind: GestureId) {
  const dist =
    Math.hypot((next.targetCx ?? 0.5) - (prev.targetCx ?? 0.5), (next.targetCy ?? 0.5) - (prev.targetCy ?? 0.5)) +
    Math.abs((next.targetZoom ?? 1) - (prev.targetZoom ?? 1)) * 0.14;
  if (kind.startsWith("PAN")) return clamp(0.26 + dist * 0.48, 0.24, 0.58);
  const zoomExtra = kind === "SPREAD" || kind === "PINCH" ? 0.1 : 0;
  return clamp(0.42 + dist * 0.7 + zoomExtra, 0.36, 0.95);
}

function tremorGate(t: number, duration: number, seed: number) {
  const c1 = 3.8 + seedUnit(seed, 3) * 7.4;
  const c2 = duration * (0.5 + seedUnit(seed, 5) * 0.32);
  const pulse = (c: number) => {
    const d = Math.abs(t - c);
    return d < 0.65 ? 0.5 + 0.5 * Math.cos((d / 0.65) * Math.PI) : 0;
  };
  return Math.max(pulse(c1), pulse(Math.min(duration - 2.8, c2)));
}

function primitiveForPair(from: CameraId, to: CameraId, rng: () => number): TransitionPrimitive {
  if (from !== "top" && to === "top") {
    return rngPick(rng, ["DRONE_RISE", "TOP_REVEAL", "DRONE_PULLBACK"]);
  }
  if (from === "top" && to !== "top") {
    return rngPick(rng, ["DRONE_DESCEND", "SHOULDER_PASS", "DRONE_PUSH_FORWARD"]);
  }
  if (from === "left" && to === "right") {
    return rngPick(rng, ["DRONE_ARC_RIGHT", "MONITOR_PASS", "DRONE_ORBIT"]);
  }
  if (from === "right" && to === "left") {
    return rngPick(rng, ["DRONE_ARC_LEFT", "MONITOR_PASS", "DRONE_ORBIT"]);
  }
  return rngPick(rng, PRIMITIVES);
}

export function generatePlan(input: PlanInput): TeaserPlan {
  const rng = createRng(input.seed);
  const settings = input.settings;
  const artW = Math.max(1, input.artWidth ?? 1);
  const artH = Math.max(1, input.artHeight ?? 1);
  const rawOrder = CAMERA_SEQUENCES[Math.floor(rng() * CAMERA_SEQUENCES.length)] ?? CAMERA_SEQUENCES[0]!;
  const order: CameraId[] = [];
  for (const c of rawOrder) if (!order.includes(c)) order.push(c);
  const manual = input.focusPoints.filter((p) => p.source === "manual" || p.locked);
  const guided = manual.length > 0;
  const foci = guided
    ? manual.slice(0, MAX_VISITS)
    : expandPortraitPath(pickFoci(input.focusPoints, rng, 7), artW, artH).slice(0, 3);
  const baseDuration = input.duration ?? rngRange(rng, LIMITS.duration[0], LIMITS.duration[1]);
  const needed = guided ? SECONDS_PER_VISIT * foci.length + VISIT_TAIL : 0;
  const duration = clamp(Math.max(baseDuration, needed), LIMITS.duration[0], MAX_DURATION);

  const transScale = lerp(1.15, 0.72, settings.transitionDuration);
  const t1 = clamp(rngRange(rng, 1.35, 1.85) * transScale, 1.2, 2.1);
  const t2 = clamp(rngRange(rng, 1.35, 1.85) * transScale, 1.2, 2.1);

  const iFull: InteractionState = {
    ...REST,
    spread: rngRange(rng, 0.02, 0.1),
    lead: 0,
    targetCx: 0.5,
    targetCy: 0.5,
    targetZoom: 1.05,
    baseZoom: 1.05,
  };
  const iReturn: InteractionState = {
    spread: rngRange(rng, 0.02, 0.08),
    panX: rngRange(rng, -0.08, 0.08),
    panY: rngRange(rng, -0.06, 0.06),
    point: 0,
    lead: 0,
    glance: 0,
    glanceDir: 0,
    stretch: 0,
    targetCx: 0.5,
    targetCy: 0.5,
    targetZoom: 1.05,
    baseZoom: 1.05,
    gesture: "RETURN",
  };

  const visits: FocusPoint[] = [...foci];
  while (visits.length < 3) visits.push(foci[visits.length % Math.max(1, foci.length)]!);

  const camAt = (i: number): CameraId => {
    const n = Math.max(1, visits.length);
    const slot = Math.min(order.length - 1, Math.floor((i / n) * order.length));
    return order[slot]!;
  };

  type Step =
    | { kind: "hold"; cam: CameraId; w: number; from: InteractionState; to: InteractionState; gesture: GestureId; focusId?: string }
    | { kind: "trans"; fromC: CameraId; toC: CameraId; w: number; from: InteractionState; to: InteractionState };

  const steps: Step[] = [];
  let prev = iFull;
  let cam = order[0]!;

  visits.forEach((f, i) => {
    const nextCam = camAt(i);
    const zMax = lerp(2.35, MOVEMENT_PRESETS[settings.preset].zoomMax, settings.zoomIntensity);
    const rec =
      f.locked || f.source === "manual"
        ? clamp(f.recommendedZoom, 1.3, 4.4)
        : clamp(f.recommendedZoom, 1.45, zMax - 0.05);
    const heat = f.locked || f.source === "manual" || f.score > 0.62 ? 1.12 : 1;

    if (nextCam !== cam) {
      steps.push({ kind: "trans", fromC: cam, toC: nextCam, w: 1, from: prev, to: prev });
      cam = nextCam;
    }

    const pinchClosed: InteractionState = {
      spread: 0.08,
      panX: 0,
      panY: 0,
      point: 0.55,
      lead: 0,
      glance: 0,
      glanceDir: 0,
      stretch: 0,
      targetCx: f.cx,
      targetCy: f.cy,
      targetZoom: rec,
      baseZoom: 1.05,
      gesture: "PINCH",
    };
    const pinchOpen: InteractionState = {
      ...pinchClosed,
      spread: rngRange(rng, 0.94, 1),
      point: 0.28,
      gesture: "SPREAD",
    };

    steps.push({ kind: "hold", cam, w: 2.2, from: prev, to: pinchClosed, gesture: "DETAIL_POINT", focusId: f.id });
    steps.push({ kind: "hold", cam, w: 3.7 * heat, from: pinchClosed, to: pinchOpen, gesture: "SPREAD", focusId: f.id });

    const looking: InteractionState = {
      ...pinchOpen,
      spread: pinchOpen.spread,
      targetZoom: rec,
      baseZoom: rec,
      gesture: "HOLD",
      stretch: 0.08,
    };
    steps.push({ kind: "hold", cam, w: 2.15, from: pinchOpen, to: looking, gesture: "HOLD", focusId: f.id });

    const parked: InteractionState = {
      ...looking,
      spread: 0.12,
      targetZoom: rec,
      baseZoom: rec,
      gesture: "HOLD",
    };
    steps.push({ kind: "hold", cam, w: 0.7, from: looking, to: parked, gesture: "HOLD", focusId: f.id });

    const lead = i % 2 === 0 ? 1 : -1;
    const up = oneHandPan(parked, "up", lead);
    const down = oneHandPan(up, "down", lead);
    const right = oneHandPan(down, "right", lead);
    const left = oneHandPan(right, "left", lead);
    steps.push({ kind: "hold", cam, w: 1.45, from: parked, to: up, gesture: up.gesture, focusId: f.id });
    steps.push({ kind: "hold", cam, w: 1.4, from: up, to: down, gesture: down.gesture, focusId: f.id });
    steps.push({ kind: "hold", cam, w: 1.35, from: down, to: right, gesture: right.gesture, focusId: f.id });
    steps.push({ kind: "hold", cam, w: 1.35, from: right, to: left, gesture: left.gesture, focusId: f.id });

    const wideAgain: InteractionState = {
      ...pinchOpen,
      panX: 0,
      panY: 0,
      lead: 0,
      stretch: 0,
      gesture: "PINCH",
    };
    steps.push({ kind: "hold", cam, w: 1.2, from: left, to: wideAgain, gesture: "DETAIL_POINT", focusId: f.id });
    steps.push({ kind: "hold", cam, w: 3.7, from: wideAgain, to: pinchClosed, gesture: "PINCH", focusId: f.id });

    prev = {
      ...pinchClosed,
      spread: 0.08,
      targetZoom: 1.05,
      baseZoom: 1.05,
      targetCx: 0.5,
      targetCy: 0.5,
      glance: 0,
      glanceDir: 0,
      stretch: 0,
      gesture: "HOLD",
    };
    steps.push({ kind: "hold", cam, w: 0.55, from: pinchClosed, to: prev, gesture: "HOLD" });

    // Every other visit: 2s off the glass — shake the fingers, check the wall monitors.
    if (i < visits.length - 1 && i % 2 === 0) {
      const dir = i % 4 === 0 ? 1 : -1;
      const lookA: InteractionState = {
        ...prev,
        spread: 0.1,
        point: 0,
        lead: 0,
        glance: 0.94,
        glanceDir: dir,
        stretch: 0.62,
        gesture: "HOLD",
      };
      const lookB: InteractionState = { ...lookA, glanceDir: -dir, stretch: 0.4 };
      steps.push({ kind: "hold", cam, w: 0.35, from: prev, to: lookA, gesture: "HOLD" });
      steps.push({ kind: "hold", cam, w: 2.0, from: lookA, to: lookB, gesture: "HOLD" });
      prev = { ...lookB, glance: 0, glanceDir: 0, stretch: 0, gesture: "HOLD" };
      steps.push({ kind: "hold", cam, w: 0.4, from: lookB, to: prev, gesture: "HOLD" });
    }
  });

  const iGlance: InteractionState = {
    ...prev,
    spread: Math.min(prev.spread, 0.12),
    targetZoom: 1.08,
    baseZoom: 1.08,
    point: 0,
    lead: rngRange(rng, -0.2, 0.2),
    glance: rngRange(rng, 0.75, 1),
    glanceDir: rng() > 0.5 ? 1 : -1,
    stretch: rngRange(rng, 0.15, 0.5),
    gesture: "HOLD",
  };
  steps.push({ kind: "hold", cam, w: 1.15, from: prev, to: iGlance, gesture: "HOLD" });
  steps.push({ kind: "hold", cam, w: 1.1, from: iGlance, to: iGlance, gesture: "HOLD" });
  steps.push({ kind: "hold", cam, w: 1.35, from: iGlance, to: iReturn, gesture: "RETURN" });

  const holdSteps = steps.filter((s) => s.kind === "hold");
  const transSteps = steps.filter((s) => s.kind === "trans");
  const transDurs = transSteps.map((_, i) =>
    clamp((i === 0 ? t1 : i === 1 ? t2 : rngRange(rng, 1.35, 1.8) * transScale), 1.2, 2.2),
  );
  const transBudget = transDurs.reduce((a, d) => a + d, 0);
  const holdBudget = Math.max(28, duration - transBudget);
  const wsum = holdSteps.reduce((a, s) => a + s.w, 0);

  let t = 0;
  const segments: PlanSegment[] = [];
  let transIdx = 0;

  for (const s of steps) {
    if (s.kind === "hold") {
      const dur = (s.w / wsum) * holdBudget;
      const seg: HoldSegment = {
        kind: "hold",
        camera: s.cam,
        t0: t,
        t1: t + dur,
        gesture: s.gesture,
        from: s.from,
        to: s.to,
        focusId: s.focusId,
      };
      segments.push(seg);
      t += dur;
    } else {
      const dur = transDurs[transIdx] ?? 0.8;
      transIdx += 1;
      const seg: TransitionSegment = {
        kind: "transition",
        fromCamera: s.fromC,
        toCamera: s.toC,
        primitive: primitiveForPair(s.fromC, s.toC, rng),
        t0: t,
        t1: t + dur,
        curvature: rngRange(rng, 0.35, 1),
        height: rngRange(rng, 0.25, 0.9),
        from: s.from,
        to: s.to,
      };
      segments.push(seg);
      t += dur;
    }
  }

  const last = segments[segments.length - 1];
  if (last) last.t1 = duration;

  return {
    seed: input.seed,
    duration,
    format: settings.format,
    preset: settings.preset,
    order,
    segments,
    focusIds: foci.map((f) => f.id),
    artWidth: artW,
    artHeight: artH,
    drone: generateDroneFlight(input.seed, duration, {
      model: settings.droneModel ?? 0,
      opening: settings.droneOpening ?? "auto",
    }),
  };
}

function mixInteraction(a: InteractionState, b: InteractionState, t: number): InteractionState {
  const k = easeInOutCubic(t);
  const spread = lerp(a.spread, b.spread, k);
  const panX = lerp(a.panX, b.panX, k);
  const panY = lerp(a.panY, b.panY, k);
  const lead = lerp(a.lead ?? 0, b.lead ?? 0, k);
  const targetZoom = lerp(a.targetZoom ?? 1, b.targetZoom ?? 1, k);
  const gesture: GestureId = k > 0.72 ? b.gesture : a.gesture;
  return {
    spread,
    panX,
    panY,
    point: lerp(a.point, b.point, k),
    lead,
    glance: lerp(a.glance ?? 0, b.glance ?? 0, k),
    glanceDir: lerp(a.glanceDir ?? 0, b.glanceDir ?? 0, k),
    stretch: lerp(a.stretch ?? 0, b.stretch ?? 0, k),
    targetCx: lerp(a.targetCx ?? 0.5, b.targetCx ?? 0.5, k),
    targetCy: lerp(a.targetCy ?? 0.5, b.targetCy ?? 0.5, k),
    targetZoom,
    baseZoom: lerp(a.baseZoom ?? a.targetZoom ?? 1, b.baseZoom ?? b.targetZoom ?? 1, k),
    gesture,
  };
}

export function viewportFromInteraction(
  interaction: InteractionState,
  settings: EngineSettings,
  artW = 1,
  artH = 1,
): { cx: number; cy: number; zoom: number } {
  const preset = MOVEMENT_PRESETS[settings.preset];
  const zoomMax = lerp(2.35, preset.zoomMax, settings.zoomIntensity);
  const base = clamp(interaction.baseZoom ?? 1.05, 1.05, zoomMax);
  const cap = clamp(interaction.targetZoom ?? zoomMax, 1.05, Math.max(zoomMax, 4.4));
  const zoom = zoomFromSpread(base, cap, interaction.spread);
  const dragging = interaction.gesture.startsWith("PAN");
  const drag = 0.11 / Math.max(1.2, zoom);
  const cx = (interaction.targetCx ?? 0.5) + (dragging ? -interaction.panX * drag : 0);
  const cy = (interaction.targetCy ?? 0.5) + (dragging ? -interaction.panY * drag : 0);
  return clampViewport({ cx, cy, zoom }, artW, artH);
}

export { handsFromInteraction } from "./hands.ts";

function keepClear(p: { x: number; y: number; z: number }) {
  p.y = Math.max(1.22, p.y);
  const radial = Math.hypot(p.x, p.z);
  if (p.y < 2.35 && radial < 0.48) {
    const s = 0.48 / Math.max(radial, 0.05);
    p.x *= s;
    p.z = Math.min(p.z, -0.4);
  }
  if (radial > 2.55) {
    const s = 2.55 / radial;
    p.x *= s;
    p.z *= s;
  }
  return p;
}

function waypointFor(
  from: CameraPose,
  to: CameraPose,
  primitive: TransitionPrimitive,
  curvature: number,
  height: number,
): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  const mid = lerpVec(from.position, to.position, 0.5);
  const tgt = lerpVec(from.target, to.target, 0.5);
  const rise = 0.35 + height * 0.7;
  switch (primitive) {
    case "DRONE_RISE":
      mid.y += rise;
      mid.z *= 0.7;
      tgt.y += 0.15;
      break;
    case "DRONE_DESCEND":
      mid.y = Math.max(mid.y, from.position.y) + 0.15;
      mid.x += (to.position.x - from.position.x) * 0.2;
      break;
    case "DRONE_ARC_LEFT":
      mid.x -= 0.45 * curvature;
      mid.y += 0.35 * height;
      break;
    case "DRONE_ARC_RIGHT":
      mid.x += 0.45 * curvature;
      mid.y += 0.35 * height;
      break;
    case "DRONE_PULLBACK":
      mid.z -= 0.55 * curvature;
      mid.y += 0.4;
      break;
    case "DRONE_PUSH_FORWARD":
      mid.z += 0.35;
      mid.y += 0.2;
      break;
    case "DRONE_ORBIT":
      mid.x += (from.position.z - to.position.z) * 0.25 * curvature;
      mid.z += (to.position.x - from.position.x) * 0.25 * curvature;
      mid.y += 0.3;
      break;
    case "MONITOR_PASS":
      mid.y = Math.max(1.35, mid.y);
      mid.x *= 1.15;
      tgt.y += 0.1;
      break;
    case "SHOULDER_PASS":
      mid.y = 1.55;
      mid.z = Math.min(mid.z, -0.55);
      break;
    case "TOP_REVEAL":
      mid.y = Math.max(mid.y, 3.2);
      mid.z *= 0.4;
      break;
  }
  return { position: keepClear(mid), target: tgt };
}

function microMotion(t: number, seed: number, intensity: number, stab: number) {
  const amp = (1 - stab) * intensity * 0.028;
  return {
    x: Math.sin(t * 0.53 + seed * 0.01) * amp,
    y: Math.sin(t * 0.41 + 1.7) * amp * 0.6,
    z: Math.cos(t * 0.37 + 0.4) * amp * 0.8,
  };
}

function actionPush(base: CameraPose, cameraId: CameraId, interaction: InteractionState): CameraPose {
  if (interaction.gesture !== "SPREAD") return base;
  const k =
    clamp(((interaction.spread ?? 0) - 0.22) / 0.78, 0, 1) *
    clamp(((interaction.targetZoom ?? 1) - 1.25) / 1.5, 0, 1);
  if (k < 0.04) return base;
  if (cameraId === "top") {
    return {
      ...base,
      position: {
        x: base.position.x,
        y: base.position.y - 0.7 * k,
        z: base.position.z + 0.24 * k,
      },
      fov: base.fov - 9 * k,
    };
  }
  return {
    ...base,
    position: {
      x: base.position.x * (1 - 0.14 * k),
      y: base.position.y - 0.12 * k,
      z: lerp(base.position.z, -0.2, k * 0.28),
    },
    fov: base.fov - 6 * k,
  };
}

function poseWithMicro(base: CameraPose, t: number, seed: number, settings: EngineSettings): CameraPose {
  const preset = MOVEMENT_PRESETS[settings.preset];
  const m = microMotion(t, seed, settings.cameraIntensity * preset.cameraAmp, settings.stabilization);
  return {
    position: {
      x: base.position.x + m.x,
      y: base.position.y + m.y,
      z: base.position.z + m.z,
    },
    target: {
      x: base.target.x + m.x * 0.3,
      y: base.target.y,
      z: base.target.z + m.z * 0.2,
    },
    fov: base.fov,
    roll: base.roll,
    barrel: base.barrel,
  };
}

function interpolateCameras(
  from: CameraPose,
  to: CameraPose,
  primitive: TransitionPrimitive,
  curvature: number,
  height: number,
  t: number,
): CameraPose {
  const k = easeInOutSine(t);
  const wp = waypointFor(from, to, primitive, curvature, height);
  const pos = keepClear({
    x: quadBezier(from.position.x, wp.position.x, to.position.x, k),
    y: quadBezier(from.position.y, wp.position.y, to.position.y, k),
    z: quadBezier(from.position.z, wp.position.z, to.position.z, k),
  });
  const target = {
    x: quadBezier(from.target.x, wp.target.x, to.target.x, k),
    y: quadBezier(from.target.y, wp.target.y, to.target.y, k),
    z: quadBezier(from.target.z, wp.target.z, to.target.z, k),
  };
  return {
    position: pos,
    target,
    fov: lerp(from.fov, to.fov, k),
    roll: lerp(from.roll, to.roll, easeOutCubic(k)),
    barrel: lerp(from.barrel, to.barrel, k),
  };
}

export function evaluateTeaser(plan: TeaserPlan, time: number, settings: EngineSettings) {
  const t = clamp(time, 0, plan.duration);
  const seg =
    plan.segments.find((s) => t >= s.t0 && t <= s.t1) ??
    plan.segments[plan.segments.length - 1]!;
  const dur = Math.max(1e-4, seg.t1 - seg.t0);
  const local = (t - seg.t0) / dur;
  const interactionMix = mixInteraction(seg.from, seg.to, local);
  const shake = tremorGate(t, plan.duration, plan.seed);
  const live = liveHand(t, plan.seed);
  const lapse = seg.kind === "hold" ? distractionAt(t, plan.seed) : { glance: 0, glanceDir: 0, stretch: 0 };
  const glance = Math.max(interactionMix.glance ?? 0, lapse.glance);
  const interaction = {
    ...interactionMix,
    targetCx: (interactionMix.targetCx ?? 0.5) + live.cx * shake * 0.35,
    targetCy: (interactionMix.targetCy ?? 0.5) + live.cy * shake * 0.35,
    spread: clamp(interactionMix.spread + live.spread * shake * 0.2, 0, 1),
    panX: clamp(interactionMix.panX + live.cx * 3 * shake, -1, 1),
    panY: clamp(interactionMix.panY + live.cy * 3 * shake, -1, 1),
    glance,
    glanceDir: lapse.glance > 0.25 ? lapse.glanceDir : (interactionMix.glanceDir ?? 0),
    stretch: Math.max(interactionMix.stretch ?? 0, lapse.stretch),
  };
  const viewport = viewportFromInteraction(
    interaction,
    settings,
    plan.artWidth || 1,
    plan.artHeight || 1,
  );
  const hands = handsFromInteraction(interaction, settings, plan.artWidth || 1, plan.artHeight || 1);
  const k0 = smootherstep(clamp(local - 0.03, 0, 1));
  const k1 = smootherstep(local);
  const cx0 = lerp(seg.from.targetCx ?? 0.5, seg.to.targetCx ?? 0.5, k0);
  const cy0 = lerp(seg.from.targetCy ?? 0.5, seg.to.targetCy ?? 0.5, k0);
  const z0 = lerp(seg.from.targetZoom ?? 1, seg.to.targetZoom ?? 1, k0);
  const cx1 = lerp(seg.from.targetCx ?? 0.5, seg.to.targetCx ?? 0.5, k1);
  const cy1 = lerp(seg.from.targetCy ?? 0.5, seg.to.targetCy ?? 0.5, k1);
  const z1 = lerp(seg.from.targetZoom ?? 1, seg.to.targetZoom ?? 1, k1);
  const inv = 1 / Math.max(0.03 * dur, 1e-3);
  const touch = {
    dCx: (cx1 - cx0) * inv,
    dCy: (cy1 - cy0) * inv,
    dZoom: (z1 - z0) * inv,
    speed: Math.hypot(cx1 - cx0, cy1 - cy0) * inv + Math.abs(z1 - z0) * inv * 0.2,
  };

  let cameraId: CameraId;
  let camera: CameraPose;
  let label: string;

  if (plan.drone && plan.drone.keys.length > 1) {
    camera = applyFormatOptics(poseWithMicro(evaluateDrone(plan.drone, t), t, plan.seed, settings), settings.format);
    cameraId = droneCameraId(camera);
    label = droneLabel(plan.drone, t);
  } else if (seg.kind === "hold") {
    cameraId = seg.camera;
    camera = actionPush(
      poseWithMicro(CAMERA_PRESETS[cameraId], t, plan.seed, settings),
      cameraId,
      interaction,
    );
    label = `${seg.camera.toUpperCase()} · ${seg.gesture.replace("_", " ")}`;
  } else {
    cameraId = local < 0.5 ? seg.fromCamera : seg.toCamera;
    camera = interpolateCameras(
      CAMERA_PRESETS[seg.fromCamera],
      CAMERA_PRESETS[seg.toCamera],
      seg.primitive,
      seg.curvature,
      seg.height,
      local,
    );
    label = `${seg.primitive.replaceAll("_", " ")}`;
  }

  return {
    time: t,
    duration: plan.duration,
    cameraId,
    camera,
    viewport,
    interaction,
    hands,
    touch,
    segmentLabel: label,
    seed: plan.seed,
  };
}

export function planFingerprint(plan: TeaserPlan) {
  return JSON.stringify({
    seed: plan.seed,
    duration: Number(plan.duration.toFixed(4)),
    order: plan.order,
    format: plan.format,
    preset: plan.preset,
    drone: plan.drone?.keys.map((k) => ({
      t: +k.t.toFixed(3),
      k: k.kind,
      x: +k.position.x.toFixed(3),
      y: +k.position.y.toFixed(3),
    })),
    segments: plan.segments.map((s) =>
      s.kind === "hold"
        ? { k: s.kind, c: s.camera, t0: +s.t0.toFixed(4), t1: +s.t1.toFixed(4), g: s.gesture }
        : {
            k: s.kind,
            a: s.fromCamera,
            b: s.toCamera,
            p: s.primitive,
            t0: +s.t0.toFixed(4),
            t1: +s.t1.toFixed(4),
          },
    ),
  });
}
