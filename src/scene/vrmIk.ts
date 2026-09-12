import { HEX } from "@/engine/config";
import { isOnMonitor, onGlass, Z_MIN } from "@/engine/hands";
import { clamp, damp, lerp, wander } from "@/engine/math";
import type { GestureId, TeaserState } from "@/engine/types";
import { runtime } from "./runtime";
import * as THREE from "three";

type Humanoid = {
  getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
};

const _sh = new THREE.Vector3();
const _shL = new THREE.Vector3();
const _shR = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _restDir = new THREE.Vector3();
const _localTarget = new THREE.Vector3();
const _parentInv = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _smoothL = new THREE.Vector3();
const _smoothR = new THREE.Vector3();
const _wantL = new THREE.Vector3();
const _wantR = new THREE.Vector3();

function snapPalm(v: THREE.Vector3, extra = 0) {
  if (!isOnMonitor(v.z)) return;
  const s = onGlass(v.x, v.z, extra);
  v.set(s.x, s.y, s.z);
}
const _from = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _headW = new THREE.Vector3();
let _armed = false;
let _lastT = 0;
const filt = {
  spread: 0,
  lean: 0,
  stance: 0,
  midX: 0,
  reach: 0,
  glance: 0,
  glanceDir: 0,
  panX: 0,
  open: 0,
};

function aimBone(bone: THREE.Object3D, restAim: THREE.Vector3, worldTarget: THREE.Vector3) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  _parentInv.copy(parent.matrixWorld).invert();
  _localTarget.copy(worldTarget).applyMatrix4(_parentInv);
  _dir.copy(_localTarget).sub(bone.position);
  if (_dir.lengthSq() < 1e-10) return;
  _dir.normalize();
  _restDir.copy(restAim);
  if (_restDir.lengthSq() < 1e-10) _restDir.set(0, 1, 0);
  else _restDir.normalize();
  bone.quaternion.setFromUnitVectors(_restDir, _dir);
  bone.updateMatrixWorld(true);
}

const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const PARTS = ["Proximal", "Intermediate", "Distal"] as const;

const FINGER_CURL: Record<string, number[]> = {
  SPREAD: [0.0, 0.06, 0.18, 0.28],
  PINCH: [0.0, 0.08, 0.2, 0.3],
  RETURN: [0.0, 0.1, 0.22, 0.32],
  DETAIL_POINT: [0.0, 0.55, 0.7, 0.8],
  PAN_LEFT: [0.02, 0.2, 0.48, 0.62],
  PAN_RIGHT: [0.02, 0.2, 0.48, 0.62],
  PAN_UP: [0.02, 0.2, 0.48, 0.62],
  PAN_DOWN: [0.02, 0.2, 0.48, 0.62],
  HOLD: [0.04, 0.14, 0.28, 0.4],
};

function curlAmount(pose: GestureId, finger: string) {
  const row = FINGER_CURL[pose] ?? FINGER_CURL.HOLD!;
  const i = Math.max(0, FINGERS.indexOf(finger as (typeof FINGERS)[number]));
  return row[i] ?? 0.2;
}

function lungFill(t: number) {
  const phase = t * 0.245 * Math.PI * 2 + 0.16 * Math.sin(t * 0.09);
  let u = (phase / (Math.PI * 2)) % 1;
  if (u < 0) u += 1;
  if (u < 0.36) return THREE.MathUtils.smootherstep(u / 0.36, 0, 1);
  if (u < 0.44) return 1;
  if (u < 0.9) return 1 - THREE.MathUtils.smootherstep((u - 0.44) / 0.46, 0, 1);
  return 0;
}

