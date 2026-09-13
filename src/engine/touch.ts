import { HEX } from "./config.ts";
import { clamp, computeBlit, lerp, smootherstep, wander } from "./math.ts";
import type { ArtworkViewport, GestureId, HandTarget, Vec3 } from "./types.ts";

/**
 * How a person actually works a 55" table touchscreen.
 *
 * The rule the rest of the engine leans on: SKIN TOUCHES THE GLASS AT THE
 * FINGERTIPS. The palm floats, the wrist rides above and behind the contact,
 * and nothing is ever allowed under the surface. Between one detail and the
 * next the hand lifts off and travels through the air instead of smearing
 * across the artwork.
 */

/** Glass plane: near edge (operator) low, far edge high. */
export function tableY(z: number) {
  return HEX.tableHeight + 0.008 + Math.tan(HEX.tableTilt) * (z - HEX.tableZ);
}

/** Unit normal of the glass, Y-up world. */
export const GLASS_N = { x: 0, y: Math.cos(HEX.tableTilt), z: -Math.sin(HEX.tableTilt) };

const HALF_W = HEX.screen55.width * 0.47;
const HALF_D = (HEX.screen55.height / 2) * Math.cos(HEX.tableTilt);
const Z_MIN = HEX.tableZ - HALF_D + 0.05;
const Z_MAX = HEX.tableZ + HALF_D - 0.05;

/** Ergonomics of a hand on a big glass table, metres. */
export const TOUCH = {
  /** fingertip skin offset while pressed — contact, never intersection */
  contactClear: 0.009,
  /** clearance the knuckles and folded joints must keep from the glass */
  boneClear: 0.012,
  /** a finger that is not touching may come close, but never through */
  idleTipClear: 0.007,
  /** …and the palm, which must stay visibly off the surface */
  palmClear: 0.028,
  /** fingertip height while hovering, ready over a point */
  hoverClear: 0.045,
  /** apex of the travel arc between two details — the arm really swings */
  travelClear: 0.2,
  /** wrist sits this far back toward the operator from the contact */
  wristBack: 0.088,
  /** …and this high above the glass: the palm never lies down */
  wristUp: 0.082,
  /** two fingertips of one hand, fully pinched together */
  pinchMin: 0.06,
  /** comfortable one-hand thumb→index span */
  pinchOneHandMax: 0.185,
  /** two-hand span ceiling on a 1.2 m glass */
  pinchTwoHandMax: 0.46,
  /** above this the gesture needs both hands */
  twoHandFrom: 0.2,
  /** where the idle hand waits: out to the side, arm extended, off the picture */
  parkZ: Z_MIN + 0.02,
  parkX: HALF_W * 0.94,
  /**
   * How far across the glass she works.
   *
   * An arm is a finite length. Past this line a person does not reach — they
   * lean their whole chest over the table, which looks like someone about to
   * put their face on the screen. So contacts saturate here and the arm does
   * the work instead of the spine.
   */
  reachZ: HEX.tableZ + 0.14,
} as const;

export type HandTouch = HandTarget;

export interface TouchHands {
  left: HandTouch;
  right: HandTouch;
}

export interface TouchBeat {
  /** 0..1 inside the current plan segment */
  local: number;
  /** segment length, seconds */
  dur: number;
  /** viewport when the beat started — what the finger grabbed */
  fromViewport: ArtworkViewport;
  /** viewport right now */
  viewport: ArtworkViewport;
  time: number;
  seed: number;
  /** camera is flying between angles: hands wait, off the glass */
  travelling?: boolean;
}

export function clampToGlass(x: number, z: number) {
  return { x: clamp(x, -HALF_W, HALF_W), z: clamp(z, Z_MIN, Z_MAX) };
}

/**
 * Same, but kept inside comfortable arm's length: the far strip of the glass
 * is looked at, never touched.
 */
export function clampToReach(x: number, z: number) {
  return { x: clamp(x, -HALF_W, HALF_W), z: clamp(z, Z_MIN, TOUCH.reachZ) };
}

/** A point ON the glass plane, raised `clear` along the surface normal. */
export function onGlass(x: number, z: number, clear = 0): Vec3 {
  const p = clampToGlass(x, z);
  return {
    x: p.x,
    y: tableY(p.z) + GLASS_N.y * clear,
    z: p.z + GLASS_N.z * clear,
  };
}

/**
 * Signed perpendicular distance of a world point from the glass plane.
 * Positive above the surface, negative inside the monitor — which is the one
 * thing that must never happen.
 */
export function heightOverGlass(p: { y: number; z: number }) {
  return (p.y - tableY(p.z)) * GLASS_N.y;
}

export function isOnMonitor(z: number) {
  return z > HEX.tableZ - 0.32;
}

export function worldToGlassUv(x: number, z: number) {
  const u = (HALF_W - x) / Math.max(1e-6, 2 * HALF_W);
  const v = (Z_MAX - z) / Math.max(1e-6, Z_MAX - Z_MIN);
  return { u: clamp(u, -0.08, 1.08), v: clamp(v, -0.08, 1.08) };
}

