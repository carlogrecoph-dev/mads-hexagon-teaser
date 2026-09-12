import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEX } from "./config.ts";
import { handsFromInteraction, handSeparation, tableY } from "./hands.ts";
import { DEFAULT_SETTINGS, type InteractionState } from "./types.ts";

const rest: InteractionState = { spread: 0, panX: 0, panY: 0, point: 0, gesture: "HOLD" };

function at(partial: Partial<InteractionState>): InteractionState {
  return { ...rest, ...partial };
}

describe("hands on the table glass", () => {
  it("glass rises away from the operator", () => {
    const near = HEX.tableZ - 0.2;
    const far = HEX.tableZ + 0.2;
    assert.ok(tableY(far) > tableY(near) + 0.04);
  });

  it("rests both palms on the 55\" plane", () => {
    const h = handsFromInteraction(rest, DEFAULT_SETTINGS);
    const ny = Math.cos(HEX.tableTilt);
    for (const side of [h.left, h.right] as const) {
      const along = side.y - tableY(side.z);
      assert.ok(Math.abs(along - ny * 0.05) < 0.006, `palm height ${along}`);
      assert.ok(Math.abs(side.x) < HEX.screen55.width / 2);
    }
    const gap = handSeparation(h);
    assert.ok(gap > 0.08 && gap < 0.24, `rest gap ${gap}`);
  });

  it("spread opens the pair; pinch (spread 0) closes it — no teleport from the label", () => {
    const open = handsFromInteraction(at({ spread: 1, gesture: "SPREAD" }), DEFAULT_SETTINGS);
    const closed = handsFromInteraction(at({ spread: 0, gesture: "PINCH" }), DEFAULT_SETTINGS);
    const labeledSpread = handsFromInteraction(at({ spread: 1, gesture: "PINCH" }), DEFAULT_SETTINGS);
    assert.ok(handSeparation(open) > handSeparation(closed) + 0.12);
    assert.ok(Math.abs(handSeparation(open) - handSeparation(labeledSpread)) < 0.22);
  });

  it("go-to-point: hands sit on the same zone of the glass as the artwork", () => {
    const left = handsFromInteraction(
      at({ spread: 0.12, targetCx: 0.2, targetCy: 0.5, targetZoom: 1.08, gesture: "SPREAD" }),
      DEFAULT_SETTINGS,
      1920,
      1080,
    );
    const right = handsFromInteraction(
      at({ spread: 0.12, targetCx: 0.8, targetCy: 0.5, targetZoom: 1.08, gesture: "SPREAD" }),
      DEFAULT_SETTINGS,
      1920,
      1080,
    );
    const midL = (left.left.x + left.right.x) * 0.5;
    const midR = (right.left.x + right.right.x) * 0.5;
    assert.ok(midR < midL, `right of the art must sit on the flipped glass (got ${midR} vs ${midL})`);
  });

  it("pan slides both hands together left/right and up/down", () => {
    const L = handsFromInteraction(at({ spread: 0.2, panX: -1, lead: -1, gesture: "PAN_LEFT" }), DEFAULT_SETTINGS);
    const R = handsFromInteraction(at({ spread: 0.2, panX: 1, lead: 1, gesture: "PAN_RIGHT" }), DEFAULT_SETTINGS);
    const U = handsFromInteraction(at({ spread: 0.2, panY: 1, lead: 1, gesture: "PAN_UP" }), DEFAULT_SETTINGS);
    const D = handsFromInteraction(at({ spread: 0.2, panY: -1, lead: 1, gesture: "PAN_DOWN" }), DEFAULT_SETTINGS);
    assert.ok(L.left.x < R.right.x);
    assert.ok(R.right.x > L.right.x);
    assert.ok(U.right.z > D.right.z + 0.08, `up ${U.right.z} down ${D.right.z}`);
  });

  it("is continuous — small input steps never jump", () => {
    let prev = handsFromInteraction(rest, DEFAULT_SETTINGS);
    for (let i = 1; i <= 20; i++) {
      const s = i / 20;
      const next = handsFromInteraction(at({ spread: s, panX: s * 0.6, gesture: "SPREAD" }), DEFAULT_SETTINGS);
      const dl = Math.hypot(next.left.x - prev.left.x, next.left.z - prev.left.z);
      const dr = Math.hypot(next.right.x - prev.right.x, next.right.z - prev.right.z);
      assert.ok(dl < 0.06, `left jump ${dl} at ${s}`);
      assert.ok(dr < 0.06, `right jump ${dr} at ${s}`);
      prev = next;
    }
  });

  it("never crosses — left palm stays left of right palm", () => {
    for (const panX of [-1, -0.4, 0, 0.4, 1]) {
      for (const spread of [0, 0.5, 1]) {
        const h = handsFromInteraction(at({ panX, spread, gesture: "PAN_RIGHT" }), DEFAULT_SETTINGS);
        assert.ok(h.left.x < h.right.x, `crossed at pan=${panX} spread=${spread}`);
        assert.ok(h.right.x - h.left.x >= 0.15, `too close ${h.right.x - h.left.x}`);
      }
    }
  });

  it("SPREAD opens wide; PINCH / RETURN close — zoom language", () => {
    const open = handsFromInteraction(at({ spread: 1, gesture: "SPREAD" }), DEFAULT_SETTINGS);
    const pinch = handsFromInteraction(at({ spread: 0.08, gesture: "PINCH" }), DEFAULT_SETTINGS);
    const ret = handsFromInteraction(at({ spread: 0.08, gesture: "RETURN" }), DEFAULT_SETTINGS);
    assert.ok(handSeparation(open) > handSeparation(pinch) + 0.06);
    assert.ok(handSeparation(open) < 0.4, `spread should stay compact, got ${handSeparation(open)}`);
    assert.ok(handSeparation(ret) < 0.28);
  });

  it("vertical drag: lead hand sits higher on the glass", () => {
    const h = handsFromInteraction(
      at({ panY: -1, lead: 1, spread: 0.12, gesture: "PAN_DOWN" }),
      DEFAULT_SETTINGS,
    );
    assert.ok(h.right.z < h.left.z - 0.04, `lead z ${h.right.z} trail ${h.left.z}`);
  });

  it("one hand pans; two hands zoom", () => {
    const panR = handsFromInteraction(at({ panX: 1, lead: 1, spread: 0.12, gesture: "PAN_RIGHT" }), DEFAULT_SETTINGS);
    const panL = handsFromInteraction(at({ panX: -1, lead: -1, spread: 0.12, gesture: "PAN_LEFT" }), DEFAULT_SETTINGS);
    const zoom = handsFromInteraction(at({ spread: 1, gesture: "SPREAD" }), DEFAULT_SETTINGS);
    assert.ok(panR.right.x > panR.left.x + 0.12);
    assert.ok(panL.left.x < panL.right.x - 0.12);
    assert.ok(handSeparation(zoom) < 0.4);
    assert.ok(Math.abs(zoom.left.y - zoom.right.y) < 0.04);
  });

  it("gesture label does not teleport palms", () => {
    const a = handsFromInteraction(at({ spread: 0.3, panX: 0.2, lead: 0, gesture: "HOLD" }), DEFAULT_SETTINGS);
    const b = handsFromInteraction(at({ spread: 0.3, panX: 0.2, lead: 0, gesture: "SPREAD" }), DEFAULT_SETTINGS);
    const dl = Math.hypot(a.left.x - b.left.x, a.left.z - b.left.z);
    const dr = Math.hypot(a.right.x - b.right.x, a.right.z - b.right.z);
    assert.ok(dl < 0.02 && dr < 0.02, `label jump L${dl} R${dr}`);
  });
});
