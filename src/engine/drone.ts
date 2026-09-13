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
  | "holdMonitor"
  | "wideRoom"
  | "orbitWall"
  | "sideGirl"
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
  behind: "di lato alto",
  face: "laterale distante",
  high: "dall'alto",
};

export const SHOT_IT: Record<DroneShot, string> = {
  orbit: "esterno",
  crane: "crane",
  pushTouch: "vetro di lato",
  pushMonitor: "avvicina opera",
  holdMonitor: "dettaglio opera",
  wideRoom: "scenografia",
  orbitWall: "giro sui LED",
  sideGirl: "lei di lato",
  rise: "dall'alto",
  drift: "deriva",
  faceClose: "lei di lato",
  spin180: "arco laterale",
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
  if (dist < 1e-5) return { x: Math.abs(p.x) < 0.2 ? 0.7 : p.x, y: Math.max(p.y, 1.42), z: GIRL.z + keep };
  const s = keep / dist;
  return { x: GIRL.x + dx * s, y: cy + dy * s, z: GIRL.z + dz * s };
}

/**
 * Definitive camera rule: never sit behind her back at body height.
 * Laterals, front, zenith only. A top shot may hover a little aft to see the table.
 */
function forbidRear(p: Vec3, allowOut = false): Vec3 {
  const high = p.y >= 2.18;
  const minZ = high ? HEX.personZ - 0.22 : HEX.personZ + 0.14;
  if (p.z >= minZ) return p;
  const side = p.x >= 0 ? 1 : -1;
  const xz = Math.hypot(p.x, p.z);
  if (allowOut && xz > HEX.radius) {
    const yaw = side * 1.08;
    const r = clamp(xz, OUTER_MIN, OUTER_MAX);
    return { x: Math.sin(yaw) * r, y: Math.max(p.y, 1.4), z: Math.cos(yaw) * r };
  }
  return {
    x: Math.max(0.62, Math.abs(p.x)) * side,
    y: Math.max(p.y, high ? 2.18 : 1.45),
    z: minZ + 0.1,
  };
}

