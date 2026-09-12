import * as THREE from "three";
import { clamp } from "@/engine/math";

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _pole = new THREE.Vector3();
const _ortho = new THREE.Vector3();
const _elbow = new THREE.Vector3();

/** Place a Y-aligned mesh so it spans from → to. */
export function placeBetween(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, yLen = 1) {
  _mid.copy(from).lerp(to, 0.5);
  obj.position.copy(_mid);
  _dir.copy(to).sub(from);
  const len = _dir.length();
  if (len < 1e-5) return len;
  _dir.multiplyScalar(1 / len);
  _quat.setFromUnitVectors(_up, _dir);
  obj.quaternion.copy(_quat);
  obj.scale.set(1, len / yLen, 1);
  return len;
}

export function solveElbow(
  shoulder: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  outElbow: THREE.Vector3,
) {
  _dir.copy(target).sub(shoulder);
  const dist = clamp(_dir.length(), 0.04, upperLen + lowerLen - 0.01);
  _dir.normalize();
  const cosA = clamp(
    (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist),
    -1,
    1,
  );
  const ang = Math.acos(cosA);
  _pole.copy(pole).sub(shoulder);
  _ortho.copy(_dir).cross(_pole);
  if (_ortho.lengthSq() < 1e-6) {
    _ortho.set(1, 0, 0).cross(_dir);
  }
  _ortho.normalize();
  _pole.copy(_dir).cross(_ortho).normalize(); // bend toward pole
  outElbow.copy(shoulder).addScaledVector(_dir, Math.cos(ang) * upperLen);
  outElbow.addScaledVector(_pole, Math.sin(ang) * upperLen);
  return outElbow;
}

export function lookAlong(obj: THREE.Object3D, origin: THREE.Vector3, target: THREE.Vector3) {
  obj.position.copy(origin);
  _from.copy(target).sub(origin);
  if (_from.lengthSq() < 1e-8) return;
  obj.lookAt(target);
}

const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();

export function placeBetweenLocal(
  obj: THREE.Object3D,
  parent: THREE.Object3D,
  fromWorld: THREE.Vector3,
  toWorld: THREE.Vector3,
) {
  _la.copy(fromWorld);
  _lb.copy(toWorld);
  parent.worldToLocal(_la);
  parent.worldToLocal(_lb);
  return placeBetween(obj, _la, _lb);
}
