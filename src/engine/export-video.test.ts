import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportSize, normalizeQuality } from "./export-size.ts";

describe("social MP4 sizes", () => {
  it("2K master is QHD, even, 30 fps", () => {
    const v = exportSize("9:16", "2k");
    assert.equal(v.w, 1440);
    assert.equal(v.h, 2560);
    assert.equal(v.fps, 30);
    const h = exportSize("16:9", "2k");
    assert.equal(h.w, 2560);
    assert.equal(h.h, 1440);
  });

  it("1080p social inverts with the format", () => {
    const v = exportSize("9:16", "hd");
    assert.equal(v.w, 1080);
    assert.equal(v.h, 1920);
    const h = exportSize("16:9", "hd");
    assert.equal(h.w, 1920);
    assert.equal(h.h, 1080);
    assert.equal(v.w % 2, 0);
    assert.equal(h.h % 2, 0);
  });

  it("legacy hd maps to 1080p, default 2k", () => {
    assert.equal(normalizeQuality("hd"), "hd");
    assert.equal(normalizeQuality("2k"), "2k");
    assert.equal(normalizeQuality(undefined), "hd");
  });
});
