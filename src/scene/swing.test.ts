import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createSwing, resetSwing, stepSwing, type SwingOpts } from "./swing.ts";

const HAIR: SwingOpts = { stiffness: 46, damping: 7.5, inertia: 0.22, limit: 0.5 };
const DOWN = new THREE.Vector3(0, -1, 0);

function run(path: (t: number) => THREE.Vector3, seconds: number, dt = 1 / 60) {
  const swing = createSwing();
  resetSwing(swing, path(0));
  const angles: number[] = [];
  for (let i = 1; i * dt <= seconds; i++) {
    const dir = stepSwing(swing, path(i * dt), dt, HAIR);
    angles.push(dir.angleTo(DOWN));
  }
  return { swing, angles };
}

test("hanging still, it hangs still", () => {
  const { angles } = run(() => new THREE.Vector3(0, 1.6, 0), 2);
  assert.ok(Math.max(...angles) < 1e-6, "nothing should move when nothing moves");
});

test("a head turn whips it, and the whip dies out", () => {
  // half a second of sideways travel, then stop dead
  const { angles } = run((t) => new THREE.Vector3(t < 0.5 ? t * 0.6 : 0.3, 1.6, 0), 4);
  const during = Math.max(...angles.slice(0, 40));
  const after = Math.max(...angles.slice(-40));
  assert.ok(during > 0.01, `it should swing while she moves (got ${during})`);
  assert.ok(after < during * 0.2, `and settle once she stops (${after} vs ${during})`);
});

test("it never swings further than its limit", () => {
  // a violent shake: the model must stay hair, not become a flail
  const { angles } = run((t) => new THREE.Vector3(Math.sin(t * 34) * 0.5, 1.6, 0), 4);
  assert.ok(Math.max(...angles) <= HAIR.limit + 1e-6);
});

test("it is deterministic, and stable at any frame rate", () => {
  const path = (t: number) => new THREE.Vector3(Math.sin(t * 5) * 0.2, 1.6, Math.cos(t * 3) * 0.1);
  const a = run(path, 3, 1 / 60).angles;
  const b = run(path, 3, 1 / 60).angles;
  assert.deepEqual(a, b);
  for (const dt of [1 / 120, 1 / 30, 1 / 12]) {
    const { angles } = run(path, 3, dt);
    assert.ok(
      angles.every((x) => Number.isFinite(x) && x <= HAIR.limit + 1e-6),
      `a spring this stiff must not blow up at ${Math.round(1 / dt)} fps`,
    );
  }
});

test("a seek re-seats it instead of catching up through the gap", () => {
  const swing = createSwing();
  resetSwing(swing, new THREE.Vector3(0, 1.6, 0));
  for (let i = 0; i < 30; i++) stepSwing(swing, new THREE.Vector3(i * 0.02, 1.6, 0), 1 / 60, HAIR);
  assert.ok(swing.dir.angleTo(DOWN) > 1e-4);
  stepSwing(swing, new THREE.Vector3(3, 1.6, 0), 1 / 60, HAIR, true);
  assert.ok(swing.dir.angleTo(DOWN) < 1e-9, "after a jump in time it starts from rest");
});
