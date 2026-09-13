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
  out?: boolean;
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

/** Flyable radius inside the hexagon (short of the LED faces). */
const INNER_MAX = HEX.radius - 0.14;
const INNER_MIN = 0.48;
const OUTER_MIN = HEX.radius + 0.28;
const OUTER_MAX = 4.15;

function outsideHex(p: Vec3) {
  return Math.hypot(p.x, p.z) > HEX.radius + 0.16;
}

/** Spine of the operator. Body ~22cm; drone stays 15cm off the skin, all around. */
const GIRL = { x: 0, z: HEX.personZ, y0: 0.05, y1: HEX.personHeight - 0.02 };
const KEEP = 0.22 + 0.15;

function pushOffGirl(p: Vec3): Vec3 {
  const cy = clamp(p.y, GIRL.y0, GIRL.y1);
  const dx = p.x - GIRL.x;
  const dz = p.z - GIRL.z;
  const dy = p.y - cy;
  const keep = KEEP + (dz >= 0 ? 0.06 : 0);
  const dist = Math.hypot(dx, dz, dy);
  if (dist >= keep) return p;
  if (dist < 1e-5) return { x: p.x, y: Math.max(p.y, 1.2), z: GIRL.z + keep };
  const s = keep / dist;
  return { x: GIRL.x + dx * s, y: cy + dy * s, z: GIRL.z + dz * s };
}

