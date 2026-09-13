import { HEX, monitorAngle, monitorPosition } from "./config.ts";
import { clamp, createRng, easeInOutSine, lerp, rngPick, rngRange } from "./math.ts";
import type { CameraPose, OutputFormat, Vec3 } from "./types.ts";

/** Look-at: the 55" glass, always the centre of the room. */
const TOUCH: Vec3 = { x: 0, y: HEX.tableHeight * 0.92, z: HEX.tableZ };

export type DroneShot =
  | "orbit"
  | "crane"
  | "pushTouch"
  | "pushMonitor"
  | "rise"
  | "drift"
  | "faceClose"
  | "spin180"
  | "inside";

export type DroneOpening = "outside" | "inside" | "right" | "left" | "behind" | "face" | "high";

export interface DroneKey {
  t: number;
  kind: DroneShot;
  position: Vec3;
  target: Vec3;
  fov: number;
  roll: number;
}

export interface DroneFlight {
  keys: DroneKey[];
  opening: DroneOpening;
  model: number;
  modelName: string;
}

export const OPENING_IT: Record<DroneOpening, string> = {
  outside: "da fuori",
  inside: "da dentro",
  right: "da destra",
  left: "da sinistra",
  behind: "da dietro",
  face: "primo piano viso",
  high: "dall'alto",
};

export const SHOT_IT: Record<DroneShot, string> = {
  orbit: "orbita",
  crane: "crane",
  pushTouch: "avvicina touch",
  pushMonitor: "avvicina monitor",
  rise: "salita",
  drift: "deriva",
  faceClose: "primo piano",
  spin180: "giro 180°",
  inside: "interno esagono",
};

function polar(yaw: number, radius: number, height: number): Vec3 {
  return {
    x: Math.sin(yaw) * radius,
    y: height,
    z: Math.cos(yaw) * radius,
  };
}

function keepDrone(p: Vec3): Vec3 {
  const y = clamp(p.y, 0.62, 4.55);
  const xz = Math.hypot(p.x, p.z);
  const operator = p.z < HEX.personZ + 0.12;
  const minR = y > 2.55 ? 0.18 : operator ? 0.7 : 1.96;
  if (xz < minR) {
    if (xz < 1e-4) return { x: 0, y, z: operator ? -minR : minR };
    const s = minR / xz;
    return { x: p.x * s, y, z: p.z * s };
  }
  const maxR = 5.35;
  if (xz > maxR) {
    const s = maxR / xz;
    return { x: p.x * s, y, z: p.z * s };
  }
  return { x: p.x, y, z: p.z };
}

