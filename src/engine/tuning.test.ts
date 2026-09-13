import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOTION_DEFAULTS,
  MOTION_GROUPS,
  MOTION_PRESETS,
  MOTION_RANGES,
  isDefaultTuning,
  onTuningChange,
  resetTuning,
  setTuning,
  tuning,
  tuningSnapshot,
  type MotionTuning,
} from "./tuning.ts";

const KEYS = Object.keys(MOTION_DEFAULTS) as (keyof MotionTuning)[];

test("every dial has a range, a label and a group that exists", () => {
  for (const k of KEYS) {
    const r = MOTION_RANGES[k];
    assert.ok(r, `${k} has no range`);
    assert.ok(r.min < r.max, `${k} range is inverted`);
    assert.ok(r.label.length > 2, `${k} has no label`);
    assert.ok((MOTION_GROUPS as readonly string[]).includes(r.group), `${k} is in an unknown group`);
    assert.ok(
      MOTION_DEFAULTS[k] >= r.min && MOTION_DEFAULTS[k] <= r.max,
      `${k} default sits outside its own range`,
    );
  }
});

test("every group has at least one dial in it", () => {
  for (const g of MOTION_GROUPS) {
    assert.ok(KEYS.some((k) => MOTION_RANGES[k].group === g), `${g} is empty`);
  }
});

test("presets only name real dials, with values in range", () => {
  for (const p of MOTION_PRESETS) {
    for (const [k, v] of Object.entries(p.values) as [keyof MotionTuning, number][]) {
      assert.ok(KEYS.includes(k), `preset ${p.id} sets unknown dial ${k}`);
      const r = MOTION_RANGES[k];
      assert.ok(v >= r.min && v <= r.max, `preset ${p.id}: ${k}=${v} is out of range`);
    }
  }
  assert.equal(MOTION_PRESETS[0]!.id, "default");
  assert.equal(Object.keys(MOTION_PRESETS[0]!.values).length, 0, "the default preset is the defaults");
});

test("values are clamped, never trusted", () => {
  resetTuning();
  setTuning({ tempo: 99 });
  assert.equal(tuning.tempo, MOTION_RANGES.tempo.max);
  setTuning({ tempo: -99 });
  assert.equal(tuning.tempo, MOTION_RANGES.tempo.min);
  setTuning({ tempo: Number.NaN });
  assert.equal(tuning.tempo, MOTION_RANGES.tempo.min, "NaN must not poison the rig");
  resetTuning();
});

test("reset puts everything back, and says so", () => {
  setTuning({ liveliness: 0.2, torsoTurn: 1.8 });
  assert.equal(isDefaultTuning(), false);
  resetTuning();
  assert.equal(isDefaultTuning(), true);
  assert.deepEqual(tuningSnapshot(), MOTION_DEFAULTS);
});

test("a preset is a patch: what it does not name goes back to default", () => {
  setTuning({ hairInertia: 2.4 });
  const felina = MOTION_PRESETS.find((p) => p.id === "felina")!;
  resetTuning(felina.values);
  for (const k of KEYS) {
    const want = felina.values[k] ?? MOTION_DEFAULTS[k];
    assert.equal(tuning[k], want, `${k} after applying a preset`);
  }
  resetTuning();
});

test("the panel is told when anything moves, and only then", () => {
  resetTuning();
  let calls = 0;
  const off = onTuningChange(() => {
    calls++;
  });
  setTuning({ tempo: 1.2 });
  assert.equal(calls, 1);
  setTuning({ tempo: 1.2 });
  assert.equal(calls, 1, "writing the same value is not a change");
  resetTuning();
  assert.equal(calls, 2);
  off();
  setTuning({ tempo: 0.8 });
  assert.equal(calls, 2, "unsubscribing works");
  resetTuning();
});

test("the snapshot is a copy, not the live object", () => {
  const snap = tuningSnapshot();
  setTuning({ tempo: 1.35 });
  assert.equal(snap.tempo, MOTION_DEFAULTS.tempo);
  resetTuning();
});
