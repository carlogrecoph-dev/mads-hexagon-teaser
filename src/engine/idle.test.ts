import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distractionAt, idlePose, operatorFromSeed } from "./idle.ts";

function sample(over: Partial<Parameters<typeof idlePose>[0]> = {}) {
  return idlePose({ time: 0, seed: 42, busy: 0, glance: 0, amount: 1, ...over });
}

describe("she is alive, and it is reproducible", () => {
  it("is a pure function of time and seed — an export can render frames out of order", () => {
    for (const t of [0.4, 7.9, 23.1, 40]) {
      const a = idlePose({ time: t, seed: 3, busy: 0.2, glance: 0, amount: 1 });
      const b = idlePose({ time: t, seed: 3, busy: 0.2, glance: 0, amount: 1 });
      assert.deepEqual(a, b);
    }
  });

  it("blinks — often enough to read as alive, rarely enough not to flutter", () => {
    let shut = 0;
    let peaks = 0;
    let was = 0;
    const span = 60;
    for (let t = 0; t < span; t += 1 / 30) {
      const { blink } = sample({ time: t });
      if (blink > 0.6) shut++;
      if (blink > 0.6 && was <= 0.6) peaks++;
      was = blink;
    }
    assert.ok(peaks >= 8, `only ${peaks} blinks in ${span}s`);
    assert.ok(peaks <= 40, `${peaks} blinks in ${span}s is a twitch`);
    assert.ok(shut / (span * 30) < 0.12, "eyes shut too much of the time");
  });

  it("looks away now and then, and comes back", () => {
    let away = 0;
    let samples = 0;
    let maxYaw = 0;
    for (let t = 0; t < 90; t += 1 / 12) {
      const p = sample({ time: t });
      samples++;
      if (p.away > 0.4) away++;
      maxYaw = Math.max(maxYaw, Math.abs(p.yaw));
    }
    assert.ok(away > 0, "she never looks up from the glass");
    assert.ok(away / samples < 0.4, "she is never looking at the work");
    assert.ok(maxYaw > 0.2, `head barely turns (${maxYaw} rad)`);
  });

  it("shifts her weight instead of standing frozen", () => {
    let min = 1;
    let max = -1;
    for (let t = 0; t < 90; t += 0.25) {
      const w = sample({ time: t }).weight;
      min = Math.min(min, w);
      max = Math.max(max, w);
    }
    assert.ok(max - min > 0.4, `weight range only ${max - min}`);
    assert.ok(Math.abs(max) <= 1 && Math.abs(min) <= 1);
  });

  it("goes quiet while her hands are working the glass", () => {
    let busyMotion = 0;
    let freeMotion = 0;
    for (let t = 0; t < 120; t += 0.2) {
      busyMotion += Math.abs(sample({ time: t, busy: 1 }).yaw) + sample({ time: t, busy: 1 }).stretch;
      freeMotion += Math.abs(sample({ time: t, busy: 0 }).yaw) + sample({ time: t, busy: 0 }).stretch;
    }
    assert.ok(busyMotion < freeMotion * 0.4, `busy ${busyMotion} vs free ${freeMotion}`);
  });

  it("can be turned off completely", () => {
    for (let t = 0; t < 30; t += 0.5) {
      const p = sample({ time: t, amount: 0 });
      assert.equal(Math.abs(p.yaw), 0);
      assert.equal(Math.abs(p.blink), 0);
      assert.equal(Math.abs(p.weight), 0);
    }
  });

  it("drops attention at irregular moments — same seed, same lapse", () => {
    let hits = 0;
    let samples = 0;
    for (let t = 0; t < 80; t += 1 / 12) {
      const a = distractionAt(t, 11);
      const b = distractionAt(t, 11);
      assert.deepEqual(a, b);
      samples++;
      if (a.glance > 0.4 || a.stretch > 0.4) hits++;
    }
    assert.ok(hits > 4, `never distracted (${hits})`);
    assert.ok(hits / samples < 0.32, `distracted too often ${hits}/${samples}`);
  });

  it("unpacks the seed into a person — nearby seeds are not nearby people", () => {
    const a = operatorFromSeed(12);
    const b = operatorFromSeed(12);
    const c = operatorFromSeed(13);
    assert.deepEqual(a, b);
    assert.notEqual(a.sideBias, c.sideBias);
    assert.ok(Math.abs(a.lookPeriod - c.lookPeriod) > 0.05 || Math.abs(a.curiosity - c.curiosity) > 0.05);
    assert.ok(a.firstLapse >= 2.5 && a.firstLapse <= 7.3);
    assert.ok(a.glanceHold >= 1.4 && a.glanceHold <= 2.4);
  });
});