function keepDrone(p: Vec3, allowOut = false): Vec3 {
  const y = clamp(p.y, 1.48, allowOut ? 2.05 : 1.98);
  let x = p.x;
  let z = p.z;
  const xz = Math.hypot(x, z);
  if (allowOut) {
    const minR = OUTER_MIN * 0.55;
    if (xz < minR && xz > 1e-4) {
      const s = minR / xz;
      x *= s;
      z *= s;
    } else if (xz > OUTER_MAX && xz > 1e-4) {
      const s = OUTER_MAX / xz;
      x *= s;
      z *= s;
    }
    return forbidRear(pushOffGirl({ x, y, z }), true);
  }
  const minR = 0.55;
  const maxR = INNER_MAX;
  if (xz < minR) {
    if (xz < 1e-4) {
      x = 0;
      z = minR;
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
  return forbidRear(pushOffGirl({ x, y, z }), false);
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

/**
 * Framing rules. The artwork band is the monitors and the glass — never the
 * empty floor, never the feet. Stay back, stay level, don't punch in.
 */
const STABLE = {
  camY: [1.48, 1.98] as const,
  lookY: [1.32, 1.62] as const,
  fov: [48, 62] as const,
  minDist: 0.92,
  minHoriz: 1.05,
  maxDown: 0.18,
  roll: 0.024,
};

function stabilize(
  pos: Vec3,
  target: Vec3,
  fov: number,
  roll: number,
  allowOut = false,
): { pos: Vec3; target: Vec3; fov: number; roll: number } {
  const ty = clamp(target.y, STABLE.lookY[0], STABLE.lookY[1]);
  const tx = target.x;
  const tz = target.z;
  let p = keepDrone({ x: pos.x, y: clamp(pos.y, STABLE.camY[0], STABLE.camY[1]), z: pos.z }, allowOut);
  for (let i = 0; i < 4; i++) {
    const dx = p.x - tx;
    const dz = p.z - tz;
    const d = Math.hypot(dx, p.y - ty, dz);
    if (d >= STABLE.minDist) break;
    const horiz = Math.hypot(dx, dz);
    const ux = horiz < 1e-4 ? (Math.abs(p.x) > 0.05 ? Math.sign(p.x) : 0) : dx / horiz;
    const uz = horiz < 1e-4 ? (p.z >= 0 ? 1 : -1) : dz / horiz;
    const backed = { x: tx + ux * STABLE.minDist, y: p.y, z: tz + uz * STABLE.minDist };
    p = forbidRear(pushOffGirl(backed), true);
  }
  const dFinal = Math.hypot(p.x - tx, p.y - ty, p.z - tz);
  if (dFinal < 0.72) {
    p = forbidRear(pushOffGirl({ x: p.x * 0.7, y: p.y, z: p.z * 0.7 + 0.15 }), true);
  }
  p = { ...p, y: Math.min(p.y, ty + Math.tan(STABLE.maxDown) * Math.max(STABLE.minDist, Math.hypot(p.x - tx, p.z - tz))) };
  p.y = clamp(p.y, STABLE.camY[0], STABLE.camY[1]);
  return {
    pos: p,
    target: { x: tx, y: ty, z: tz },
    fov: clamp(fov, STABLE.fov[0], STABLE.fov[1]),
    roll: clamp(roll, -STABLE.roll, STABLE.roll),
  };
}

interface Cursor {
  yaw: number;
  radius: number;
  height: number;
}

const FACE: Vec3 = { x: 0, y: 1.52, z: HEX.personZ };

const OPENINGS: Record<DroneOpening, { yaw: number; radius: number; height: number; fov: number }> = {
  high: { yaw: 0.22, radius: 1.35, height: 1.92, fov: 56 },
  outside: { yaw: 0.55, radius: 3.05, height: 2.05, fov: 56 },
  right: { yaw: 0.95, radius: 1.28, height: 1.62, fov: 58 },
  left: { yaw: -0.95, radius: 1.28, height: 1.62, fov: 58 },
  behind: { yaw: 1.12, radius: 1.22, height: 2.22, fov: 60 },
  inside: { yaw: 0.28, radius: 1.08, height: 1.72, fov: 70 },
  face: { yaw: 0.82, radius: 1.05, height: 1.56, fov: 50 },
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

/** 64 scenes. Every take: outside + two artworks + scenography. Girl, if at all, from the side and far. */
const SCENE_NAMES = [
  "Sala e due opere", "Fuori, LED, scenografia", "Dettaglio e volume", "Orbita e tre pareti",
  "Alto, opera, sala", "Entrata sulla galleria", "Parete destra, sala, parete", "Parete sinistra e fuori",
  "Giro LED e zenit", "Due dettagli, un volume", "Esterno lento, due opere", "Scenografia, poi i LED",
  "Avvicina, resta, gira", "Dal muro al centro", "Tre tempi sulle opere", "Fuori alto, dentro largo",
  "Galleria frontale", "Galleria di destra", "Galleria di sinistra", "Arco sulle tre facce",
  "Piano sequenza A", "Piano sequenza B", "Piano sequenza C", "Piano sequenza D",
  "Largo e due close", "Close, largo, close", "Orbita, sala, dettaglio", "Dettaglio, orbita, sala",
  "Crane sulla sala", "Rise e due LED", "Wall ride destro", "Wall ride sinistro",
  "Cinque secondi fuori", "Cinque sul primo LED", "Cinque sul secondo", "Cinque in scenografia",
  "Doppio muro, un volume", "Volume, doppio muro", "Entra dal LED", "Esce dal LED",
  "Sala alta, opere basse", "Opere, sala, fuori", "Laterale sala, due LED", "Laterale opposto, due LED",
  "Tutto il fronte", "Il fronte da fuori", "Il fronte da dentro", "Il fronte dall'alto",
  "Avvicinamento a un'opera", "Seconda opera, volume", "Terza battuta fuori", "Quarta battuta sala",
  "Giro scenografico", "Installazione, non ritratto", "Le pareti parlano", "L'esagono da fuori",
  "L'esagono da dentro", "L'esagono dall'alto", "Due pareti, un cielo", "Cielo, due pareti",
  "Dettaglio tessuto LED", "Dettaglio e distanza", "Distanza e dettaglio", "Chiusura sulla sala",
] as const;

const SCENE_SEQS: DroneShot[][] = [
  ["orbit", "holdMonitor", "holdMonitor", "wideRoom", "orbitWall", "holdMonitor"],
  ["holdMonitor", "orbit", "wideRoom", "holdMonitor", "rise", "orbitWall"],
  ["orbitWall", "holdMonitor", "wideRoom", "orbit", "holdMonitor", "inside"],
  ["rise", "wideRoom", "holdMonitor", "orbitWall", "holdMonitor", "orbit"],
  ["orbit", "holdMonitor", "pushMonitor", "wideRoom", "holdMonitor", "crane"],
  ["pushMonitor", "holdMonitor", "orbit", "wideRoom", "orbitWall", "holdMonitor"],
  ["orbit", "wideRoom", "holdMonitor", "holdMonitor", "rise", "orbitWall"],
  ["holdMonitor", "orbitWall", "wideRoom", "orbit", "holdMonitor", "inside"],
];

const SCENE_OPEN: DroneOpening[] = ["outside", "high", "right", "left", "inside", "outside", "right", "left"];

const SCENE_ENV: Pick<ShootModel, "radius" | "height" | "fov" | "pace">[] = [
  { radius: [0.85, 1.4], height: [1.35, 2.2], fov: [40, 68], pace: 1.0 },
  { radius: [0.9, 1.42], height: [1.28, 1.95], fov: [34, 54], pace: 0.92 },
  { radius: [0.8, 1.38], height: [1.5, 2.4], fov: [48, 76], pace: 1.08 },
  { radius: [0.95, 1.42], height: [1.32, 2.05], fov: [36, 58], pace: 0.88 },
  { radius: [0.78, 1.35], height: [1.4, 2.35], fov: [42, 70], pace: 1.12 },
  { radius: [0.88, 1.4], height: [1.3, 1.88], fov: [32, 50], pace: 0.95 },
  { radius: [0.82, 1.38], height: [1.45, 2.25], fov: [46, 72], pace: 1.04 },
  { radius: [0.9, 1.4], height: [1.35, 2.1], fov: [38, 62], pace: 0.9 },
];

function buildScenes(): Omit<ShootModel, "id">[] {
  const out: Omit<ShootModel, "id">[] = [];
  for (let i = 0; i < 64; i++) {
    const seq = [...SCENE_SEQS[i % SCENE_SEQS.length]!];
    const girl = i % 11 === 0;
    if (girl) seq.splice(Math.max(1, seq.length - 2), 0, "sideGirl");
    const env = SCENE_ENV[i % SCENE_ENV.length]!;
    out.push({
      name: SCENE_NAMES[i]!,
      hint: girl
        ? "esterno, opere, scenografia; lei di lato e lontana, un attimo"
        : "esterno, due opere, scenografia — il setup, non il ritratto",
      opening: SCENE_OPEN[i % SCENE_OPEN.length]!,
      sequence: seq,
      radius: env.radius,
      height: env.height,
      fov: env.fov,
      pace: env.pace,
      lookFace: girl ? 0.16 : 0.05,
    });
  }
  return out;
}

const RAW_MODELS: Omit<ShootModel, "id">[] = buildScenes();

export const SHOOT_MODELS: ShootModel[] = RAW_MODELS.map((m, id) => ({ ...m, id }));

export function modelFromSeed(seed: number) {
  return SHOOT_MODELS[(((seed >>> 0) * 2654435761) >>> 0) % SHOOT_MODELS.length]!;
}

function keyFrom(t: number, kind: DroneShot, pos: Vec3, target: Vec3, fov: number, roll: number, out = false): DroneKey {
  const s = stabilize(pos, target, fov, roll, out);
  return { t, kind, position: s.pos, target: s.target, fov: s.fov, roll: s.roll, out };
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
  const roll = rngRange(rng, -0.02, 0.02);
  const r = () => rngRange(rng, model.radius[0], model.radius[1]);
  const h = () => rngRange(rng, Math.max(model.height[0], 1.48), Math.min(model.height[1], 2.15));
  const f = () => rngRange(rng, Math.max(48, model.fov[0]), Math.min(64, model.fov[1] < 48 ? 58 : model.fov[1]));
  const dur = (a: number, b: number) => rngRange(rng, a, b) * model.pace;
  if (kind === "orbit") {
    const sweep = (rng() > 0.5 ? 1 : -1) * rngRange(rng, 0.45, 1.05);
    const yaw = clamp(c.yaw + sweep, -1.25, 1.25);
    return {
      pos: polar(yaw, rngRange(rng, OUTER_MIN + 0.15, OUTER_MIN + 1.15), rngRange(rng, 1.55, 2.05)),
      target: { x: 0, y: HEX.outerCenterY, z: 0.45 },
      fov: rngRange(rng, 50, 60),
      roll,
      dur: dur(4.6, 6.2),
    };
  }
  if (kind === "crane") {
    const yaw = clamp(c.yaw + rngRange(rng, -0.45, 0.45), -1.2, 1.2);
    return {
      pos: polar(yaw, Math.max(r(), 0.95), h()),
      target: { x: 0, y: HEX.outerCenterY, z: 0.4 },
      fov: f(),
      roll,
      dur: dur(3.0, 5.4),
    };
  }
  if (kind === "rise") {
    return {
      pos: polar(clamp(c.yaw + rngRange(rng, -0.35, 0.35), -1.15, 1.15), rngRange(rng, 0.95, INNER_MAX), rngRange(rng, 1.85, 2.15)),
      target: { x: 0, y: HEX.outerCenterY + 0.08, z: 0.35 },
      fov: rngRange(rng, 52, 62),
      roll: roll * 0.35,
      dur: dur(3.0, 5.0),
    };
  }
  if (kind === "pushTouch") {
    const side = rng() > 0.5 ? 1 : -1;
    const yaw = side * rngRange(rng, 0.7, 1.1);
    return {
      pos: polar(yaw, rngRange(rng, 1.1, INNER_MAX), rngRange(rng, 1.5, 1.82)),
      target: { x: 0, y: HEX.outerCenterY, z: HEX.tableZ },
      fov: rngRange(rng, 48, 58),
      roll,
      dur: dur(2.4, 3.2),
    };
  }
  if (kind === "pushMonitor") {
    const index = rngPick(rng, [1, 2, 6] as const);
    const a = monitorAngle(index);
    const m = monitorPosition(index);
    return {
      pos: polar(a, HEX.radius + rngRange(rng, 0.7, 1.25), rngRange(rng, 1.42, 1.72)),
      target: { x: m.x * 0.88, y: HEX.outerCenterY, z: m.z * 0.88 },
      fov: rngRange(rng, 48, 58),
      roll,
      dur: dur(4.4, 5.6),
    };
  }
  if (kind === "holdMonitor") {
    const index = rngPick(rng, [1, 2, 6] as const);
    const a = monitorAngle(index) + rngRange(rng, -0.1, 0.1);
    const m = monitorPosition(index);
    return {
      pos: polar(a, HEX.radius - rngRange(rng, 0.7, 1.05), rngRange(rng, 1.42, 1.62)),
      target: { x: m.x * 0.92, y: HEX.outerCenterY, z: m.z * 0.92 },
      fov: rngRange(rng, 48, 56),
      roll: roll * 0.4,
      dur: dur(4.8, 6.2),
    };
  }
  if (kind === "wideRoom") {
    return {
      pos: polar(rngRange(rng, -0.9, 0.9), rngRange(rng, 0.9, 1.28), rngRange(rng, 1.55, 2.05)),
      target: { x: rngRange(rng, -0.2, 0.2), y: HEX.outerCenterY, z: rngRange(rng, 0.4, 0.9) },
      fov: rngRange(rng, 54, 64),
      roll: roll * 0.25,
      dur: dur(4.6, 5.8),
    };
  }
  if (kind === "orbitWall") {
    const yaw = rngRange(rng, -1.05, 1.05);
    const index = yaw > 0.35 ? 2 : yaw < -0.35 ? 6 : 1;
    const m = monitorPosition(index);
    return {
      pos: polar(yaw, HEX.radius - rngRange(rng, 0.65, 1.0), rngRange(rng, 1.42, 1.72)),
      target: { x: m.x * 0.86, y: HEX.outerCenterY, z: m.z * 0.86 },
      fov: rngRange(rng, 50, 60),
      roll,
      dur: dur(4.8, 6.0),
    };
  }
  if (kind === "sideGirl" || kind === "faceClose") {
    const side = rng() > 0.5 ? 1 : -1;
    return {
      pos: {
        x: side * rngRange(rng, 1.05, 1.35),
        y: rngRange(rng, 1.52, 1.72),
        z: HEX.personZ + rngRange(rng, 0.45, 0.85),
      },
      target: { x: 0, y: 1.52, z: HEX.personZ + 0.08 },
      fov: rngRange(rng, 50, 58),
      roll: roll * 0.4,
      dur: dur(1.8, 2.6),
    };
  }
  if (kind === "spin180") {
    const dir = rng() > 0.5 ? 1 : -1;
    const yaw = clamp(c.yaw + dir * rngRange(rng, 0.7, 1.15), -1.2, 1.2);
    return {
      pos: polar(yaw, Math.max(r(), 0.95), Math.max(h(), 1.5)),
      target: { x: 0, y: HEX.outerCenterY, z: 0.4 },
      fov: f(),
      roll,
      dur: dur(3.4, 5.4),
    };
  }
  if (kind === "inside") {
    return {
      pos: polar(rngRange(rng, -1.0, 1.0), rngRange(rng, 0.9, 1.28), rngRange(rng, 1.52, 2.05)),
      target: { x: rngRange(rng, -0.18, 0.18), y: HEX.outerCenterY, z: rngRange(rng, 0.4, 0.85) },
      fov: rngRange(rng, 54, 64),
      roll,
      dur: dur(4.4, 5.6),
    };
  }
  return {
    pos: polar(clamp(c.yaw + rngRange(rng, -0.55, 0.55), -1.2, 1.2), Math.max(r(), 0.95), Math.max(h(), 1.5)),
    target: { x: 0, y: HEX.outerCenterY, z: 0.35 },
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
  const wantOut = duration * 0.26;
  const wantIn = inT < 1e-3 ? duration : duration * 0.74;
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
    pos = { x: side * 0.72, y: 1.56, z: HEX.personZ + 0.48 };
  }
  const startKind: DroneShot = model.sequence[0] ?? "orbit";
  const openOut = opening === "outside" || startKind === "orbit" || startKind === "pushMonitor";
  const keys: DroneKey[] = [
    keyFrom(
      0,
      startKind,
      pos,
      { x: 0, y: HEX.outerCenterY, z: 0.55 },
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
  while (t < duration - 2.2 && i < 24) {
    let kind = seq[i % seq.length]!;
    if (kind === last && seq.length > 1) kind = seq[(i + 1) % seq.length]!;
    const stepOut = kind === "orbit" || kind === "pushMonitor";
    const step = advanceShot(kind, c, rng, model);
    t = Math.min(duration, t + step.dur);
    keys.push(keyFrom(t, kind, step.pos, step.target, step.fov, step.roll, stepOut));
    c = cursorOf(keys[keys.length - 1]!.position);
    last = kind;
    i++;
  }
  const land = polar(
    clamp(c.yaw + rngRange(rng, 0.15, 0.7), -1.15, 1.15),
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
  const rawTarget = {
    x: catmull(a.target.x, b.target.x, c.target.x, d.target.x, u),
    y: catmull(a.target.y, b.target.y, c.target.y, d.target.y, u),
    z: catmull(a.target.z, b.target.z, c.target.z, d.target.z, u),
  };
  const s = stabilize(pos, rawTarget, lerp(b.fov, c.fov, u), lerp(b.roll, c.roll, u), allowOut);
  return {
    position: s.pos,
    target: s.target,
    fov: s.fov,
    roll: s.roll,
    barrel: lerp(0.04, 0.1, clamp((2.2 - Math.hypot(s.pos.x, s.pos.z)) * 0.25, 0, 1)),
  };
}

export function applyFormatOptics(pose: CameraPose, format: OutputFormat): CameraPose {
  if (format === "9:16") {
    return {
      ...pose,
      fov: clamp(pose.fov * 1.08 + 4, 52, 68),
      barrel: clamp(pose.barrel * 0.45 + 0.05, 0.05, 0.14),
      target: { x: pose.target.x, y: clamp(pose.target.y + 0.12, 1.32, 1.68), z: pose.target.z },
    };
  }
  if (format === "1:1") {
    return {
      ...pose,
      fov: clamp(pose.fov * 1.06 + 2, 50, 66),
      barrel: clamp(pose.barrel * 0.6, 0, 0.12),
    };
  }
  return { ...pose, fov: clamp(pose.fov, 48, 64), barrel: pose.barrel * 0.5 };
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
