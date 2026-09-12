import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampViewport, computeBlit, containSize, createRng, hashSeed } from "./math.ts";

describe("computeBlit contain-fit", () => {
  it("pillarboxes square art on 16:9", () => {
    const b = computeBlit(1000, 1000, 1600, 900, { cx: 0.5, cy: 0.5, zoom: 1 });
    assert.equal(b.dh, 900);
    assert.equal(b.dw, 900);
    assert.equal(b.dx, 350);
    assert.equal(b.dy, 0);
    assert.equal(b.sw, 1000);
    assert.equal(b.sh, 1000);
  });

  it("letterboxes landscape art that is wider than 16:9", () => {
    const b = computeBlit(3000, 1000, 1600, 900, { cx: 0.5, cy: 0.5, zoom: 1 });
    assert.equal(b.dw, 1600);
    assert.ok(b.dh < 900);
    assert.equal(b.dx, 0);
  });

  it("fills matching 16:9 artwork", () => {
    const b = computeBlit(1920, 1080, 1600, 900, { cx: 0.5, cy: 0.5, zoom: 1 });
    assert.equal(b.dw, 1600);
    assert.equal(b.dh, 900);
    assert.equal(b.dx, 0);
    assert.equal(b.dy, 0);
  });

  it("zooms into a focus without stretching and opens toward cover", () => {
    const full = computeBlit(1000, 1000, 1600, 900, { cx: 0.5, cy: 0.5, zoom: 1 });
    const z = computeBlit(1000, 1000, 1600, 900, { cx: 0.3, cy: 0.4, zoom: 2 });
    assert.ok(z.dw > full.dw);
    assert.ok(Math.abs(z.dw / z.dh - z.sw / z.sh) < 0.02);
    assert.ok(z.sw < 1000);
    assert.ok(z.sh < 1000);
    assert.ok(z.sx >= 0);
    assert.ok(z.sy >= 0);
  });

  it("covers the 16:9 panel at high zoom", () => {
    const z = computeBlit(1000, 1000, 1600, 900, { cx: 0.5, cy: 0.5, zoom: 2.5 });
    assert.ok(z.dx <= 1);
    assert.ok(z.dy <= 1);
    assert.ok(z.dw >= 1590);
    assert.ok(z.dh >= 890);
  });

  it("portrait crop can reach the eyes (top), not stuck on the nose", () => {
    const artW = 1080;
    const artH = 1920;
    const eye = { cx: 0.38, cy: 0.28, zoom: 2.6 };
    const b = computeBlit(artW, artH, 1600, 900, eye);
    const eyeY = eye.cy * artH;
    assert.ok(b.sy < eyeY, `crop top ${b.sy} should be above the eye ${eyeY}`);
    assert.ok(b.sy + b.sh > eyeY, `crop bottom should include the eye`);
    const v = clampViewport(eye, artW, artH);
    assert.ok(v.cy < 0.35, `clamped cy ${v.cy} must stay in the upper third`);
    assert.ok(Math.abs(v.cy - 0.28) < 0.04);
  });
});

describe("clampViewport", () => {
  it("keeps zoom-1 centered", () => {
    const v = clampViewport({ cx: 0.1, cy: 0.9, zoom: 1 });
    assert.equal(v.zoom, 1);
    assert.equal(v.cx, 0.5);
    assert.equal(v.cy, 0.5);
  });
});

describe("containSize", () => {
  it("returns full width for landscape", () => {
    const s = containSize(16, 9, 16 / 9);
    assert.ok(Math.abs(s.w - 1) < 1e-6);
    assert.ok(Math.abs(s.h - 1) < 1e-6);
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    const c = createRng(43);
    assert.notEqual(c(), seqA[0]);
  });

  it("hashes stably", () => {
    assert.equal(hashSeed(12, 3), hashSeed(12, 3));
    assert.notEqual(hashSeed(12, 3), hashSeed(12, 4));
  });
});