function mixTarget(look: Vec3, amount: number): Vec3 {
  const k = clamp(amount, 0, 1);
  return {
    x: lerp(TOUCH.x, look.x, k),
    y: lerp(TOUCH.y, look.y, k),
    z: lerp(TOUCH.z, look.z, k),
  };
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

interface Cursor {
  yaw: number;
  radius: number;
  height: number;
}

const FACE: Vec3 = { x: 0, y: 1.52, z: HEX.personZ };

const OPENINGS: Record<DroneOpening, { yaw: number; radius: number; height: number; fov: number }> = {
  high: { yaw: 0.12, radius: 2.4, height: 3.95, fov: 62 },
  outside: { yaw: 0.4, radius: 4.6, height: 2.2, fov: 58 },
  right: { yaw: 1.45, radius: 3.55, height: 1.7, fov: 54 },
  left: { yaw: -1.45, radius: 3.55, height: 1.7, fov: 54 },
  behind: { yaw: Math.PI, radius: 4.05, height: 2.05, fov: 56 },
  inside: { yaw: Math.PI, radius: 1.05, height: 1.72, fov: 68 },
  face: { yaw: Math.PI + 0.35, radius: 0.95, height: 1.5, fov: 52 },
};

export const OPENING_ORDER: DroneOpening[] = ["outside", "inside", "right", "left", "behind", "face", "high"];

export interface ShootModel {
  id: number;
  name: string;
  hint: string;
  opening: DroneOpening;
  sequence: DroneShot[];
  radius: [number, number];
  height: [number, number];
  fov: [number, number];
  pace: number;
  lookFace: number;
}

/** Twenty authored takes — Rigenera jumps to another, never a near-copy. */
export const SHOOT_MODELS: ShootModel[] = [
  { id: 0, name: "Zenit", hint: "dall'alto, lento", opening: "high", sequence: ["rise", "orbit", "crane", "pushTouch", "rise"], radius: [0.4, 1.8], height: [3.4, 4.45], fov: [58, 78], pace: 1.2, lookFace: 0.05 },
  { id: 1, name: "Fuori sala", hint: "esterno, si avvicina", opening: "outside", sequence: ["orbit", "drift", "pushMonitor", "pushTouch", "orbit"], radius: [4.0, 5.2], height: [1.7, 2.8], fov: [50, 64], pace: 1.15, lookFace: 0.08 },
  { id: 2, name: "Spalla destra", hint: "GoPro destra", opening: "right", sequence: ["drift", "pushTouch", "faceClose", "orbit", "pushMonitor"], radius: [2.4, 3.6], height: [1.35, 1.9], fov: [48, 62], pace: 0.95, lookFace: 0.28 },
  { id: 3, name: "Spalla sinistra", hint: "GoPro sinistra", opening: "left", sequence: ["drift", "pushTouch", "faceClose", "orbit", "pushMonitor"], radius: [2.4, 3.6], height: [1.35, 1.9], fov: [48, 62], pace: 0.95, lookFace: 0.28 },
  { id: 4, name: "Dietro i LED", hint: "attraverso i wall", opening: "behind", sequence: ["pushMonitor", "orbit", "spin180", "pushMonitor", "drift"], radius: [2.2, 3.4], height: [1.2, 2.1], fov: [44, 58], pace: 1.0, lookFace: 0.1 },
  { id: 5, name: "Dentro l'esagono", hint: "interno", opening: "inside", sequence: ["inside", "pushTouch", "faceClose", "inside", "rise"], radius: [0.85, 1.45], height: [1.4, 2.05], fov: [62, 82], pace: 0.9, lookFace: 0.22 },
  { id: 6, name: "Primo piano viso", hint: "espressione", opening: "face", sequence: ["faceClose", "pushTouch", "faceClose", "drift", "faceClose"], radius: [0.75, 1.25], height: [1.38, 1.66], fov: [40, 54], pace: 1.1, lookFace: 0.82 },
  { id: 7, name: "Viso e vetro", hint: "lei, poi il touch", opening: "face", sequence: ["faceClose", "pushTouch", "inside", "faceClose", "pushTouch"], radius: [0.9, 2.3], height: [1.35, 2.0], fov: [42, 60], pace: 1.0, lookFace: 0.55 },
  { id: 8, name: "Giro 180", hint: "ruota la sala", opening: "right", sequence: ["spin180", "orbit", "spin180", "pushTouch", "rise"], radius: [2.8, 4.2], height: [1.6, 3.2], fov: [52, 70], pace: 0.88, lookFace: 0.12 },
  { id: 9, name: "Salti monitor", hint: "da un LED all'altro", opening: "outside", sequence: ["pushMonitor", "pushMonitor", "drift", "pushMonitor", "pushTouch"], radius: [2.1, 3.0], height: [1.15, 1.8], fov: [40, 54], pace: 0.82, lookFace: 0.06 },
  { id: 10, name: "Crane lento", hint: "sale e scende", opening: "high", sequence: ["crane", "rise", "crane", "pushTouch", "crane"], radius: [2.2, 3.8], height: [1.1, 4.3], fov: [50, 68], pace: 1.25, lookFace: 0.1 },
  { id: 11, name: "Vetro ravvicinato", hint: "sul 55\"", opening: "inside", sequence: ["pushTouch", "drift", "pushTouch", "inside", "pushTouch"], radius: [2.05, 2.5], height: [1.35, 1.85], fov: [38, 50], pace: 1.05, lookFace: 0.18 },
  { id: 12, name: "Vertigine", hint: "alti e bassi", opening: "high", sequence: ["rise", "crane", "inside", "rise", "spin180"], radius: [0.5, 3.6], height: [0.9, 4.4], fov: [54, 86], pace: 0.78, lookFace: 0.15 },
  { id: 13, name: "Quota bassa", hint: "raso pavimento", opening: "left", sequence: ["drift", "orbit", "pushTouch", "drift", "faceClose"], radius: [2.6, 4.0], height: [0.75, 1.25], fov: [52, 70], pace: 1.08, lookFace: 0.2 },
  { id: 14, name: "Ritratto 3/4", hint: "lei di profilo", opening: "face", sequence: ["faceClose", "drift", "faceClose", "pushTouch", "orbit"], radius: [1.0, 2.4], height: [1.4, 1.8], fov: [40, 52], pace: 1.12, lookFace: 0.7 },
  { id: 15, name: "Orbita larga", hint: "giro completo", opening: "outside", sequence: ["orbit", "orbit", "crane", "spin180", "orbit"], radius: [3.6, 5.1], height: [2.0, 3.4], fov: [54, 68], pace: 1.18, lookFace: 0.05 },
  { id: 16, name: "Entrata frontale", hint: "arriva sul touch", opening: "outside", sequence: ["orbit", "pushTouch", "inside", "pushTouch", "faceClose"], radius: [2.1, 4.8], height: [1.5, 2.6], fov: [46, 64], pace: 0.92, lookFace: 0.25 },
  { id: 17, name: "Dietro di lei", hint: "nuca e sala", opening: "behind", sequence: ["faceClose", "inside", "pushTouch", "orbit", "rise"], radius: [0.8, 2.6], height: [1.35, 2.4], fov: [48, 66], pace: 1.0, lookFace: 0.45 },
  { id: 18, name: "LED a pelo", hint: "lastra trasparente", opening: "right", sequence: ["pushMonitor", "drift", "pushMonitor", "spin180", "pushMonitor"], radius: [2.05, 2.7], height: [1.1, 1.75], fov: [38, 50], pace: 0.86, lookFace: 0.08 },
  { id: 19, name: "Salon mix", hint: "tutta la strumentazione", opening: "high", sequence: ["rise", "faceClose", "pushTouch", "pushMonitor", "spin180", "inside", "orbit"], radius: [1.0, 4.4], height: [1.2, 4.0], fov: [44, 74], pace: 0.9, lookFace: 0.3 },
];

export function modelFromSeed(seed: number) {
  return SHOOT_MODELS[((seed >>> 0) * 17) % SHOOT_MODELS.length]!;
}

function keyFrom(t: number, kind: DroneShot, pos: Vec3, target: Vec3, fov: number, roll: number): DroneKey {
  return { t, kind, position: keepDrone(pos), target, fov, roll };
}

function cursorOf(p: Vec3): Cursor {
  return { yaw: Math.atan2(p.x, p.z), radius: Math.max(0.4, Math.hypot(p.x, p.z)), height: p.y };
}

function advanceShot(
  kind: DroneShot,
  c: Cursor,
  rng: () => number,
  model: ShootModel,
): { pos: Vec3; target: Vec3; fov: number; roll: number; dur: number } {
  const roll = rngRange(rng, -0.05, 0.05);
  const r = () => rngRange(rng, model.radius[0], model.radius[1]);
  const h = () => rngRange(rng, model.height[0], model.height[1]);
  const f = () => rngRange(rng, model.fov[0], model.fov[1]);
  const dur = (a: number, b: number) => rngRange(rng, a, b) * model.pace;
  const look = (extra: Vec3, amt: number) => mixTarget(extra, clamp(amt + model.lookFace * 0.35, 0, 1));
  if (kind === "orbit") {
    const sweep = (rng() > 0.5 ? 1 : -1) * rngRange(rng, 0.85, 2.3);
    return { pos: polar(c.yaw + sweep, r(), h()), target: look(TOUCH, 0), fov: f(), roll, dur: dur(3.4, 6.2) };
  }
  if (kind === "crane") {
    return { pos: polar(c.yaw + rngRange(rng, -0.55, 0.55), r(), h()), target: look({ ...TOUCH, y: TOUCH.y + rngRange(rng, -0.1, 0.3) }, 0.1), fov: f(), roll, dur: dur(3.0, 5.4) };
  }
  if (kind === "rise") {
    return {
      pos: polar(c.yaw + rngRange(rng, -0.4, 0.4), rngRange(rng, model.radius[0], Math.max(model.radius[0], 2.2)), rngRange(rng, Math.max(model.height[0], 2.8), Math.max(model.height[1], 4.2))),
      target: { x: 0, y: 0.72, z: 0.08 },
      fov: f(),
      roll: roll * 0.35,
      dur: dur(3.0, 5.0),
    };
  }
  if (kind === "pushTouch") {
    return { pos: polar(c.yaw + rngRange(rng, -0.22, 0.22), rngRange(rng, 2.05, 2.6), rngRange(rng, 1.35, 2.05)), target: look({ ...TOUCH, y: TOUCH.y - 0.04 }, 0.05), fov: rngRange(rng, model.fov[0], Math.min(model.fov[1], 54)), roll, dur: dur(2.8, 4.6) };
  }
  if (kind === "pushMonitor") {
    const index = 1 + Math.floor(rng() * 6);
    const a = monitorAngle(index);
    const m = monitorPosition(index);
    return {
      pos: polar(a, HEX.radius + rngRange(rng, 0.48, 1.1), rngRange(rng, 1.1, 1.8)),
      target: look({ x: m.x * 0.92, y: m.y, z: m.z * 0.92 }, 0.78),
      fov: rngRange(rng, 38, 54),
      roll,
      dur: dur(2.6, 4.2),
    };
  }
  if (kind === "spin180") {
    return { pos: polar(c.yaw + Math.PI * (rng() > 0.5 ? 1 : -1), r(), h()), target: look(TOUCH, 0), fov: f(), roll, dur: dur(3.4, 5.4) };
  }
  if (kind === "inside") {
    return { pos: polar(Math.PI + rngRange(rng, -0.5, 0.5), rngRange(rng, 0.85, 1.4), rngRange(rng, 1.4, 2.05)), target: look(TOUCH, 0.08), fov: rngRange(rng, 62, 84), roll, dur: dur(2.6, 4.2) };
  }
  if (kind === "faceClose") {
    const side = rng() > 0.5 ? 1 : -1;
    const pos = {
      x: side * rngRange(rng, 0.26, 0.58),
      y: rngRange(rng, 1.4, 1.64),
      z: HEX.personZ - rngRange(rng, 0.36, 0.72),
    };
    return { pos, target: look(FACE, 0.72), fov: rngRange(rng, 40, 54), roll: roll * 0.5, dur: dur(2.6, 4.2) };
  }
  return {
    pos: polar(c.yaw + rngRange(rng, -0.7, 0.7), r(), h()),
    target: look({ x: rngRange(rng, -0.18, 0.18), y: TOUCH.y, z: TOUCH.z }, 0.08),
    fov: f(),
    roll,
    dur: dur(2.5, 4.2),
  };
}

export type FlightOpts = { model?: number; opening?: DroneOpening | "auto" };

/**
 * One continuous drone take. Same seed + model → same flight.
 * Different models are authored to start and move unlike each other.
 */
export function generateDroneFlight(
  seed: number,
  duration: number,
  forced: DroneOpening | "auto" | FlightOpts = "auto",
): DroneFlight {
  const opts: FlightOpts = typeof forced === "object" ? forced : { opening: forced };
  const rng = createRng((seed >>> 0) ^ 0xd20e ^ ((opts.model ?? 0) * 0x9e3779b9));
  const model = SHOOT_MODELS[((opts.model ?? modelFromSeed(seed).id) >>> 0) % SHOOT_MODELS.length]!;
  const opening: DroneOpening = opts.opening && opts.opening !== "auto" ? opts.opening : model.opening;
  const open = OPENINGS[opening]!;
  let pos = polar(open.yaw, open.radius, open.height);
  if (opening === "face") {
    const side = rng() > 0.5 ? 1 : -1;
    pos = { x: side * 0.42, y: 1.52, z: HEX.personZ - 0.55 };
  }
  const startKind: DroneShot = model.sequence[0] ?? (opening === "face" ? "faceClose" : "orbit");
  const keys: DroneKey[] = [
    keyFrom(
      0,
      startKind,
      pos,
      opening === "face" || model.lookFace > 0.5 ? mixTarget(FACE, model.lookFace) : mixTarget(TOUCH, 0),
      open.fov,
      rngRange(rng, -0.03, 0.03),
    ),
  ];
  let c = cursorOf(keys[0]!.position);
  const seq: DroneShot[] = model.sequence.length ? model.sequence : ["orbit", "pushTouch"];
  let t = 0;
  let i = 1;
  let last: DroneShot = startKind;
  while (t < duration - 2.2 && i < 24) {
    let kind = seq[i % seq.length]!;
    if (kind === last && seq.length > 1) kind = seq[(i + 1) % seq.length]!;
    const step = advanceShot(kind, c, rng, model);
    t = Math.min(duration, t + step.dur);
    keys.push(keyFrom(t, kind, step.pos, step.target, step.fov, step.roll));
    c = cursorOf(keys[keys.length - 1]!.position);
    last = kind;
    i++;
  }
  const land = polar(
    c.yaw + rngRange(rng, 0.2, 0.9),
    rngRange(rng, model.radius[0], model.radius[1]),
    rngRange(rng, Math.max(model.height[0], 2.4), Math.max(model.height[1], 3.6)),
  );
  keys.push(keyFrom(duration, "rise", land, mixTarget(TOUCH, 0), model.fov[1], 0));
  return { keys, opening, model: model.id, modelName: model.name };
}

export function evaluateDrone(
  flight: { keys: Array<{ t: number; position: Vec3; target: Vec3; fov: number; roll: number; kind?: string }> },
  time: number,
): CameraPose {
  const keys = flight.keys;
  if (!keys.length) {
    return { position: polar(0, 3.2, 3.6), target: TOUCH, fov: 56, roll: 0, barrel: 0 };
  }
  const t = clamp(time, keys[0]!.t, keys[keys.length - 1]!.t);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t < t) i++;
  const a = keys[Math.max(0, i - 1)]!;
  const b = keys[i]!;
  const c = keys[Math.min(keys.length - 1, i + 1)]!;
  const d = keys[Math.min(keys.length - 1, i + 2)]!;
  const span = Math.max(1e-4, c.t - b.t);
  const u = easeInOutSine(clamp((t - b.t) / span, 0, 1));
  const pos = keepDrone({
    x: catmull(a.position.x, b.position.x, c.position.x, d.position.x, u),
    y: catmull(a.position.y, b.position.y, c.position.y, d.position.y, u),
    z: catmull(a.position.z, b.position.z, c.position.z, d.position.z, u),
  });
  const target = {
    x: catmull(a.target.x, b.target.x, c.target.x, d.target.x, u),
    y: catmull(a.target.y, b.target.y, c.target.y, d.target.y, u),
    z: catmull(a.target.z, b.target.z, c.target.z, d.target.z, u),
  };
  // never let the look-at drift far from the glass — the table stays the centre
  const framed = mixTarget(target, 0.22);
  return {
    position: pos,
    target: mixVec(framed, target, 0.55),
    fov: lerp(b.fov, c.fov, u),
    roll: lerp(b.roll, c.roll, u),
    barrel: lerp(0.06, 0.16, clamp((2.4 - Math.hypot(pos.x, pos.z)) * 0.4, 0, 1)),
  };
}

