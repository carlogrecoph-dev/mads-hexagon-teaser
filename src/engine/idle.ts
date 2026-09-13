import { clamp, hashSeed, seedRange, seedUnit, smootherstep, wander } from "./math.ts";

/**
 * Personality layer.
 *
 * Everything here is a PURE function of (time, seed): an export re-evaluates
 * arbitrary frames out of order, so nothing may accumulate. Beats are placed
 * on hashed slots — regular enough to feel alive, irregular enough that you
 * can never hum along.
 */

export interface IdlePose {
  /** head/neck, radians */
  yaw: number;
  pitch: number;
  roll: number;
  /** eyelids, 0 open → 1 shut */
  blink: number;
  /** weight on the legs, -1 left → +1 right */
  weight: number;
  /** one shoulder rolling back, 0..1 */
  shoulder: number;
  /** neck stretch / sgranchirsi, 0..1 */
  stretch: number;
  /** 0..1, how far her attention is off the glass right now */
  away: number;
}

export interface Distraction {
  glance: number;
  glanceDir: number;
  stretch: number;
}

interface Beat {
  /** 0..1 envelope of the beat at this instant */
  k: number;
  /** deterministic variation for this occurrence */
  a: number;
  b: number;
}

/**
 * A recurring beat on hashed slots: one event per `period`, jittered inside
 * the slot, with a smooth rise and fall of `width` seconds.
 */
function beat(time: number, seed: number, channel: number, period: number, width: number): Beat {
  const slot = Math.floor(time / period);
  let k = 0;
  let a = 0;
  let b = 0;
  // check this slot and the previous one so an event never gets clipped
  for (let s = slot - 1; s <= slot + 1; s++) {
    const h1 = hashSeed(seed + channel * 7919, s * 2657) / 4294967296;
    const h2 = hashSeed(seed + channel * 104729, s * 7919) / 4294967296;
    const h3 = hashSeed(seed + channel * 15485863, s * 1299709) / 4294967296;
    const at = s * period + h1 * Math.max(0, period - width);
    const d = Math.abs(time - at);
    if (d < width * 0.5) {
      const kk = Math.cos((d / (width * 0.5)) * Math.PI) * 0.5 + 0.5;
      if (kk > k) {
        k = kk;
        a = h2 * 2 - 1;
        b = h3;
      }
    }
  }
  return { k, a, b };
}

export interface IdleInput {
  time: number;
  seed: number;
  /** 0 hands resting → 1 hands working the glass */
  busy: number;
  /** 0 eyes on the glass → 1 head already up at the walls (from the plan) */
  glance: number;
  /** overall dial, 0 = perfectly still, 1 = full personality */
  amount: number;
}

export function idlePose(input: IdleInput): IdlePose {
  const { time: t, seed, amount } = input;
  const busy = clamp(input.busy, 0, 1);
  const glance = clamp(input.glance, 0, 1);
  const dial = clamp(amount, 0, 1);

  /** Free attention: she only wanders when her hands are not mid-gesture. */
  const free = dial * (1 - smootherstep(busy)) * (1 - glance * 0.5);

  // ── eyes ──────────────────────────────────────────────────────────────
  // a blink every ~3.5 s, plus the occasional quick double
  const b1 = beat(t, seed, 1, 3.5, 0.17);
  const b2 = beat(t - 0.26, seed, 2, 11, 0.15);
  const blink = clamp(Math.max(b1.k, b2.k * (b2.b > 0.55 ? 1 : 0)), 0, 1) * dial;

  // ── attention ─────────────────────────────────────────────────────────
  // every ~9 s she looks off the glass for a moment: a monitor, the room
  const look = beat(t, seed, 3, 9.2, 2.1);
  const lookDir = look.a >= 0 ? 1 : -1;
  const lookK = look.k * free;

  // a shorter, smaller check of the near monitor
  const check = beat(t, seed, 4, 5.7, 1.1);
  const checkK = check.k * free * 0.5;

  // ── body ──────────────────────────────────────────────────────────────
  // weight rocks from one leg to the other on a slow, uneven cycle
  const shift = beat(t, seed, 5, 13.5, 5.2);
  const weight = (wander(t, seed, 31, 0.055) * 0.6 + shift.a * shift.k * 0.8) * dial;

  // shoulders roll back now and then — only with the hands off the glass
  const roll = beat(t, seed, 6, 21, 2.6);
  const shoulder = roll.k * free * (roll.b > 0.4 ? 1 : 0.35);

  // and, more rarely, a real stretch of the neck
  const str = beat(t, seed, 7, 31, 3.2);
  const stretch = str.k * free * (str.b > 0.55 ? 1 : 0.25);

  // ── head ──────────────────────────────────────────────────────────────
  const drift = wander(t, seed, 12, 0.13) * 0.035 + wander(t, seed, 13, 0.31) * 0.012;
  const nod = wander(t, seed, 14, 0.11) * 0.028;

  const yaw = (lookDir * 0.42 * lookK + checkK * (check.a >= 0 ? 0.16 : -0.16) + drift) * dial;
  const pitch = (-0.13 * lookK - 0.19 * stretch + nod) * dial;
  const roll2 = (lookDir * 0.05 * lookK + weight * 0.035 + wander(t, seed, 15, 0.09) * 0.02) * dial;

  return {
    yaw,
    pitch,
    roll: roll2,
    blink,
    weight,
    shoulder,
    stretch,
    away: clamp(lookK + stretch * 0.6, 0, 1),
  };
}

