import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateTeaser, generatePlan, planFingerprint, viewportFromInteraction } from "./choreography.ts";
import { CAMERA_PRESETS, HEX } from "./config.ts";
import { DEFAULT_SETTINGS, type FocusPoint } from "./types.ts";

const foci: FocusPoint[] = [
  {
    id: "a",
    cx: 0.32,
    cy: 0.28,
    width: 0.2,
    height: 0.2,
    score: 1,
    semantic: "face",
    recommendedZoom: 2.2,
    locked: false,
    source: "auto",
  },
  {
    id: "b",
    cx: 0.7,
    cy: 0.6,
    width: 0.18,
    height: 0.18,
    score: 0.8,
    semantic: "color",
    recommendedZoom: 1.8,
    locked: false,
    source: "auto",
  },
  {
    id: "c",
    cx: 0.5,
    cy: 0.5,
    width: 0.25,
    height: 0.25,
    score: 0.5,
    semantic: "composition",
    recommendedZoom: 1.6,
    locked: false,
    source: "auto",
  },
];

describe("choreography determinism", () => {
  it("same seed yields the same plan", () => {
    const a = generatePlan({ seed: 123456, focusPoints: foci, settings: DEFAULT_SETTINGS });
    const b = generatePlan({ seed: 123456, focusPoints: foci, settings: DEFAULT_SETTINGS });
    assert.equal(planFingerprint(a), planFingerprint(b));
  });

  it("different seeds can vary order or timing", () => {
    const a = generatePlan({ seed: 1, focusPoints: foci, settings: DEFAULT_SETTINGS });
    const b = generatePlan({ seed: 99, focusPoints: foci, settings: DEFAULT_SETTINGS });
    assert.notEqual(planFingerprint(a), planFingerprint(b));
  });

  it("uses all three cameras once and stays in 38–42s", () => {
    for (let s = 1; s < 20; s++) {
      const plan = generatePlan({ seed: s * 17, focusPoints: foci, settings: DEFAULT_SETTINGS });
      assert.ok(plan.duration >= 38 - 1e-6 && plan.duration <= 42 + 1e-6);
      assert.equal(plan.order.length, 3);
      const cams = new Set(plan.order);
      assert.equal(cams.size, 3);
      for (const id of ["top", "right", "left"] as const) {
        assert.equal(plan.order.filter((c) => c === id).length, 1, `${id} should appear once`);
      }
      assert.ok(plan.segments.length >= 12);
      const last = plan.segments[plan.segments.length - 1]!;
      assert.ok(Math.abs(last.t1 - plan.duration) < 1e-6);
    }
  });

  it("evaluate is deterministic and returns to near-full frame", () => {
    const plan = generatePlan({ seed: 7, focusPoints: foci, settings: DEFAULT_SETTINGS });
    const a = evaluateTeaser(plan, 3.2, DEFAULT_SETTINGS);
    const b = evaluateTeaser(plan, 3.2, DEFAULT_SETTINGS);
    assert.deepEqual(a.viewport, b.viewport);
    assert.equal(a.cameraId, b.cameraId);
    let maxZ = 0;
    for (let t = 0; t < plan.duration; t += 0.4) {
      maxZ = Math.max(maxZ, evaluateTeaser(plan, t, DEFAULT_SETTINGS).viewport.zoom);
    }
    assert.ok(maxZ > 1.8, `expected punch-in, got ${maxZ}`);
    const end = evaluateTeaser(plan, plan.duration, DEFAULT_SETTINGS);
    assert.ok(end.viewport.zoom < 1.35);
    assert.ok(Math.abs(end.viewport.cx - 0.5) < 0.2);
    assert.ok(Math.abs(end.viewport.cy - 0.5) < 0.2);
  });

  it("keeps GoPro cameras behind the operator, looking at the table", () => {
    assert.ok(CAMERA_PRESETS.right.position.x > 0.8);
    assert.ok(CAMERA_PRESETS.left.position.x < -0.8);
    assert.ok(CAMERA_PRESETS.right.position.z < HEX.personZ + 0.05);
    assert.ok(CAMERA_PRESETS.left.position.z < HEX.personZ + 0.05);
    assert.ok(CAMERA_PRESETS.top.position.y > 3);
    assert.ok(CAMERA_PRESETS.right.fov > 70);
  });

  it("each punch-in is a two-hand spread then a pan at that zoom", () => {
    const plan = generatePlan({ seed: 12, focusPoints: foci, settings: DEFAULT_SETTINGS });
    const holds = plan.segments.filter((s) => s.kind === "hold");
    let pairs = 0;
    let fake = 0;
    let resets = 0;
    for (let i = 0; i < holds.length - 1; i++) {
      const a = holds[i]!;
      if (a.kind !== "hold" || a.gesture !== "SPREAD" || !a.focusId) continue;
      const start = evaluateTeaser(plan, a.t0 + 0.04, DEFAULT_SETTINGS);
      const end = evaluateTeaser(plan, a.t1 - 0.04, DEFAULT_SETTINGS);
      const gained = end.viewport.zoom - start.viewport.zoom;
      if (gained < 0.08) fake++;
      const next = holds.slice(i + 1, i + 8).find(
        (s) => s.kind === "hold" && (s.gesture.startsWith("PAN") || s.gesture === "HOLD" || s.gesture === "SPREAD" || s.gesture === "PINCH"),
      );
      if (next) pairs++;
    }
    for (const s of holds) {
      if (s.kind === "hold" && s.gesture === "PINCH") {
        const a = evaluateTeaser(plan, s.t0 + 0.05, DEFAULT_SETTINGS);
        const b = evaluateTeaser(plan, s.t1 - 0.05, DEFAULT_SETTINGS);
        if (b.viewport.zoom < a.viewport.zoom - 0.15 && b.viewport.zoom < 1.35) resets++;
      }
    }
    assert.equal(fake, 0, "no spread at the zoom ceiling");
    assert.ok(pairs >= 2, `spread then pan/hold ${pairs}`);
    assert.ok(resets >= 2, `full-frame reset after zoom ${resets}`);
    const end = evaluateTeaser(plan, plan.duration, DEFAULT_SETTINGS);
    assert.ok(end.viewport.zoom < 1.35, "expected a return to the full artwork");
  });

  it("visits every manual point in placement order", () => {
    const manual: FocusPoint[] = [
      { id: "m1", cx: 0.2, cy: 0.2, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 2.4, locked: true, source: "manual" },
      { id: "m2", cx: 0.8, cy: 0.25, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 3.1, locked: true, source: "manual" },
      { id: "m3", cx: 0.55, cy: 0.7, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 2.0, locked: true, source: "manual" },
      { id: "m4", cx: 0.3, cy: 0.8, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 3.6, locked: true, source: "manual" },
      { id: "m5", cx: 0.72, cy: 0.55, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 2.8, locked: true, source: "manual" },
      { id: "m6", cx: 0.15, cy: 0.5, width: 0.1, height: 0.1, score: 1, semantic: "manual", recommendedZoom: 2.2, locked: true, source: "manual" },
    ];
    const plan = generatePlan({ seed: 42, focusPoints: [...foci, ...manual], settings: DEFAULT_SETTINGS });
    assert.deepEqual(plan.focusIds, ["m1", "m2", "m3", "m4", "m5", "m6"]);
    for (const id of plan.focusIds) {
      const hit = plan.segments.some((s) => s.kind === "hold" && s.focusId === id);
      assert.ok(hit, `missing visit to ${id}`);
    }
    // the order on the map is the order on screen
    const visited = plan.segments
      .filter((s): s is Extract<typeof s, { kind: "hold" }> => s.kind === "hold" && !!s.focusId)
      .map((s) => s.focusId!);
    const firstSeen: string[] = [];
    for (const id of visited) if (!firstSeen.includes(id)) firstSeen.push(id);
    assert.deepEqual(firstSeen, ["m1", "m2", "m3", "m4", "m5", "m6"]);
    // the clip grows so six details still have room to be read
    assert.ok(plan.duration > 45, `six points need a longer clip, got ${plan.duration}`);
  });

  it("honours the zoom set by hand on the slider", () => {
    const deep: FocusPoint[] = [
      { id: "d1", cx: 0.4, cy: 0.35, width: 0.08, height: 0.08, score: 1, semantic: "manual", recommendedZoom: 4.3, locked: true, source: "manual" },
    ];
    const plan = generatePlan({ seed: 3, focusPoints: deep, settings: DEFAULT_SETTINGS });
    let peak = 0;
    for (let t = 0; t < plan.duration; t += 0.1) {
      peak = Math.max(peak, evaluateTeaser(plan, t, DEFAULT_SETTINGS).viewport.zoom);
    }
    assert.ok(peak > 4, `slider said 4.3, teaser reached ${peak}`);
  });

  it("on a vertical portrait, frames the eyes instead of clamping to the nose", () => {
    const portrait: FocusPoint[] = [
      { id: "reye", cx: 0.38, cy: 0.27, width: 0.1, height: 0.07, score: 1, semantic: "manual", recommendedZoom: 3.1, locked: true, source: "manual" },
      { id: "leye", cx: 0.62, cy: 0.27, width: 0.1, height: 0.07, score: 1, semantic: "manual", recommendedZoom: 3.1, locked: true, source: "manual" },
      { id: "nose", cx: 0.5, cy: 0.42, width: 0.1, height: 0.08, score: 1, semantic: "manual", recommendedZoom: 2.8, locked: true, source: "manual" },
      { id: "mouth", cx: 0.5, cy: 0.55, width: 0.12, height: 0.08, score: 1, semantic: "manual", recommendedZoom: 2.7, locked: true, source: "manual" },
    ];
    const plan = generatePlan({
      seed: 5,
      focusPoints: portrait,
      settings: DEFAULT_SETTINGS,
      artWidth: 1080,
      artHeight: 1920,
    });
    assert.ok(plan.focusIds.some((id) => id.includes("reye") || id.startsWith("pair-")));
    let minEyeCy = 1;
    let sawEye = false;
    for (let t = 0; t < plan.duration; t += 0.2) {
      const s = evaluateTeaser(plan, t, DEFAULT_SETTINGS);
      if (s.viewport.cy < 0.34 && s.viewport.zoom > 1.6) {
        sawEye = true;
        minEyeCy = Math.min(minEyeCy, s.viewport.cy);
      }
    }
    assert.ok(sawEye, "expected a punch-in on the eye line");
    assert.ok(minEyeCy < 0.32, `eye cy stuck at ${minEyeCy}`);
  });
});

