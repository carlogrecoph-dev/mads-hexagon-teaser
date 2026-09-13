/**
 * Live motion tuning.
 *
 * Every number that decides how she MOVES used to be a constant buried in the
 * rig. That is fine while one person is writing the rig and wrong as soon as
 * somebody wants to direct it: "meno rigida", "capelli più vivi", "mani più
 * lente" are directions, not code changes.
 *
 * So they live here instead, in one plain mutable object the rig reads every
 * frame. Not a React store: the rig runs inside the render loop and must not
 * pay for a subscription sixty times a second. The panel writes, the rig
 * reads, and a tiny listener list exists only so the UI can redraw itself.
 *
 * Values are multipliers around 1 wherever that makes sense, so a preset is
 * readable and 1 always means "as designed".
 */

export interface MotionTuning {
  /** Overall speed of everything she does. 1 = as designed. */
  tempo: number;
  /** Finger articulation: 0 stiff paddle, 1 as designed, 1.4 very loose. */
  fingerRange: number;
  /** How high the wrist rides above the glass. */
  wristHeight: number;
  /** Micro-movement of the skin: breath, tremor, weight shifts. */
  liveliness: number;
  /** How far the body turns towards what she is working on. */
  torsoTurn: number;
  /** How far she is allowed to lean over the table. */
  leanLimit: number;
  /** Hair: how stiffly it is pulled back to hanging. */
  hairStiffness: number;
  /** Hair: how fast the swing dies out. */
  hairDamping: number;
  /** Hair: how much of her movement it picks up. */
  hairInertia: number;
  /** Skirt swing, as a fraction of the hair's. */
  skirtSwing: number;
}

export const MOTION_DEFAULTS: MotionTuning = {
  tempo: 1,
  fingerRange: 1,
  wristHeight: 1,
  liveliness: 1,
  torsoTurn: 1,
  leanLimit: 1,
  hairStiffness: 1,
  hairDamping: 1,
  hairInertia: 1,
  skirtSwing: 1,
};

/** Named looks. A preset is just a patch over the defaults. */
export const MOTION_PRESETS: { id: string; label: string; hint: string; values: Partial<MotionTuning> }[] = [
  {
    id: "default",
    label: "Come progettato",
    hint: "I valori di riferimento",
    values: {},
  },
  {
    id: "calma",
    label: "Calma",
    hint: "Gesti lenti e misurati, poco movimento secondario",
    values: { tempo: 0.82, liveliness: 0.6, hairInertia: 0.7, torsoTurn: 0.8 },
  },
  {
    id: "felina",
    label: "Felina",
    hint: "Sciolta, fluida, capelli vivi",
    values: { tempo: 1.05, fingerRange: 1.2, liveliness: 1.35, hairInertia: 1.4, hairDamping: 0.8, torsoTurn: 1.25 },
  },
  {
    id: "tecnica",
    label: "Tecnica",
    hint: "Precisa e asciutta, come chi lavora davvero",
    values: { tempo: 1.15, liveliness: 0.75, hairInertia: 0.8, leanLimit: 0.8, fingerRange: 0.9 },
  },
  {
    id: "teatrale",
    label: "Teatrale",
    hint: "Ampia e larga, per le inquadrature lunghe",
    values: { torsoTurn: 1.4, liveliness: 1.2, hairInertia: 1.5, tempo: 0.92, wristHeight: 1.15 },
  },
];

export const MOTION_RANGES: Record<keyof MotionTuning, { min: number; max: number; step: number; label: string; group: string; unit?: string }> = {
  tempo: { min: 0.6, max: 1.6, step: 0.01, label: "Ritmo generale", group: "Gesti" },
  fingerRange: { min: 0.4, max: 1.5, step: 0.01, label: "Articolazione dita", group: "Gesti" },
  wristHeight: { min: 0.6, max: 1.6, step: 0.01, label: "Altezza del polso", group: "Gesti" },
  liveliness: { min: 0, max: 2, step: 0.01, label: "Micro-movimenti", group: "Corpo" },
  torsoTurn: { min: 0, max: 2, step: 0.01, label: "Rotazione del busto", group: "Corpo" },
  leanLimit: { min: 0, max: 1.6, step: 0.01, label: "Quanto si sporge", group: "Corpo" },
  hairStiffness: { min: 0.3, max: 2.2, step: 0.01, label: "Rigidità capelli", group: "Capelli e abito" },
  hairDamping: { min: 0.3, max: 2.2, step: 0.01, label: "Smorzamento capelli", group: "Capelli e abito" },
  hairInertia: { min: 0, max: 2.5, step: 0.01, label: "Inerzia capelli", group: "Capelli e abito" },
  skirtSwing: { min: 0, max: 2.5, step: 0.01, label: "Oscillazione gonna", group: "Capelli e abito" },
};

export const MOTION_GROUPS = ["Gesti", "Corpo", "Capelli e abito"] as const;

/** The live values. Read this directly from the render loop. */
export const tuning: MotionTuning = { ...MOTION_DEFAULTS };

type Listener = () => void;
const listeners = new Set<Listener>();

export function onTuningChange(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function announce() {
  for (const fn of listeners) fn();
}

const KEY = "mads-motion-tuning-v1";

export function setTuning(patch: Partial<MotionTuning>) {
  let changed = false;
  for (const [k, v] of Object.entries(patch) as [keyof MotionTuning, number][]) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const r = MOTION_RANGES[k];
    const next = Math.min(r.max, Math.max(r.min, v));
    if (tuning[k] !== next) {
      tuning[k] = next;
      changed = true;
    }
  }
  if (!changed) return;
  save();
  announce();
}

export function resetTuning(values: Partial<MotionTuning> = {}) {
  Object.assign(tuning, MOTION_DEFAULTS, values);
  save();
  announce();
}

export function tuningSnapshot(): MotionTuning {
  return { ...tuning };
}

/** True when nothing has been moved off its designed value. */
export function isDefaultTuning() {
  return (Object.keys(MOTION_DEFAULTS) as (keyof MotionTuning)[]).every(
    (k) => Math.abs(tuning[k] - MOTION_DEFAULTS[k]) < 1e-6,
  );
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tuning));
  } catch {
    /* private window, or storage disabled: the session still works */
  }
}

export function loadTuning() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<MotionTuning>;
    Object.assign(tuning, MOTION_DEFAULTS);
    for (const [k, v] of Object.entries(parsed) as [keyof MotionTuning, number][]) {
      if (k in MOTION_DEFAULTS && typeof v === "number" && Number.isFinite(v)) {
        const r = MOTION_RANGES[k];
        tuning[k] = Math.min(r.max, Math.max(r.min, v));
      }
    }
    announce();
  } catch {
    /* a corrupt entry is not worth a broken studio */
  }
}