export function createVrmRig(humanoid: Humanoid) {
  const node = (name: string) => humanoid.getNormalizedBoneNode(name);

  const L = {
    upper: node("leftUpperArm"),
    lower: node("leftLowerArm"),
    hand: node("leftHand"),
  };
  const R = {
    upper: node("rightUpperArm"),
    lower: node("rightLowerArm"),
    hand: node("rightHand"),
  };

  const rest = new Map<THREE.Object3D, THREE.Quaternion>();
  const aim = new Map<THREE.Object3D, THREE.Vector3>();
  const capture = (b: THREE.Object3D | null) => {
    if (b) rest.set(b, b.quaternion.clone());
  };
  const captureAim = (bone: THREE.Object3D | null, child: THREE.Object3D | null) => {
    if (bone && child) aim.set(bone, child.position.clone());
  };

  for (const side of ["left", "right"] as const) {
    capture(node(`${side}Shoulder`));
    capture(node(`${side}UpperArm`));
    capture(node(`${side}LowerArm`));
    capture(node(`${side}Hand`));
    capture(node(`${side}ThumbMetacarpal`));
    capture(node(`${side}ThumbProximal`));
    capture(node(`${side}ThumbDistal`));
    for (const f of FINGERS) for (const p of PARTS) capture(node(`${side}${f}${p}`));
  }
  capture(node("spine"));
  capture(node("chest"));
  capture(node("upperChest"));
  capture(node("neck"));
  capture(node("head"));
  capture(node("hips"));
  capture(node("leftUpperLeg"));
  capture(node("rightUpperLeg"));
  captureAim(L.upper, L.lower);
  captureAim(L.lower, L.hand);
  captureAim(R.upper, R.lower);
  captureAim(R.lower, R.hand);

  const hipRest = node("hips")?.position.clone() ?? new THREE.Vector3();
  const upperL = L.lower ? Math.max(0.14, L.lower.position.length()) : 0.26;
  const lowerL = L.hand ? Math.max(0.14, L.hand.position.length()) : 0.25;
  const upperR = R.lower ? Math.max(0.14, R.lower.position.length()) : 0.26;
  const lowerR = R.hand ? Math.max(0.14, R.hand.position.length()) : 0.25;

  function reset(b: THREE.Object3D | null) {
    const r = b ? rest.get(b) : undefined;
    if (b && r) b.quaternion.copy(r);
  }

  function poseHand(side: "left" | "right", pose: GestureId, t: number, seed: number, spread: number) {
    const sign = side === "left" ? 1 : -1;
    const sid = side === "left" ? 3 : 11;
    const open = clamp(spread, 0, 1);
    const dragging = pose.startsWith("PAN");
    const abductBase = lerp(0.015, pose === "SPREAD" ? 0.26 : dragging ? 0.07 : 0.05, open);
    const together = [0.08, 0.12, 0.16, 0.2];
    for (let fi = 0; fi < FINGERS.length; fi++) {
      const f = FINGERS[fi]!;
      const posed = curlAmount(dragging ? pose : pose === "SPREAD" ? "SPREAD" : open > 0.55 ? pose : "HOLD", f);
      const drive = dragging && fi === 0 ? Math.max(open, 0.82) : open;
      const curl = clamp(lerp(together[fi]!, posed, drive) + wander(t, seed, sid + fi, 0.16) * 0.04, 0, 0.94);
      const abduct = abductBase * (fi - 1.05) + wander(t, seed, sid + 30 + fi, 0.14) * 0.025;
      for (let i = 0; i < PARTS.length; i++) {
        const b = node(`${side}${f}${PARTS[i]}`);
        const r = b ? rest.get(b) : undefined;
        if (!b || !r) continue;
        const mcp = i === 0;
        const dip = i === 2;
        const flex = curl * (mcp ? 0.32 : dip ? 0.08 : 0.42) + (mcp && dragging && fi === 0 ? -0.06 : 0) + (dip ? -0.16 : 0);
        const abd = mcp ? abduct : 0;
        _euler.set(flex, abd * 0.18, mcp ? sign * abd : 0);
        b.quaternion.copy(r).multiply(_q.setFromEuler(_euler));
      }
    }
    const thumbOpp = pose === "PINCH" || (pose === "SPREAD" && open < 0.25) ? 0.55 : pose === "SPREAD" ? lerp(0.4, 0.05, open) : dragging ? 0.18 : 0.28;
    const thumbLive = wander(t, seed, sid + 70, 0.18) * 0.05;
    {
      const meta = node(`${side}ThumbMetacarpal`);
      const rr = meta ? rest.get(meta) : undefined;
      if (meta && rr) {
        _euler.set(0.08 + thumbLive, sign * (thumbOpp * 0.7 + thumbLive), sign * (0.22 + (1 - open) * 0.08));
        meta.quaternion.copy(rr).multiply(_q.setFromEuler(_euler));
      }
      const prox = node(`${side}ThumbProximal`);
      const rp = prox ? rest.get(prox) : undefined;
      if (prox && rp) {
        _euler.set(0.16 + thumbOpp * 0.25, 0, sign * 0.04);
        prox.quaternion.copy(rp).multiply(_q.setFromEuler(_euler));
      }
      const dist = node(`${side}ThumbDistal`);
      const rd = dist ? rest.get(dist) : undefined;
      if (dist && rd) {
        _euler.set(0.1 + (pose === "PINCH" ? 0.12 : 0), 0, 0);
        dist.quaternion.copy(rd).multiply(_q.setFromEuler(_euler));
      }
    }
  }

  function solveArm(
    chain: typeof L,
    target: THREE.Vector3,
    upperLen: number,
    lowerLen: number,
    open: number,
  ) {
    const { upper, lower, hand } = chain;
    if (!upper || !lower || !hand) return;
    reset(upper);
    reset(lower);
    reset(hand);
    upper.updateMatrixWorld(true);
    upper.getWorldPosition(_sh);
    _goal.copy(target);
    const hips = node("hips");
    if (hips) hips.getWorldPosition(_hip);
    else _hip.set(0, 0.95, HEX.personZ);
    upper.getWorldScale(_scl);
    const u = upperLen * Math.max(0.8, _scl.x);
    const l = lowerLen * Math.max(0.8, _scl.x);
    const towardTable = HEX.tableZ >= _sh.z ? 1 : -1;
    const out = _sh.x >= 0 ? 1 : -1;
    _dir.copy(_goal).sub(_sh);
    let d = _dir.length();
    const maxR = (u + l) * 0.985;
    if (d < 1e-5) return;
    if (d > maxR) {
      for (let k = 0; k < 12 && d > maxR; k++) {
        _goal.z -= 0.035;
        if (_goal.z < Z_MIN) _goal.z = Z_MIN;
        snapPalm(_goal);
        _dir.copy(_goal).sub(_sh);
        d = _dir.length();
      }
      if (d > maxR) {
        _dir.setLength(maxR);
        _goal.copy(_sh).add(_dir);
        snapPalm(_goal);
        _dir.copy(_goal).sub(_sh);
        d = _dir.length();
      }
    }
    _dir.multiplyScalar(1 / d);
    const reach = clamp(d / maxR, 0, 1);
    _pole.set(
      _hip.x + out * (0.16 + 0.14 * open),
      _hip.y + 0.1 + 0.08 * (1 - reach),
      _sh.z + towardTable * (0.1 + 0.05 * open),
    );
    _elbow.copy(_pole).sub(_sh);
    _elbow.addScaledVector(_dir, -_elbow.dot(_dir));
    if (_elbow.lengthSq() < 1e-8) _elbow.set(out, -1, towardTable * 0.2);
    _elbow.normalize();
    const cosA = THREE.MathUtils.clamp((u * u + d * d - l * l) / (2 * u * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    _elbow.multiplyScalar(u * sinA).addScaledVector(_dir, u * cosA).add(_sh);
    _elbow.y = THREE.MathUtils.clamp(_elbow.y, _hip.y + 0.02, _sh.y - 0.14);
    const upperAim = aim.get(upper);
    const lowerAim = aim.get(lower);
    if (upperAim) aimBone(upper, upperAim, _elbow);
    if (lowerAim) {
      aimBone(lower, lowerAim, _goal);
      _euler.set(0, 0, (_sh.x >= 0 ? -1 : 1) * 0.32);
      lower.quaternion.multiply(_q.setFromEuler(_euler));
      lower.updateMatrixWorld(true);
    }
  }

  return {
    apply(state: TeaserState, _snap: boolean) {
      const hl = state.hands.left;
      const hr = state.hands.right;
      _wantL.set(hl.x, hl.y, hl.z);
      _wantR.set(hr.x, hr.y, hr.z);
      const lift = THREE.MathUtils.clamp(state.interaction.glance ?? 0, 0, 1) > 0.45 ? 0.012 : 0;
      snapPalm(_wantL, lift);
      snapPalm(_wantR, lift);
      const rawSpread = THREE.MathUtils.clamp(state.interaction.spread, 0, 1);
      const rawGlance = THREE.MathUtils.clamp(state.interaction.glance ?? 0, 0, 1);
      const rawGlanceDir = THREE.MathUtils.clamp(state.interaction.glanceDir ?? 0, -1, 1);
      const rawPanX = THREE.MathUtils.clamp(state.interaction.panX, -1, 1);
      const rawPanY = THREE.MathUtils.clamp(state.interaction.panY, -1, 1);
      const t = state.time;
      const rewind = t + 1e-4 < _lastT;
      const dt = !_armed || rewind ? 1 / 45 : clamp(t - _lastT, 1 / 120, 0.08);
      if (!_armed || rewind) {
        _smoothL.copy(_wantL);
        _smoothR.copy(_wantR);
        filt.spread = rawSpread;
        filt.open = rawSpread;
        filt.glance = rawGlance;
        filt.glanceDir = rawGlanceDir;
        filt.panX = rawPanX;
        filt.midX = (_wantL.x + _wantR.x) * 0.5;
        _armed = true;
        _lastT = t;
      } else {
        _lastT = t;
        const aHand = 1 - Math.exp(-2.7 * dt);
        _smoothL.lerp(_wantL, aHand);
        _smoothR.lerp(_wantR, aHand);
        snapPalm(_smoothL, lift);
        snapPalm(_smoothR, lift);
        filt.spread = damp(filt.spread, rawSpread, 1.15, dt);
        filt.open = damp(filt.open, rawSpread, 1.25, dt);
        filt.glance = damp(filt.glance, rawGlance, 1.05, dt);
        filt.glanceDir = damp(filt.glanceDir, rawGlanceDir, 1.05, dt);
        filt.panX = damp(filt.panX, rawPanX, 1.2, dt);
      }

      const spread = filt.spread;
      const glance = filt.glance;
      const glanceDir = filt.glanceDir;
      const stretch = THREE.MathUtils.clamp(state.interaction.stretch ?? 0, 0, 1);
      const panX = filt.panX;
      const panY = rawPanY;
      const fill = lungFill(t);
      const air = 0.026 * (0.72 + 0.38 * stretch + 0.18 * glance);
      const midXWant = (_smoothL.x + _smoothR.x) * 0.5;
      filt.midX = !_armed ? midXWant : damp(filt.midX, midXWant, 1.35, dt);
      const midX = filt.midX;
      const stanceWant = Math.tanh(Math.sin(t * 0.16 + 0.4) * 1.2) * (0.32 + 0.55 * glance) + midX * 0.28;
      filt.stance = damp(filt.stance, stanceWant, 1.2, dt);
      const stance = filt.stance;
      const lookUp = glance;
      const highZ = Math.max(_smoothL.z, _smoothR.z);
      const reachHands = THREE.MathUtils.clamp((highZ - HEX.tableZ + 0.04) / (HEX.screen55.height * 0.36), 0, 1);
      const reachWant = THREE.MathUtils.clamp(-panY, 0, 1) * 0.2 + reachHands * 0.5 + spread * 0.3;
      filt.reach = damp(filt.reach, reachWant, 1.15, 1 / 30);
      const reach = filt.reach;
      const leanWant = (-0.14 - 0.22 * spread - 0.16 * reach + stretch * 0.08) * (1 - glance * 0.5);
      filt.lean = damp(filt.lean, leanWant, 1.1, 1 / 30);
      const lean = filt.lean;
      const hips = node("hips");
      if (hips && rest.get(hips)) {
        hips.position.x = hipRest.x + midX * 0.1 + stance * 0.03;
        hips.position.z = hipRest.z - 0.05 - 0.1 * spread - 0.08 * reach;
        hips.position.y = hipRest.y + 0.015 * reach;
        _euler.set(-0.06 - 0.1 * spread - 0.06 * reach, midX * 0.14 + stance * 0.12, stance * 0.14);
        hips.quaternion.copy(rest.get(hips)!).multiply(_q.setFromEuler(_euler));
        hips.updateMatrixWorld(true);
      }
      const spine = node("spine");
      if (spine && rest.get(spine)) {
        _euler.set(lean, midX * 0.12 + panX * 0.05, stance * 0.05);
        spine.quaternion.copy(rest.get(spine)!).multiply(_q.setFromEuler(_euler));
        spine.updateMatrixWorld(true);
      }
      const chest = node("chest");
      if (chest && rest.get(chest)) {
        _euler.set(-0.08 - 0.14 * spread - 0.1 * reach + glance * 0.06 - air * fill, midX * 0.08 + panX * 0.05, stance * 0.03);
        chest.quaternion.copy(rest.get(chest)!).multiply(_q.setFromEuler(_euler));
        chest.updateMatrixWorld(true);
      } else {
        reset(node("chest"));
      }
      const upperChest = node("upperChest");
      if (upperChest && rest.get(upperChest)) {
        _euler.set(-0.05 * reach - 0.03 * spread - air * 0.7 * fill, panX * 0.03 + midX * 0.04, 0);
        upperChest.quaternion.copy(rest.get(upperChest)!).multiply(_q.setFromEuler(_euler));
        upperChest.updateMatrixWorld(true);
      }
      const lLeg = node("leftUpperLeg");
      const rLeg = node("rightUpperLeg");
      if (lLeg && rest.get(lLeg)) {
        _euler.set(stance > 0.12 ? 0.2 : 0.04 + spread * 0.03, 0, stance * 0.05);
        lLeg.quaternion.copy(rest.get(lLeg)!).multiply(_q.setFromEuler(_euler));
      }
      if (rLeg && rest.get(rLeg)) {
        _euler.set(stance < -0.12 ? 0.2 : 0.04 + spread * 0.03, 0, stance * 0.05);
        rLeg.quaternion.copy(rest.get(rLeg)!).multiply(_q.setFromEuler(_euler));
      }
      const shL = node("leftShoulder");
      const shR = node("rightShoulder");
      const asym = THREE.MathUtils.clamp((_smoothL.z - _smoothR.z) * 3.2, -1, 1);
      if (shL && rest.get(shL)) {
        const protract = 0.07 + 0.14 * reach + 0.05 * Math.max(0, asym);
        const depress = 0.03 + 0.05 * reach;
        const shrug = 0.03 + 0.04 * glance + air * 0.45 * fill;
        _euler.set(-protract - depress, 0.05 * panX + 0.04 * midX, -shrug);
        shL.quaternion.copy(rest.get(shL)!).multiply(_q.setFromEuler(_euler));
        shL.updateMatrixWorld(true);
      }
      if (shR && rest.get(shR)) {
        const protract = 0.07 + 0.14 * reach + 0.05 * Math.max(0, -asym);
        const depress = 0.03 + 0.05 * reach;
        const shrug = 0.03 + 0.04 * glance + air * 0.45 * fill;
        _euler.set(-protract - depress, -0.05 * panX - 0.04 * midX, shrug);
        shR.quaternion.copy(rest.get(shR)!).multiply(_q.setFromEuler(_euler));
        shR.updateMatrixWorld(true);
      }
      L.upper?.updateMatrixWorld(true);
      R.upper?.updateMatrixWorld(true);
      L.upper?.getWorldPosition(_shL);
      R.upper?.getWorldPosition(_shR);

      const swap = _shL.x > _shR.x;
      const palmForLeftBone = swap ? _smoothR : _smoothL;
      const palmForRightBone = swap ? _smoothL : _smoothR;

      solveArm(L, palmForLeftBone, upperL, lowerL, spread);
      solveArm(R, palmForRightBone, upperR, lowerR, spread);

      const seed = state.seed ?? 1;
      const poseL = swap ? hr.pose : hl.pose;
      const poseR = swap ? hl.pose : hr.pose;
      poseHand("left", poseL, state.time, seed, filt.open);
      poseHand("right", poseR, state.time, seed ^ 0x9e37, filt.open);
      const wristL = node("leftHand");
      const wristR = node("rightHand");
      if (wristL && rest.get(wristL)) {
        const g = poseL;
        const ext = 0.14;
        const tilt = -HEX.tableTilt + ext;
        const deviate = g.startsWith("PAN") ? panX * 0.08 : midX * 0.02;
        _euler.set(tilt, 0.02 + deviate, 0.03);
        wristL.quaternion.multiply(_q.setFromEuler(_euler));
      }
      if (wristR && rest.get(wristR)) {
        const g = poseR;
        const ext = 0.14;
        const tilt = -HEX.tableTilt + ext;
        const deviate = g.startsWith("PAN") ? panX * 0.08 : midX * 0.02;
        _euler.set(tilt, -0.02 + deviate, -0.03);
        wristR.quaternion.multiply(_q.setFromEuler(_euler));
      }

      const neck = node("neck");
      const head = node("head");
      if (neck && rest.get(neck)) {
        const aimX = (state.interaction.targetCx ?? 0.5) * 2 - 1;
        const aimY = (state.interaction.targetCy ?? 0.5) * 2 - 1;
        const att = Math.sin(t * 0.22) * 0.025;
        const wall = lookUp;
        const yaw =
          wall * (glanceDir * 0.82 + Math.sin(t * 0.13) * 0.04) + (1 - wall) * (aimX * 0.34 + att);
        const pitch =
          (1 - wall) * (-0.16 - aimY * 0.12 + Math.sin(t * 0.18) * 0.02) +
          wall * (-0.04 + stretch * 0.28) +
          stretch * -0.04 -
          air * 0.22 * fill;
        const roll = Math.sin(t * 0.14) * 0.025 + stance * 0.04 + stretch * glanceDir * 0.06;
        _euler.set(pitch, yaw, roll);
        neck.quaternion.copy(rest.get(neck)!).multiply(_q.setFromEuler(_euler));
      }
      if (head && rest.get(head)) {
        head.scale.setScalar(0.86);
        _euler.set(Math.sin(state.time * 0.28) * 0.03 + stretch * -0.04, Math.sin(state.time * 0.15) * 0.04 + lookUp * glanceDir * 0.08, 0);
        head.quaternion.copy(rest.get(head)!).multiply(_q.setFromEuler(_euler));
        head.updateMatrixWorld(true);
        head.getWorldPosition(_headW);
        runtime.head.x = _headW.x;
        runtime.head.y = _headW.y;
        runtime.head.z = _headW.z;
      }
    },
    reset() {
      _armed = false;
      _lastT = 0;
    },
  };
}

export type VrmRig = ReturnType<typeof createVrmRig>;
