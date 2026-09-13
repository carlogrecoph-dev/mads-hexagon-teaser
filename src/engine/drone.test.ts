import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateDroneFlight, evaluateDrone, SHOOT_MODELS } from "./drone.ts";
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
        assert.ok(p.target.y > 1.22 && p.target.y < 1.75, `look y ${p.target.y}`);
        assert.ok(Math.hypot(p.target.x, p.target.z - HEX.tableZ) < 2.4, `look drifted ${p.target.x},${p.target.z}`);
        assert.ok(p.position.y > 1.4, `cam too low ${p.position.y}`);
        assert.ok(p.fov >= 46 && p.fov <= 68, `fov ${p.fov}`);
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
    assert.ok(travel > 5, `drone barely flew (${travel})`);
    const kinds = new Set(flight.keys.map((k) => k.kind));
    assert.ok(kinds.size >= 4, `only ${[...kinds]}`);
  });

  it("spends most of the take inside the hexagon — exterior is a short beat", () => {
    for (const seed of [3, 19, 88, 4, 11]) {
      const flight = generateDroneFlight(seed, 40);
      let inside = 0;
      let n = 0;
      for (let t = 0; t <= 40; t += 0.25) {
        const p = evaluateDrone(flight, t);
        n++;
        if (Math.hypot(p.position.x, p.position.z) <= HEX.radius + 0.28) inside++;
      }
      assert.ok(inside / n >= 0.72, `seed ${seed} inside ${inside / n}`);
    }
  });

  it("starts from named corners — seed picks the opening", () => {
    const openings = new Set<string>();
    for (let s = 1; s < 40; s++) openings.add(generateDroneFlight(s, 40).opening);
    assert.ok(openings.size >= 4, `openings ${[...openings]}`);
  });

  it("never flies through the operator — 15cm keep-out all around", () => {
    const keep = 0.22 + 0.15 - 0.02;
    for (const seed of [3, 19, 88, 6, 14, 1]) {
      const flight = generateDroneFlight(seed, 40);
      for (let t = 0; t <= 40; t += 0.2) {
        const p = evaluateDrone(flight, t).position;
        const cy = Math.min(HEX.personHeight - 0.02, Math.max(0.05, p.y));
        const d = Math.hypot(p.x, p.z - HEX.personZ, p.y - cy);
        assert.ok(d >= keep, `clip seed=${seed} t=${t} d=${d.toFixed(3)}`);
      }
    }
  });

  it("never sits behind the operator at body height — laterals, front, zenith only", () => {
    const rearZ = HEX.personZ + 0.08;
    for (const seed of [1, 3, 6, 14, 19, 88, 7, 11, 22, 33, 44, 55]) {
      const flight = generateDroneFlight(seed, 40);
      for (let t = 0; t <= 40; t += 0.15) {
        const p = evaluateDrone(flight, t).position;
        if (p.y < 2.15) {
          assert.ok(p.z >= rearZ - 0.05, `behind seed=${seed} t=${t} z=${p.z.toFixed(3)} y=${p.y.toFixed(3)}`);
        }
      }
    }
  });

  it("authored models — switching model is a real jump, not a nudge", () => {
    assert.equal(generateDroneFlight(1, 40, { model: 0 }).modelName, generateDroneFlight(1, 40, { model: 0 }).modelName);
    const a = evaluateDrone(generateDroneFlight(99, 40, { model: 0 }), 0);
    const b = evaluateDrone(generateDroneFlight(99, 40, { model: 6 }), 0);
    const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
    assert.ok(d > 1.2, `models too similar at t=0 (${d})`);
    const names = new Set(SHOOT_MODELS.map((m) => m.name));
    assert.equal(names.size, SHOOT_MODELS.length);
    assert.equal(SHOOT_MODELS.length, 64);
  });

  it("stability — no floor, no feet, no punch-in", () => {
    for (const seed of [1, 7, 19, 33, 48, 60]) {
      const flight = generateDroneFlight(seed, 40);
      for (let t = 0; t <= 40; t += 0.2) {
        const p = evaluateDrone(flight, t);
        assert.ok(p.position.y >= 1.47, `floor height seed=${seed} t=${t} y=${p.position.y}`);
        assert.ok(p.target.y >= 1.26, `looks at floor seed=${seed} t=${t} ty=${p.target.y}`);
        const dist = Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
        assert.ok(dist >= 0.62, `too tight seed=${seed} t=${t} d=${dist.toFixed(2)}`);
        const horiz = Math.max(1e-4, Math.hypot(p.target.x - p.position.x, p.target.z - p.position.z));
        const down = (p.position.y - p.target.y) / horiz;
        assert.ok(down <= 0.24, `pitched at floor seed=${seed} t=${t} down=${down.toFixed(2)}`);
        assert.ok(Math.abs(p.roll) <= 0.03, `roll ${p.roll}`);
      }
    }
  });

  it("every scene has outside, artwork details and scenography — girl is rare and lateral", () => {
    for (const m of SHOOT_MODELS) {
      const s = m.sequence;
      assert.ok(s.includes("orbit") || m.opening === "outside", `${m.name} missing exterior`);
      assert.ok(s.includes("holdMonitor") || s.includes("pushMonitor"), `${m.name} missing artwork`);
      assert.ok(s.includes("wideRoom") || s.includes("inside") || s.includes("rise"), `${m.name} missing scenography`);
      const girl = s.filter((k) => k === "sideGirl" || k === "faceClose").length;
      assert.ok(girl <= 1, `${m.name} too much girl`);
    }
    const withGirl = SHOOT_MODELS.filter((m) => m.sequence.includes("sideGirl")).length;
    assert.ok(withGirl / SHOOT_MODELS.length <= 0.12, `girl in ${withGirl}/${SHOOT_MODELS.length}`);
  });
});