export function applyFormatOptics(pose: CameraPose, format: OutputFormat): CameraPose {
  if (format === "9:16") {
    return {
      ...pose,
      fov: clamp(pose.fov * 1.38 + 16, 74, 98),
      barrel: clamp(pose.barrel + 0.3, 0.24, 0.5),
      target: { x: pose.target.x, y: pose.target.y + 0.22, z: pose.target.z },
    };
  }
  if (format === "1:1") {
    return {
      ...pose,
      fov: clamp(pose.fov * 1.14 + 4, 54, 80),
      barrel: clamp(pose.barrel + 0.08, 0, 0.28),
    };
  }
  return { ...pose, fov: clamp(pose.fov, 42, 78), barrel: pose.barrel * 0.6 };
}

export function droneLabel(
  flight: { keys: Array<{ t: number; kind?: string }> },
  time: number,
): string {
  const keys = flight.keys;
  let kind: DroneShot = "orbit";
  for (const k of keys) {
    if (k.t <= time) kind = k.kind as DroneShot;
  }
  return `DRONE · ${SHOT_IT[kind] ?? kind}`.toUpperCase();
}

function nearestId(pose: CameraPose): "top" | "right" | "left" {
  if (pose.position.y > 3.15) return "top";
  if (pose.position.x >= 0.55) return "right";
  if (pose.position.x <= -0.55) return "left";
  return "top";
}

export function droneCameraId(pose: CameraPose) {
  return nearestId(pose);
}

export function describeFlight(flight: DroneFlight) {
  const shots: DroneShot[] = [];
  let last = "";
  for (const k of flight.keys) {
    if (k.kind !== last) {
      shots.push(k.kind);
      last = k.kind;
    }
  }
  return { opening: flight.opening, shots, model: flight.model ?? 0, modelName: flight.modelName ?? "" };
}
