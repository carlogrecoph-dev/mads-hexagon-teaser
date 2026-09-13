import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEX } from "./config.ts";
import {
  artPointToUv,
  glassNormalWorld,
  glassUvToWorld,
  PALM_CLEAR,
  projectToGlass,
  wristOnUv,
} from "./glass.ts";

describe("55\" glass map matches TableMonitor", () => {
  it("top of the screen is farther and higher than the bottom", () => {
    const top = glassUvToWorld(0.5, 0, 0);
    const bot = glassUvToWorld(0.5, 1, 0);
    assert.ok(top.y > bot.y + 0.08, `top y ${top.y} bot ${bot.y}`);
    assert.ok(top.z > bot.z + 0.08, `top z ${top.z} bot ${bot.z}`);
  });

  it("canvas right maps to world −X after Rz(π)", () => {
    const L = glassUvToWorld(0, 0.5, 0);
    const R = glassUvToWorld(1, 0.5, 0);
    assert.ok(L.x > R.x + 0.4, `left ${L.x} right ${R.x}`);
  });

  it("projectToGlass never goes behind the front face", () => {
    const n = glassNormalWorld();
    const face = glassUvToWorld(0.5, 0.5, 0);
    const punched = projectToGlass(face.x - n.x * 0.2, face.y - n.y * 0.2, face.z - n.z * 0.2, PALM_CLEAR);
    const d =
      (punched.x - face.x) * n.x + (punched.y - face.y) * n.y + (punched.z - face.z) * n.z;
    assert.ok(d > PALM_CLEAR - 0.008, `still inside glass, along=${d}`);
  });

  it("wrist sits on the outward side of the glass", () => {
    const n = glassNormalWorld();
    const face = glassUvToWorld(0.4, 0.45, 0);
    const w = wristOnUv(0.4, 0.45);
    const d = (w.x - face.x) * n.x + (w.y - face.y) * n.y + (w.z - face.z) * n.z;
    assert.ok(d > 0.05, `wrist along ${d}`);
  });

  it("artwork point UV tracks the portrait eyes", () => {
    const eye = artPointToUv(0.38, 0.28, 1.05, 1080, 1920);
    const mouth = artPointToUv(0.5, 0.62, 1.05, 1080, 1920);
    assert.ok(eye.v < mouth.v, `eye v ${eye.v} mouth ${mouth.v}`);
  });

  it("center of the 55\" sits at the table pivot", () => {
    const c = glassUvToWorld(0.5, 0.5, 0);
    assert.ok(Math.abs(c.x) < 0.04);
    assert.ok(Math.abs(c.z - HEX.tableZ) < 0.08);
    assert.ok(Math.abs(c.y - HEX.tableHeight) < 0.08);
  });
});