/**
 * Where a point OF THE ARTWORK currently sits on the 55" glass, given the
 * viewport the screen is showing.
 *
 * The two arguments are different things and that is the whole point: the
 * viewport says what is on screen, the point says which bit of paint we are
 * looking for. Ask this where a detail went, put the finger there, and the
 * finger and the picture are the same object.
 */
export function glassForArtPoint(
  pointCx: number,
  pointCy: number,
  viewport: ArtworkViewport,
  artW = 1,
  artH = 1,
): { x: number; z: number; inside: boolean } {
  const blit = computeBlit(artW, artH, 16, 9, {
    cx: viewport.cx,
    cy: viewport.cy,
    zoom: Math.max(1, viewport.zoom),
  });
  const ax = clamp(pointCx, 0, 1) * artW;
  const ay = clamp(pointCy, 0, 1) * artH;
  const u = (blit.dx + ((ax - blit.sx) / Math.max(1e-6, blit.sw)) * blit.dw) / 16;
  const v = (blit.dy + ((ay - blit.sy) / Math.max(1e-6, blit.sh)) * blit.dh) / 9;
  return {
    x: lerp(HALF_W, -HALF_W, clamp(u, 0, 1)),
    z: lerp(Z_MAX, Z_MIN, clamp(v, 0, 1)),
    inside: u >= -0.02 && u <= 1.02 && v >= -0.02 && v <= 1.02,
  };
}

/**
 * Contact envelope of one beat: land, work, let go.
 * Pure function of segment-local time so an export can be re-evaluated at any
 * frame and get the same hand.
 */
export function contactEnvelope(local: number, dur: number) {
  const t = clamp(local, 0, 1);
  // a short beat still needs a readable land/lift; a long one keeps them snappy
  const land = clamp(0.5 / Math.max(0.8, dur), 0.06, 0.26);
  const leave = 1 - clamp(0.42 / Math.max(0.8, dur), 0.05, 0.22);
  const down = smootherstep(t / land);
  const up = 1 - smootherstep((t - leave) / Math.max(1e-4, 1 - leave));
  const press = clamp(Math.min(down, up), 0, 1);
  return { press, landing: t < land, leaving: t > leave };
}

/** Height of the fingertip over the glass for a given press level. */
export function tipClear(press: number, travelling = false) {
  if (travelling) return TOUCH.travelClear;
  const p = clamp(press, 0, 1);
  // an approach arcs in: high, then down onto the point
  const arc = Math.sin((1 - p) * Math.PI) * 0.75;
  return lerp(TOUCH.hoverClear + TOUCH.travelClear * arc, TOUCH.contactClear, smootherstep(p));
}

/** The zoom the glass shows with the whole artwork on it. */
export const FULL_FRAME_ZOOM = 1.05;

/**
 * Physical pinch law: the span between the fingers IS the magnification.
 * Twice as wide, twice the picture. Measuring it against the full-frame zoom
 * rather than against each beat keeps it continuous — the hands never reset
 * their width between one gesture and the next.
 */
export function spanForZoom(zoom: number, reference = FULL_FRAME_ZOOM, twoHand = true) {
  const ratio = clamp(zoom / Math.max(1e-3, reference), 0.35, 4.6);
  const span = TOUCH.pinchMin * 1.75 * ratio;
  return clamp(span, TOUCH.pinchMin, twoHand ? TOUCH.pinchTwoHandMax : TOUCH.pinchOneHandMax);
}

/** Live skin: a hand on glass is never perfectly still, but it never twitches. */
function tremor(time: number, seed: number, channel: number, amp: number) {
  return (
    (wander(time, seed, channel, 0.37) * 0.7 + wander(time, seed, channel + 40, 1.05) * 0.3) * amp
  );
}

function park(side: 1 | -1, pose: GestureId, time: number, seed: number, amp: number): HandTouch {
  const x = side * TOUCH.parkX + tremor(time, seed, 17 + side, amp * 0.5);
  const z = TOUCH.parkZ + tremor(time, seed, 23 + side, amp * 0.4);
  const p = onGlass(x, z, TOUCH.hoverClear * 1.5);
  return { ...p, lift: 1, press: 0, role: "park", pose };
}

export interface ContactInput {
  gesture: GestureId;
  /** artwork point the beat is about */
  targetCx: number;
  targetCy: number;
  /** what the screen is showing right now */
  viewport: ArtworkViewport;
  /** the zoom her fingers started this gesture from */
  baseZoom: number;
  /** -1 left hand leads, +1 right hand leads */
  lead: number;
  /** 0 working → 1 head up, off the glass */
  glance: number;
  artW: number;
  artH: number;
  handAmplitude: number;
}

/**
 * Solve both hands for one instant.
 * `beat` supplies the contact envelope; without it the hands are treated as
 * already pressed and steady (used by geometry tests).
 */