function keepDrone(p: Vec3, allowOut = false): Vec3 {
  const y = clamp(p.y, 0.78, allowOut ? 3.35 : 2.62);
  let x = p.x;
  let z = p.z;
  const xz = Math.hypot(x, z);
  const operator = z < HEX.personZ + 0.18;
  if (allowOut) {
    const minR = operator ? 0.7 : OUTER_MIN;
    if (xz < minR && xz > 1e-4) {
      const s = minR / xz;
      x *= s;
      z *= s;
    } else if (xz > OUTER_MAX && xz > 1e-4) {
      const s = OUTER_MAX / xz;
      x *= s;
      z *= s;
    }
    return pushOffGirl({ x, y, z });
  }
  const minR = y > 2.35 ? 0.22 : operator ? INNER_MIN : 0.72;
  const maxR = INNER_MAX;
  if (xz < minR) {
    if (xz < 1e-4) {
      x = 0;
      z = operator ? -minR : minR;
    } else {
      const s = minR / xz;
      x *= s;
      z *= s;
    }
  } else if (xz > maxR && xz > 1e-4) {
    const s = maxR / xz;
    x *= s;
    z *= s;
  }
  return pushOffGirl({ x, y, z });
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
  high: { yaw: 0.18, radius: 1.12, height: 2.42, fov: 68 },
  outside: { yaw: 0.38, radius: 3.05, height: 2.05, fov: 56 },
  right: { yaw: 0.95, radius: 1.28, height: 1.62, fov: 58 },
  left: { yaw: -0.95, radius: 1.28, height: 1.62, fov: 58 },
  behind: { yaw: Math.PI * 0.92, radius: 1.18, height: 1.78, fov: 62 },
  inside: { yaw: Math.PI, radius: 1.02, height: 1.68, fov: 70 },
  face: { yaw: Math.PI + 0.32, radius: 0.92, height: 1.5, fov: 50 },
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

/** Twenty takes. Four open outside (~20% of the clip); the rest stay in the hexagon. */
export const SHOOT_MODELS: ShootModel[] = [
  { id: 0, name: "Zenit interno", hint: "dall'alto, dentro l'esagono", opening: "high", sequence: ["rise", "inside", "pushTouch", "faceClose", "inside"], radius: [0.7, 1.38], height: [1.45, 2.5], fov: [58, 78], pace: 1.15, lookFace: 0.08 },
  { id: 1, name: "Fuori e dentro", hint: "20% esterno, poi entra", opening: "outside", sequence: ["orbit", "pushTouch", "inside", "faceClose", "inside"], radius: [0.85, 1.4], height: [1.4, 2.15], fov: [50, 66], pace: 1.05, lookFace: 0.12 },
  { id: 2, name: "Spalla destra", hint: "GoPro destra, interno", opening: "right", sequence: ["drift", "pushTouch", "faceClose", "inside", "pushTouch"], radius: [0.85, 1.4], height: [1.35, 1.9], fov: [48, 64], pace: 0.95, lookFace: 0.3 },
  { id: 3, name: "Spalla sinistra", hint: "GoPro sinistra, interno", opening: "left", sequence: ["drift", "pushTouch", "faceClose", "inside", "pushTouch"], radius: [0.85, 1.4], height: [1.35, 1.9], fov: [48, 64], pace: 0.95, lookFace: 0.3 },
  { id: 4, name: "LED poi vetro", hint: "un passaggio fuori, poi il 55\"", opening: "outside", sequence: ["pushMonitor", "pushTouch", "inside", "faceClose", "inside"], radius: [0.9, 1.4], height: [1.3, 1.95], fov: [44, 60], pace: 0.98, lookFace: 0.14 },
  { id: 5, name: "Dentro l'esagono", hint: "solo interno", opening: "inside", sequence: ["inside", "pushTouch", "faceClose", "inside", "drift"], radius: [0.8, 1.38], height: [1.4, 2.05], fov: [62, 82], pace: 0.9, lookFace: 0.22 },
  { id: 6, name: "Primo piano viso", hint: "espressione", opening: "face", sequence: ["faceClose", "pushTouch", "faceClose", "inside", "faceClose"], radius: [0.7, 1.25], height: [1.38, 1.7], fov: [40, 54], pace: 1.08, lookFace: 0.82 },
  { id: 7, name: "Viso e vetro", hint: "lei, poi il touch", opening: "face", sequence: ["faceClose", "pushTouch", "inside", "faceClose", "pushTouch"], radius: [0.85, 1.38], height: [1.35, 1.95], fov: [42, 60], pace: 1.0, lookFace: 0.55 },
  { id: 8, name: "Giro interno", hint: "orbita stretta", opening: "right", sequence: ["spin180", "inside", "pushTouch", "inside", "faceClose"], radius: [0.9, 1.4], height: [1.45, 2.2], fov: [52, 70], pace: 0.92, lookFace: 0.16 },
  { id: 9, name: "Un LED, poi lei", hint: "20% sul wall, resto interno", opening: "outside", sequence: ["pushMonitor", "inside", "pushTouch", "faceClose", "inside"], radius: [0.85, 1.38], height: [1.3, 1.9], fov: [40, 56], pace: 0.88, lookFace: 0.12 },
  { id: 10, name: "Crane interno", hint: "sale e scende nel volume", opening: "high", sequence: ["crane", "inside", "pushTouch", "crane", "faceClose"], radius: [0.8, 1.4], height: [1.2, 2.5], fov: [50, 70], pace: 1.18, lookFace: 0.12 },
  { id: 11, name: "Vetro ravvicinato", hint: "sul 55\"", opening: "inside", sequence: ["pushTouch", "drift", "pushTouch", "inside", "pushTouch"], radius: [0.95, 1.4], height: [1.35, 1.85], fov: [38, 52], pace: 1.02, lookFace: 0.18 },
  { id: 12, name: "Alti e bassi", hint: "dentro, quota che cambia", opening: "high", sequence: ["rise", "inside", "pushTouch", "faceClose", "inside"], radius: [0.7, 1.38], height: [1.15, 2.5], fov: [54, 80], pace: 0.85, lookFace: 0.18 },
  { id: 13, name: "Quota bassa", hint: "raso il tavolo, interno", opening: "left", sequence: ["drift", "inside", "pushTouch", "faceClose", "inside"], radius: [0.9, 1.4], height: [1.15, 1.55], fov: [52, 70], pace: 1.05, lookFace: 0.22 },
  { id: 14, name: "Ritratto 3/4", hint: "lei di profilo", opening: "face", sequence: ["faceClose", "drift", "faceClose", "pushTouch", "inside"], radius: [0.8, 1.3], height: [1.4, 1.75], fov: [40, 52], pace: 1.1, lookFace: 0.7 },
  { id: 15, name: "Entrata", hint: "arriva da fuori e resta dentro", opening: "outside", sequence: ["orbit", "pushTouch", "inside", "faceClose", "inside"], radius: [0.85, 1.4], height: [1.4, 2.1], fov: [46, 64], pace: 0.94, lookFace: 0.22 },
  { id: 16, name: "Centro sala", hint: "dal cuore dell'esagono", opening: "inside", sequence: ["inside", "faceClose", "pushTouch", "inside", "drift"], radius: [0.7, 1.25], height: [1.4, 2.1], fov: [58, 78], pace: 0.96, lookFace: 0.28 },
  { id: 17, name: "Lei e i wall", hint: "viso, poi i LED da dentro", opening: "face", sequence: ["faceClose", "inside", "pushTouch", "drift", "inside"], radius: [0.8, 1.4], height: [1.35, 2.05], fov: [48, 66], pace: 1.0, lookFace: 0.42 },
  { id: 18, name: "Lungo il vetro", hint: "scorre sul 55\"", opening: "inside", sequence: ["pushTouch", "drift", "inside", "pushTouch", "faceClose"], radius: [0.95, 1.4], height: [1.3, 1.8], fov: [40, 54], pace: 0.9, lookFace: 0.14 },
  { id: 19, name: "Salon interno", hint: "tutta la strumentazione, da dentro", opening: "high", sequence: ["rise", "faceClose", "pushTouch", "inside", "drift", "inside"], radius: [0.75, 1.4], height: [1.25, 2.45], fov: [46, 74], pace: 0.92, lookFace: 0.28 },
];

export function modelFromSeed(seed: number) {
  return SHOOT_MODELS[((seed >>> 0) * 17) % SHOOT_MODELS.length]!;
}

function keyFrom(t: number, kind: DroneShot, pos: Vec3, target: Vec3, fov: number, roll: number, out = false): DroneKey {
  return { t, kind, position: keepDrone(pos, out), target, fov, roll, out };
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
      pos: polar(c.yaw + rngRange(rng, -0.4, 0.4), rngRange(rng, model.radius[0], Math.min(model.radius[1], INNER_MAX)), rngRange(rng, Math.max(model.height[0], 1.9), Math.min(model.height[1], 2.55))),
      target: { x: 0, y: 0.95, z: 0.08 },
      fov: f(),
      roll: roll * 0.35,
      dur: dur(3.0, 5.0),
    };
  }
  if (kind === "pushTouch") {
    return { pos: polar(c.yaw + rngRange(rng, -0.22, 0.22), rngRange(rng, 0.95, INNER_MAX), rngRange(rng, 1.35, 1.95)), target: look({ ...TOUCH, y: TOUCH.y - 0.04 }, 0.05), fov: rngRange(rng, model.fov[0], Math.min(model.fov[1], 58)), roll, dur: dur(2.8, 4.6) };
  }
  if (kind === "pushMonitor") {
    const index = 1 + Math.floor(rng() * 6);
    const a = monitorAngle(index);
    const m = monitorPosition(index);
    return {
      pos: polar(a, HEX.radius + rngRange(rng, 0.4, 0.95), rngRange(rng, 1.2, 1.85)),
      target: look({ x: m.x * 0.92, y: m.y, z: m.z * 0.92 }, 0.78),
      fov: rngRange(rng, 38, 54),
      roll,
      dur: dur(2.4, 3.4),
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
      x: side * rngRange(rng, 0.34, 0.62),
      y: rngRange(rng, 1.42, 1.66),
      z: HEX.personZ - rngRange(rng, 0.42, 0.75),
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

function budgetExterior(keys: DroneKey[], duration: number) {
  if (keys.length < 2) return keys;
  const segs: { dt: number; out: boolean }[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    segs.push({
      dt: Math.max(0.05, b.t - a.t),
      out: Boolean(a.out || b.out || outsideHex(a.position) || outsideHex(b.position)),
    });
  }
  let outT = 0;
  let inT = 0;
  for (const s of segs) {
    if (s.out) outT += s.dt;
    else inT += s.dt;
  }
  if (outT < 1e-3) {
    keys[keys.length - 1]!.t = duration;
    return keys;
  }
  const wantOut = duration * 0.2;
  const wantIn = inT < 1e-3 ? duration : duration * 0.8;
  const sOut = wantOut / outT;
  const sIn = inT > 1e-3 ? wantIn / inT : 1;
  let t = 0;
  keys[0]!.t = 0;
  for (let i = 0; i < segs.length; i++) {
    t += segs[i]!.dt * (segs[i]!.out ? sOut : sIn);
    keys[i + 1]!.t = t;
  }
  keys[keys.length - 1]!.t = duration;
  return keys;
}

/**
 * One continuous drone take. Same seed + model → same flight.
 * Different models are authored to start and move unlike each other.
 * Exterior airtime is capped at ~20% — the rest lives inside the hexagon.
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
  let pos = polar(open.yaw + rngRange(rng, -0.42, 0.42), open.radius, open.height);
  if (opening === "face") {
    const side = rng() > 0.5 ? 1 : -1;
    pos = { x: side * 0.48, y: 1.52, z: HEX.personZ - 0.58 };
  }
  const startKind: DroneShot = model.sequence[0] ?? (opening === "face" ? "faceClose" : "inside");
  const openOut = opening === "outside" || startKind === "pushMonitor";
  const keys: DroneKey[] = [
    keyFrom(
      0,
      startKind,
      pos,
      opening === "face" || model.lookFace > 0.5 ? mixTarget(FACE, model.lookFace) : mixTarget(TOUCH, 0),
      open.fov,
      rngRange(rng, -0.03, 0.03),
      openOut,
    ),
  ];
  let c = cursorOf(keys[0]!.position);
  const seq: DroneShot[] = model.sequence.length ? model.sequence : ["inside", "pushTouch"];
  let t = 0;
  let i = 1;
  let last: DroneShot = startKind;
  let usedOut = openOut;
  while (t < duration - 2.2 && i < 24) {
    let kind = seq[i % seq.length]!;
    if (kind === last && seq.length > 1) kind = seq[(i + 1) % seq.length]!;
    const stepOut = kind === "pushMonitor" || (kind === "orbit" && openOut && !usedOut);
    const step = advanceShot(kind, c, rng, model);
    t = Math.min(duration, t + step.dur);
    keys.push(keyFrom(t, kind, step.pos, step.target, step.fov, step.roll, stepOut));
    if (stepOut) usedOut = true;
    c = cursorOf(keys[keys.length - 1]!.position);
    last = kind;
    i++;
  }
  const land = polar(
    c.yaw + rngRange(rng, 0.15, 0.7),
    rngRange(rng, 0.85, INNER_MAX),
    rngRange(rng, 1.45, 2.15),
  );
  keys.push(keyFrom(duration, "inside", land, mixTarget(TOUCH, 0), model.fov[1], 0, false));
  budgetExterior(keys, duration);
  return { keys, opening, model: model.id, modelName: model.name };
}

export function evaluateDrone(
  flight: { keys: Array<{ t: number; position: Vec3; target: Vec3; fov: number; roll: number; kind?: string; out?: boolean }> },
  time: number,
): CameraPose {
  const keys = flight.keys;
  if (!keys.length) {
    return { position: polar(0, 1.15, 1.85), target: TOUCH, fov: 62, roll: 0, barrel: 0 };
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
  const allowOut = Boolean(b.out || c.out);
  const pos = keepDrone(
    {
      x: catmull(a.position.x, b.position.x, c.position.x, d.position.x, u),
      y: catmull(a.position.y, b.position.y, c.position.y, d.position.y, u),
      z: catmull(a.position.z, b.position.z, c.position.z, d.position.z, u),
    },
    allowOut,
  );
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
