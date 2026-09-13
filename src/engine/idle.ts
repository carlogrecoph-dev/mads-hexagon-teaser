import { clamp, hashSeed, smootherstep, wander } from "./math.ts";

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