describe("gesture coupling", () => {
  it("spread increases zoom; hands right follow the image right", () => {
    const rest = viewportFromInteraction(
      { spread: 0, panX: 0, panY: 0, point: 0, gesture: "HOLD" },
      DEFAULT_SETTINGS,
    );
    const zoomed = viewportFromInteraction(
      { spread: 1, panX: 0, panY: 0, point: 0, gesture: "SPREAD" },
      DEFAULT_SETTINGS,
    );
    assert.ok(zoomed.zoom > rest.zoom);
    assert.ok(zoomed.zoom > 2.4);
    const leftHands = viewportFromInteraction(
      { spread: 0.6, panX: -1, panY: 0, point: 0, gesture: "PAN_LEFT" },
      DEFAULT_SETTINGS,
    );
    const rightHands = viewportFromInteraction(
      { spread: 0.6, panX: 1, panY: 0, point: 0, gesture: "PAN_RIGHT" },
      DEFAULT_SETTINGS,
    );
    assert.ok(rightHands.cx < leftHands.cx);
  });

  it("artwork zoom follows hand spread — same speed, not a separate race", () => {
    const plan = generatePlan({ seed: 8, focusPoints: foci, settings: DEFAULT_SETTINGS });
    let ok = 0;
    let n = 0;
    for (const seg of plan.segments) {
      if (seg.kind !== "hold" || seg.gesture !== "SPREAD") continue;
      const a = evaluateTeaser(plan, seg.t0 + 0.02, DEFAULT_SETTINGS);
      const b = evaluateTeaser(plan, (seg.t0 + seg.t1) / 2, DEFAULT_SETTINGS);
      const ds = b.interaction.spread - a.interaction.spread;
      const dz = b.viewport.zoom - a.viewport.zoom;
      if (Math.abs(ds) < 0.03) continue;
      n++;
      if (Math.sign(ds) === Math.sign(dz) || Math.abs(dz) < 0.02) ok++;
    }
    assert.ok(n > 1);
    assert.ok(ok / n > 0.85, `zoom vs spread ${ok}/${n}`);
  });

  it("artwork never freezes — micro wander while analyzing", () => {
    const plan = generatePlan({ seed: 21, focusPoints: foci, settings: DEFAULT_SETTINGS });
    let moved = 0;
    let samples = 0;
    for (let t = 2; t < plan.duration - 3; t += 1.1) {
      const a = evaluateTeaser(plan, t, DEFAULT_SETTINGS);
      const b = evaluateTeaser(plan, t + 0.7, DEFAULT_SETTINGS);
      if ((a.interaction.glance ?? 0) > 0.7) continue;
      if (a.interaction.gesture === "HOLD") continue;
      samples++;
      const d =
        Math.hypot(a.viewport.cx - b.viewport.cx, a.viewport.cy - b.viewport.cy) +
        Math.abs(a.viewport.zoom - b.viewport.zoom) * 0.15;
      if (d > 0.004) moved++;
    }
    assert.ok(samples > 4);
    assert.ok(moved / samples > 0.55, `still frames ${samples - moved}/${samples}`);
  });

  it("hands sit on the artwork coordinate they are driving", () => {
    const plan = generatePlan({ seed: 11, focusPoints: foci, settings: DEFAULT_SETTINGS });
    let coupled = 0;
    let samples = 0;
    for (let t = 0.4; t < plan.duration - 0.4; t += 0.25) {
      const s = evaluateTeaser(plan, t, DEFAULT_SETTINGS);
      if ((s.interaction.glance ?? 0) > 0.55) continue;
      if (s.interaction.gesture.startsWith("PAN")) continue;
      samples++;
      const mid = (s.hands.left.x + s.hands.right.x) * 0.5;
      const g = (s.interaction.targetCx ?? 0.5) - 0.5;
      if (Math.sign(mid) !== Math.sign(g) || Math.abs(g) < 0.08) coupled++;
    }
    assert.ok(samples > 8);
    assert.ok(coupled / samples > 0.55, `coupling ${coupled}/${samples}`);
  });
});
