import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateDroneFlight, evaluateDrone } from "./drone.ts";
import { HEX } from "./config.ts";

describe("drone flight", () => {
  it("same seed, same path — export can skip around in time", () => {
    const a = generateDroneFlight(42, 40);
    const b = generateDroneFlight(42, 40);
    assert.equal(a.keys.length, b.keys.length);
    const p = evaluateDrone(a, 11.3);
    const q = evaluateDrone(b, 11.3);
    assert.deepEqual(p, q);
  });

  it("nearby seeds do not start in the same corner", () => {
    const a = evaluateDrone(generateDroneFlight(12, 40), 0);
    const b = evaluateDrone(generateDroneFlight(13, 40), 0);
    const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
    assert.ok(d > 0.4, `starts too similar (${d})`);
  });

  it("always frames the 55\" — look-at stays near the table", () => {
    for (const seed of [3, 19, 88]) {
      const flight = generateDroneFlight(seed, 40);
      for (let t = 0; t <= 40; t += 0.5) {
        const p = evaluateDrone(flight, t);
        assert.ok(p.target.y > 0.35 && p.target.y < 2.2, `look y ${p.target.y}`);
        assert.ok(Math.hypot(p.target.x, p.target.z - HEX.tableZ) < 2.4, `look drifted ${p.target.x},${p.target.z}`);
        assert.ok(p.position.y > 0.6);
        assert.ok(Number.isFinite(p.fov));
      }
    }
  });

  it("moves — pan / tilt / push, not a locked tripod", () => {
    const flight = generateDroneFlight(7, 40);
    let travel = 0;
    let prev = evaluateDrone(flight, 0);
    for (let t = 0.4; t <= 40; t += 0.4) {
      const p = evaluateDrone(flight, t);
      travel += Math.hypot(p.position.x - prev.position.x, p.position.y - prev.position.y, p.position.z - prev.position.z);
      prev = p;
    }
    assert.ok(travel > 8, `drone barely flew (${travel})`);
    const kinds = new Set(flight.keys.map((k) => k.kind));
    assert.ok(kinds.size >= 4, `only ${[...kinds]}`);
  });

  it("starts from named corners — seed picks the opening", () => {
    const openings = new Set<string>();
    for (let s = 1; s < 40; s++) openings.add(generateDroneFlight(s, 40).opening);
    assert.ok(openings.size >= 4, `openings ${[...openings]}`);
  });

  it("twenty authored models — switching model is a real jump, not a nudge", () => {
    assert.equal(generateDroneFlight(1, 40, { model: 0 }).modelName, generateDroneFlight(1, 40, { model: 0 }).modelName);
    const a = evaluateDrone(generateDroneFlight(99, 40, { model: 0 }), 0);
    const b = evaluateDrone(generateDroneFlight(99, 40, { model: 6 }), 0);
    const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
    assert.ok(d > 1.2, `models too similar at t=0 (${d})`);
    const names = new Set(Array.from({ length: 20 }, (_, i) => generateDroneFlight(1, 40, { model: i }).modelName));
    assert.equal(names.size, 20);
  });
});