export function solveTouch(input: ContactInput, beat?: TouchBeat): TouchHands {
  const {
    gesture,
    targetCx,
    targetCy,
    viewport,
    baseZoom,
    lead,
    glance,
    artW,
    artH,
    handAmplitude,
  } = input;
  const zoom = viewport.zoom;

  const amp = clamp(handAmplitude, 0, 1.2) * 0.004;
  const time = beat?.time ?? 0;
  const seed = beat?.seed ?? 1;
  const travelling = beat?.travelling ?? false;

  const env = beat ? contactEnvelope(beat.local, beat.dur) : { press: 1, landing: false, leaving: false };
  // eyes off the glass, or the camera is flying: she is not touching anything
  const offGlass = clamp(glance * 1.35, 0, 1);
  const press = clamp(env.press * (1 - offGlass), 0, 1) * (travelling ? 0 : 1);
  const lift = 1 - press;
  const clear = tipClear(press, travelling);

  /** Where the detail she is working on is sitting on the glass right now. */
  const anchor = glassForArtPoint(targetCx, targetCy, viewport, artW, artH);

  if (gesture === "HOLD" || travelling || press < 0.02) {
    /**
     * Hands off the glass. If her attention has left the table — a glance at
     * the walls, a camera move — they go and wait at the near bezel, clear of
     * the picture. If she is simply looking at what she just opened, they stay
     * where they were, hovering: you do not walk your hands away from a detail
     * you are still reading.
     */
    if (travelling || offGlass > 0.35) {
      return {
        left: park(-1, gesture, time, seed, amp * 4),
        right: park(1, gesture, time, seed ^ 0x5bd1, amp * 4),
      };
    }
    const span = spanForZoom(zoom, baseZoom);
    const hover = TOUCH.hoverClear * 1.7;
    const a = clampToReach(anchor.x - span * 0.5 + tremor(time, seed, 5, amp * 3), anchor.z + tremor(time, seed, 8, amp * 3));
    const b = clampToReach(anchor.x + span * 0.5 + tremor(time, seed, 6, amp * 3), anchor.z + tremor(time, seed, 9, amp * 3));
    return {
      left: { ...onGlass(a.x, a.z, hover), lift: 1, press: 0, role: "park", pose: gesture },
      right: { ...onGlass(b.x, b.z, hover), lift: 1, press: 0, role: "park", pose: gesture },
    };
  }

  const jx = tremor(time, seed, 3, amp);
  const jz = tremor(time, seed, 9, amp);

  if (gesture === "SPREAD" || gesture === "PINCH" || gesture === "RETURN") {
    /**
     * Zoom on a table this big is a two-hand gesture: one index finger per
     * hand, opening or closing around the detail. It reads instantly on
     * camera and it is what anyone actually does on a 55".
     */
    const span = spanForZoom(zoom, baseZoom);
    // the pinch axis leans slightly with the lead hand — never a rigid horizontal
    const tilt = clamp(lead, -1, 1) * 0.22;
    const dx = Math.cos(tilt);
    const dz = Math.sin(tilt);
    const half = span * 0.5;
    const a = clampToReach(anchor.x - dx * half + jx, anchor.z - dz * half + jz);
    const b = clampToReach(anchor.x + dx * half + jx, anchor.z + dz * half + jz);
    return {
      left: { ...onGlass(a.x, a.z, clear), lift, press, role: "pinch", pose: gesture },
      right: { ...onGlass(b.x, b.z, clear), lift, press, role: "pinch", pose: gesture },
    };
  }

  if (gesture.startsWith("PAN")) {
    /**
     * Drag: at touch-down the finger takes hold of one piece of paint, and
     * that piece stays under the finger for the whole slide. The picture moves
     * because the hand moved it — pan the view right and the hand travels
     * left, exactly as it would on the real glass.
     */
    const grabbed = beat
      ? { cx: beat.fromViewport.cx, cy: beat.fromViewport.cy }
      : { cx: targetCx, cy: targetCy };
    const held = glassForArtPoint(grabbed.cx, grabbed.cy, viewport, artW, artH);
    const side: 1 | -1 =
      gesture === "PAN_LEFT" ? -1 : gesture === "PAN_RIGHT" ? 1 : lead >= 0 ? 1 : -1;
    const p = clampToReach(held.x + jx, held.z + jz);
    const working: HandTouch = {
      ...onGlass(p.x, p.z, clear),
      lift,
      press,
      role: "drag",
      pose: gesture,
    };
    const idle = park(side === 1 ? -1 : 1, gesture, time, seed, amp * 4);
    return side === 1 ? { left: idle, right: working } : { left: working, right: idle };
  }

  // DETAIL_POINT — one index finger, straight onto the detail
  const side: 1 | -1 = anchor.x >= 0 ? 1 : -1;
  const p = clampToReach(anchor.x + jx, anchor.z + jz);
  const working: HandTouch = {
    ...onGlass(p.x, p.z, clear),
    lift,
    press,
    role: "point",
    pose: gesture,
  };
  const idle = park(side === 1 ? -1 : 1, gesture, time, seed, amp * 4);
  return side === 1 ? { left: idle, right: working } : { left: working, right: idle };
}

export { HALF_W, Z_MIN, Z_MAX, HALF_D };