const NONE: Distraction = { glance: 0, glanceDir: 0, stretch: 0 };

/** Who she is, for this teaser. Unpacked from the 32-bit seed. */
export interface OperatorSeed {
  /** 0 stays on the work → 1 looks up often */
  curiosity: number;
  /** 0 calm hands → 1 shakes fingers out */
  fidget: number;
  /** preferred wall, -1 left 75" → +1 right */
  sideBias: number;
  /** first lapse, seconds into the teaser */
  firstLapse: number;
  /** how long a glance lasts, seconds */
  glanceHold: number;
  /** seconds between possible looks */
  lookPeriod: number;
  /** seconds between possible finger shakes */
  fidgetPeriod: number;
}

export function operatorFromSeed(seed: number): OperatorSeed {
  const curiosity = seedUnit(seed, 11);
  const fidget = seedUnit(seed, 23);
  const restlessness = 0.35 + seedUnit(seed, 41) * 0.65;
  return {
    curiosity,
    fidget,
    sideBias: seedUnit(seed, 59) * 2 - 1,
    firstLapse: seedRange(seed, 71, 2.6, 7.2),
    glanceHold: seedRange(seed, 83, 1.45, 2.35),
    lookPeriod: seedRange(seed, 97, 18.5, 9.2) * (1.15 - restlessness * 0.25),
    fidgetPeriod: seedRange(seed, 107, 12.8, 6.4) * (1.1 - fidget * 0.2),
  };
}

/**
 * Seeded, irregular lapses of attention while she works the 55".
 * Looks at a wall monitor, shakes the fingers out, or both — never on a grid.
 * The seed decides how restless she is, which wall she prefers, and when.
 */
export function distractionAt(time: number, seed: number): Distraction {
  const op = operatorFromSeed(seed);
  if (time < op.firstLapse) return NONE;
  const look = beat(time, seed, 21, op.lookPeriod, op.glanceHold);
  const fidget = beat(time, seed, 22, op.fidgetPeriod, 1.15 + op.fidget * 0.5);
  const flick = beat(time, seed, 23, op.lookPeriod * 1.35, op.glanceHold * 0.8);

  const lookChance = 0.22 + op.curiosity * 0.5;
  const fidgetChance = 0.28 + op.fidget * 0.45;
  const lookOn = look.k > 0 && look.b < lookChance;
  const fidgetOn = fidget.k > 0 && fidget.b < fidgetChance;
  const flickOn = flick.k > 0 && flick.b < lookChance * 0.55;

  let glance = 0;
  let glanceDir = 0;
  let stretch = 0;

  const prefer = (raw: number) => {
    const signed = raw >= 0 ? 1 : -1;
    return Math.sign(op.sideBias) === signed || Math.abs(op.sideBias) < 0.2 ? signed : -signed;
  };

  if (lookOn) {
    glance = look.k * (0.7 + op.curiosity * 0.3);
    glanceDir = prefer(look.a);
    stretch = look.k * (0.28 + op.fidget * 0.35);
  }
  if (flickOn && flick.k > glance * 0.55) {
    glance = Math.max(glance, flick.k * (0.8 + op.curiosity * 0.15));
    glanceDir = prefer(flick.a);
    stretch = Math.max(stretch, flick.k * (0.4 + op.fidget * 0.25));
  }
  if (fidgetOn) {
    stretch = Math.max(stretch, fidget.k * (0.45 + op.fidget * 0.5));
    if (!lookOn && op.curiosity > 0.62 && fidget.b < 0.2) {
      glance = Math.max(glance, fidget.k * 0.38);
      glanceDir = prefer(fidget.a);
    }
  }

  return {
    glance: clamp(glance, 0, 1),
    glanceDir: clamp(glanceDir, -1, 1),
    stretch: clamp(stretch, 0, 1),
  };
}
