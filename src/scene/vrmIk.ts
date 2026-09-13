import { HEX } from "@/engine/config";
import { glassFingerDir, PALM_CLEAR, projectToGlass } from "@/engine/hands";
import { clamp, damp, lerp, wander } from "@/engine/math";
import type { GestureId, TeaserState } from "@/engine/types";
import { runtime } from "./runtime";
import * as THREE from "three";

type Humanoid = {
  getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
  getRawBoneNode?: (name: string) => THREE.Object3D | null;
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
  const s = projectToGlass(v.x, v.y, v.z, PALM_CLEAR + extra);
  v.set(s.x, s.y, s.z);
}
const _from = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _fingerDir = new THREE.Vector3();
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
  SPREAD: [0.0, 0.04, 0.1, 0.16],
  PINCH: [0.0, 0.04, 0.1, 0.16],
  RETURN: [0.0, 0.05, 0.12, 0.18],
  DETAIL_POINT: [0.0, 0.06, 0.14, 0.2],
  PAN_LEFT: [0.0, 0.05, 0.12, 0.18],
  PAN_RIGHT: [0.0, 0.05, 0.12, 0.18],
  PAN_UP: [0.0, 0.05, 0.12, 0.18],
  PAN_DOWN: [0.0, 0.05, 0.12, 0.18],
  HOLD: [0.0, 0.05, 0.12, 0.18],
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
  const node = (name: string) =>
    humanoid.getRawBoneNode?.(name) ?? humanoid.getNormalizedBoneNode(name);

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
  L.hand?.traverse((o) => {
    if ((o as THREE.Bone).isBone) capture(o);
  });
  R.hand?.traverse((o) => {
    if ((o as THREE.Bone).isBone) capture(o);
  });
  captureAim(L.hand, node("leftIndexProximal"));
  captureAim(R.hand, node("rightIndexProximal"));
  if (L.hand && !aim.get(L.hand)) aim.set(L.hand, new THREE.Vector3(0, 0.08, 0));
  if (R.hand && !aim.get(R.hand)) aim.set(R.hand, new THREE.Vector3(0, 0.08, 0));
  if (L.upper && !aim.get(L.upper)) aim.set(L.upper, new THREE.Vector3(0, 1, 0));
  if (R.upper && !aim.get(R.upper)) aim.set(R.upper, new THREE.Vector3(0, 1, 0));
  if (L.lower && !aim.get(L.lower)) aim.set(L.lower, new THREE.Vector3(0, 1, 0));
  if (R.lower && !aim.get(R.lower)) aim.set(R.lower, new THREE.Vector3(0, 1, 0));

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
    const pinching = pose === "PINCH" || pose === "RETURN";
    const spreading = pose === "SPREAD";
    const pointing = pose === "DETAIL_POINT";
    const hand = node(`${side}Hand`);
    let named = 0;
    for (let fi = 0; fi < FINGERS.length; fi++) {
      const f = FINGERS[fi]!;
      const index = fi === 0;
      const wave = Math.sin(t * 1.7 + fi * 0.85 + sid) * (index ? 0.04 : 0.07);
      const restCurl = index ? 0.06 : 0.1 + fi * 0.03;
      const curlAmt = spreading
        ? lerp(restCurl, 0.04, open)
        : pinching
          ? lerp(0.12, 0.38, 1 - open) * (index ? 0.45 : 1)
          : pointing && index
            ? 0.02
            : dragging
              ? restCurl + 0.06
              : restCurl;
      const abduct = (spreading ? lerp(0.02, 0.16, open) : 0.05) * (fi - 1.15);
      for (let i = 0; i < PARTS.length; i++) {
        const b = node(`${side}${f}${PARTS[i]}`);
        const r = b ? rest.get(b) : undefined;
        if (!b || !r) continue;
        named++;
        const k = i === 0 ? 0.4 : i === 1 ? 0.85 : 0.55;
        const flex = curlAmt * k + wave * (i === 1 ? 1 : 0.4);
        _euler.set(flex, i === 0 ? abduct * 0.12 : 0, i === 0 ? sign * abduct : 0);
        b.quaternion.copy(r).multiply(_q.setFromEuler(_euler));
      }
    }
    const thumbOpp = spreading ? lerp(0.22, 0.08, open) : pinching ? lerp(0.12, 0.32, 1 - open) : 0.16;
    const thumbLive = Math.sin(t * 1.5 + sid) * 0.04;
    const thumbBones = [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`] as const;
    const thumbFlex = [0.08 + thumbLive, 0.12 + thumbOpp * 0.25, 0.08];
    for (let i = 0; i < thumbBones.length; i++) {
      const b = node(thumbBones[i]!);
      const r = b ? rest.get(b) : undefined;
      if (!b || !r) continue;
      named++;
      _euler.set(thumbFlex[i]!, sign * (thumbOpp * 0.45), sign * (0.16 + thumbOpp * 0.2));
      b.quaternion.copy(r).multiply(_q.setFromEuler(_euler));
    }
    if (named < 4 && hand) {
      let n = 0;
      hand.traverse((o) => {
        if (o === hand) return;
        const isBone = (o as THREE.Bone).isBone || o.type === "Bone";
        if (!isBone) return;
        let r = rest.get(o);
        if (!r) {
          r = o.quaternion.clone();
          rest.set(o, r);
        }
        const d = Math.min(2, n % 3);
        n++;
        const wave = Math.sin(t * 1.6 + n * 0.5 + sid) * 0.05;
        const curl = spreading ? 0.05 + d * 0.03 : pinching ? 0.16 + d * 0.18 : 0.1 + d * 0.06;
        _euler.set(curl + wave, 0, 0);
        o.quaternion.copy(r).multiply(_q.setFromEuler(_euler));
      });
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
    const inward = _sh.x >= 0 ? -1 : 1;
    _dir.copy(_goal).sub(_sh);
    let d = _dir.length();
    const maxR = (u + l) * 0.97;
    if (d < 1e-5) return;
    if (d > maxR) {
      _dir.multiplyScalar(maxR / d);
      _goal.copy(_sh).add(_dir);
      snapPalm(_goal);
      _dir.copy(_goal).sub(_sh);
      d = _dir.length();
    }
    if (d < 1e-5) return;
    _dir.multiplyScalar(1 / d);
    _pole.set(
      _hip.x + inward * 0.04,
      Math.min(_hip.y + 0.08, _sh.y - 0.22),
      _hip.z + towardTable * 0.03,
    );
    _elbow.copy(_pole).sub(_sh);
    _elbow.addScaledVector(_dir, -_elbow.dot(_dir));
    if (_elbow.lengthSq() < 1e-8) _elbow.set(inward, -1.2, towardTable * 0.12);
    _elbow.normalize();
    if (_elbow.y > -0.15) _elbow.y = -0.35;
    const cosA0 = THREE.MathUtils.clamp((u * u + d * d - l * l) / (2 * u * d), -1, 1);
    const sinA0 = Math.sqrt(Math.max(0, 1 - cosA0 * cosA0));
    const sinA = Math.max(sinA0, 0.28);
    const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
    _elbow.multiplyScalar(u * sinA).addScaledVector(_dir, u * cosA).add(_sh);
    _elbow.y = THREE.MathUtils.clamp(_elbow.y, _hip.y - 0.04, Math.min(_sh.y - 0.16, _hip.y + 0.22));
    const upperAim = aim.get(upper);
    const lowerAim = aim.get(lower);
    if (upperAim) aimBone(upper, upperAim, _elbow);
    if (lowerAim) {
      aimBone(lower, lowerAim, _goal);
      lower.updateMatrixWorld(true);
    }
  }

  return {
    apply(state: TeaserState, _snap: boolean) {
      try {
        this._apply(state);
      } catch {
        /* keep T-pose rather than freeze the studio */
      }
    },
    _apply(state: TeaserState) {
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
        const aHand = 1 - Math.exp(-4.4 * dt);
        _smoothL.lerp(_wantL, aHand);
        _smoothR.lerp(_wantR, aHand);
        snapPalm(_smoothL, lift);
        snapPalm(_smoothR, lift);
        filt.spread = damp(filt.spread, rawSpread, 1.15, dt);
        filt.open = damp(filt.open, rawSpread, 2.6, dt);
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
      const stanceWant = Math.tanh(Math.sin(t * 0.22 + 0.4) * 1.4) * (0.45 + 0.4 * glance) + midX * 0.42;
      filt.stance = damp(filt.stance, stanceWant, 1.35, dt);
      const stance = filt.stance;
      const lookUp = glance;
      const highZ = Math.max(_smoothL.z, _smoothR.z);
      const reachHands = THREE.MathUtils.clamp((highZ - HEX.tableZ + 0.04) / (HEX.screen55.height * 0.36), 0, 1);
      const reachWant = THREE.MathUtils.clamp(-panY, 0, 1) * 0.25 + reachHands * 0.45 + spread * 0.18;
      filt.reach = damp(filt.reach, reachWant, 1.35, dt);
      const reach = filt.reach;
      const leanWant = (-0.045 - 0.05 * reach + 0.04 * glance + stretch * 0.03) * (1 - glance * 0.25);
      filt.lean = damp(filt.lean, leanWant, 1.35, dt);
      const lean = filt.lean;
      const hips = node("hips");
      if (hips && rest.get(hips)) {
        hips.position.x = hipRest.x + midX * 0.18 + stance * 0.07;
        hips.position.z = hipRest.z + 0.02 - 0.02 * reach;
        hips.position.y = hipRest.y + 0.015 * reach;
        _euler.set(-0.035 - 0.03 * reach, midX * 0.28 + stance * 0.22, stance * 0.18);
        hips.quaternion.copy(rest.get(hips)!).multiply(_q.setFromEuler(_euler));
        hips.updateMatrixWorld(true);
      }
      const spine = node("spine");
      if (spine && rest.get(spine)) {
        _euler.set(lean, midX * 0.2 + panX * 0.1, stance * 0.1);
        spine.quaternion.copy(rest.get(spine)!).multiply(_q.setFromEuler(_euler));
        spine.updateMatrixWorld(true);
      }
      const chest = node("chest");
      if (chest && rest.get(chest)) {
        _euler.set(-0.04 - 0.04 * reach + glance * 0.05 - air * fill, midX * 0.14 + panX * 0.1, stance * 0.06);
        chest.quaternion.copy(rest.get(chest)!).multiply(_q.setFromEuler(_euler));
        chest.updateMatrixWorld(true);
      } else {
        reset(node("chest"));
      }
      const upperChest = node("upperChest");
      if (upperChest && rest.get(upperChest)) {
        _euler.set(-0.02 * reach - air * 0.5 * fill, panX * 0.06 + midX * 0.06, stance * 0.03);
        upperChest.quaternion.copy(rest.get(upperChest)!).multiply(_q.setFromEuler(_euler));
        upperChest.updateMatrixWorld(true);
      }
      const lLeg = node("leftUpperLeg");
      const rLeg = node("rightUpperLeg");
      if (lLeg && rest.get(lLeg)) {
        _euler.set(stance > 0.08 ? 0.32 : 0.08 + spread * 0.05, 0, stance * 0.08);
        lLeg.quaternion.copy(rest.get(lLeg)!).multiply(_q.setFromEuler(_euler));
      }
      if (rLeg && rest.get(rLeg)) {
        _euler.set(stance < -0.08 ? 0.32 : 0.08 + spread * 0.05, 0, stance * 0.08);
        rLeg.quaternion.copy(rest.get(rLeg)!).multiply(_q.setFromEuler(_euler));
      }
      const shL = node("leftShoulder");
      const shR = node("rightShoulder");
      const handSpan = THREE.MathUtils.clamp(Math.abs(_smoothL.x - _smoothR.x) * 2.4, 0, 1);
      const liftL = THREE.MathUtils.clamp((_smoothL.y - 1.05) * 4, -0.35, 0.55);
      const liftR = THREE.MathUtils.clamp((_smoothR.y - 1.05) * 4, -0.35, 0.55);
      if (shL && rest.get(shL)) {
        const yaw = 0.12 * panX + 0.16 * midX + 0.18 * handSpan;
        const shrug = 0.04 + 0.12 * Math.max(0, liftL) + 0.05 * glance + air * 0.4 * fill;
        const roll = -0.06 - 0.1 * Math.max(0, liftL);
        _euler.set(-0.04 - 0.06 * reach + liftL * 0.08, yaw, -shrug + roll * 0.2);
        shL.quaternion.copy(rest.get(shL)!).multiply(_q.setFromEuler(_euler));
        shL.updateMatrixWorld(true);
      }
      if (shR && rest.get(shR)) {
        const yaw = -0.12 * panX - 0.16 * midX - 0.18 * handSpan;
        const shrug = 0.04 + 0.12 * Math.max(0, liftR) + 0.05 * glance + air * 0.4 * fill;
        const roll = 0.06 + 0.1 * Math.max(0, liftR);
        _euler.set(-0.04 - 0.06 * reach + liftR * 0.08, yaw, shrug + roll * 0.2);
        shR.quaternion.copy(rest.get(shR)!).multiply(_q.setFromEuler(_euler));
        shR.updateMatrixWorld(true);
      }
      L.upper?.updateMatrixWorld(true);
      R.upper?.updateMatrixWorld(true);
      L.upper?.getWorldPosition(_shL);
      R.upper?.getWorldPosition(_shR);

      solveArm(L, _smoothL, upperL, lowerL, spread);
      solveArm(R, _smoothR, upperR, lowerR, spread);

      const fd = glassFingerDir();
      _fingerDir.set(fd.x, fd.y, fd.z);
      const aimHand = (hand: THREE.Object3D | null, wrist: THREE.Vector3) => {
        if (!hand) return;
        const restAim = aim.get(hand);
        if (!restAim) return;
        _tip.copy(wrist).addScaledVector(_fingerDir, 0.1);
        const seated = projectToGlass(_tip.x, _tip.y, _tip.z, 0.01);
        _tip.set(seated.x, seated.y, seated.z);
        aimBone(hand, restAim, _tip);
      };
      aimHand(L.hand, _smoothL);
      aimHand(R.hand, _smoothR);

      const seed = state.seed ?? 1;
      poseHand("left", hl.pose, state.time, seed, filt.open);
      poseHand("right", hr.pose, state.time, seed ^ 0x9e37, filt.open);

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
          (1 - wall) * (-0.06 - aimY * 0.1 + Math.sin(t * 0.18) * 0.02) +
          wall * (0.02 + stretch * 0.2) +
          stretch * -0.02 -
          air * 0.15 * fill;
        const roll = Math.sin(t * 0.14) * 0.025 + stance * 0.04 + stretch * glanceDir * 0.06;
        _euler.set(pitch, yaw, roll);
        neck.quaternion.copy(rest.get(neck)!).multiply(_q.setFromEuler(_euler));
      }
      if (head && rest.get(head)) {
        head.scale.setScalar(1);
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
