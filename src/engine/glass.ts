import * as THREE from "three";
import { HEX } from "./config.ts";
import { clamp, computeBlit } from "./math.ts";

const W = HEX.screen55.width;
const H = HEX.screen55.height;
/** Front of ScreenPanel (z=0.004) + TouchGlass. Local +Z is out of the 55". */
const GLASS_Z = 0.006;
/** Wrist floats this far along the screen normal — knuckles never enter. */
export const PALM_CLEAR = 0.082;
/** Wrist sits toward the operator; index pads land on the mapped UV. */
export const FINGER_BACK = 0.078;

const root = new THREE.Group();
root.position.set(0, HEX.tableHeight, HEX.tableZ);
root.rotation.set(-HEX.tableTilt, 0, 0);
const inner = new THREE.Group();
inner.rotation.set(-Math.PI / 2, 0, Math.PI);
root.add(inner);
root.updateMatrixWorld(true);

const _p = new THREE.Vector3();
const _n = new THREE.Vector3(0, 0, 1);

function sync() {
  root.updateMatrixWorld(true);
}

/** World position of a 16:9 UV on the 55" front glass, plus along the outward normal. */
export function glassUvToWorld(u: number, v: number, alongNormal = 0) {
  sync();
  _p.set((clamp(u, 0, 1) - 0.5) * W, (0.5 - clamp(v, 0, 1)) * H, GLASS_Z + alongNormal);
  inner.localToWorld(_p);
  return { x: _p.x, y: _p.y, z: _p.z };
}

/** Outward glass normal (world). */
export function glassNormalWorld() {
  sync();
  _n.set(0, 0, 1);
  _n.transformDirection(inner.matrixWorld);
  return { x: _n.x, y: _n.y, z: _n.z };
}

/**
 * Impenetrable wall: any world point is slammed onto the front face.
 * Local Z is forced positive — never inside the bezel.
 */
export function projectToGlass(x: number, y: number, z: number, alongNormal = PALM_CLEAR) {
  sync();
  _p.set(x, y, z);
  inner.worldToLocal(_p);
  _p.x = clamp(_p.x, -W * 0.48, W * 0.48);
  _p.y = clamp(_p.y, -H * 0.48, H * 0.48);
  _p.z = GLASS_Z + alongNormal;
  inner.localToWorld(_p);
  return { x: _p.x, y: _p.y, z: _p.z };
}

export function worldToGlassUv(x: number, z: number) {
  sync();
  _p.set(x, HEX.tableHeight, z);
  inner.worldToLocal(_p);
  return {
    u: clamp(_p.x / W + 0.5, -0.08, 1.08),
    v: clamp(0.5 - _p.y / H, -0.08, 1.08),
  };
}

export function worldPosToGlassUv(x: number, y: number, z: number) {
  sync();
  _p.set(x, y, z);
  inner.worldToLocal(_p);
  return {
    u: clamp(_p.x / W + 0.5, -0.08, 1.08),
    v: clamp(0.5 - _p.y / H, -0.08, 1.08),
  };
}

/** Artwork (cx,cy) at this zoom → 55" UV. */
export function artPointToUv(cx: number, cy: number, zoom: number, artW = 1, artH = 1) {
  const blit = computeBlit(artW, artH, 16, 9, { cx, cy, zoom: Math.max(1, zoom) });
  const ax = clamp(cx, 0, 1) * artW;
  const ay = clamp(cy, 0, 1) * artH;
  const u = (blit.dx + ((ax - blit.sx) / Math.max(1e-6, blit.sw)) * blit.dw) / 16;
  const v = (blit.dy + ((ay - blit.sy) / Math.max(1e-6, blit.sh)) * blit.dh) / 9;
  return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
}

/** Wrist world pose so the index pad sits on UV (u,v). */
export function wristOnUv(u: number, v: number, extra = 0) {
  const dv = FINGER_BACK / H;
  return glassUvToWorld(u, clamp(v + dv, 0.02, 0.98), PALM_CLEAR + extra);
}

/** Unit vector along the glass toward the TOP of the 55" (where the work is). */
export function glassFingerDir() {
  const a = glassUvToWorld(0.5, 0.62, 0);
  const b = glassUvToWorld(0.5, 0.38, 0);
  const x = b.x - a.x;
  const y = b.y - a.y;
  const z = b.z - a.z;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function tableY(z: number) {
  return HEX.tableHeight + Math.tan(HEX.tableTilt) * (z - HEX.tableZ);
}
