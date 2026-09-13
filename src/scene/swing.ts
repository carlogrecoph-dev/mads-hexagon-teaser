import * as THREE from "three";

/**
 * Secondary motion: the things that follow, late.
 *
 * Hair and a skirt are not attached to the skeleton, they hang off it. When
 * she turns, they stay behind for a moment and then catch up and overshoot.
 * Without that every strand is welded to the skull and the whole figure reads
 * as one rigid object no matter how good the arms are.
 *
 * The model is a pendulum in the anchor's own frame: gravity pulls the mass
 * down, a spring keeps it near its rest direction, damping bleeds the swing
 * out, and the acceleration of the anchor appears as the pseudo-force that
 * actually does the work — the whip when the head turns.
 *
 * Integration is sub-stepped at a fixed rate, and the whole thing is reset the
 * moment the playhead jumps, so an export that starts at frame 0 and advances
 * one frame at a time always produces the same swing.
 */

export interface SwingOpts {
  /** How hard it is pulled back towards hanging straight down, per second². */
  stiffness: number;
  /** How fast the swing dies out. */
  damping: number;
  /** How much of the anchor's acceleration the mass feels. */
  inertia: number;
  /** Hard limit on how far it may swing from rest, radians. */
  limit: number;
}

export interface Swing {
  dir: THREE.Vector3;
  vel: THREE.Vector3;
  anchor: THREE.Vector3;
  anchorVel: THREE.Vector3;
  live: boolean;
}

const REST = new THREE.Vector3(0, -1, 0);
const _acc = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _axis = new THREE.Vector3();

export function createSwing(): Swing {
  return {
    dir: REST.clone(),
    vel: new THREE.Vector3(),
    anchor: new THREE.Vector3(),
    anchorVel: new THREE.Vector3(),
    live: false,
  };
}

export function resetSwing(swing: Swing, anchorWorld: THREE.Vector3) {
  swing.dir.copy(REST);
  swing.vel.set(0, 0, 0);
  swing.anchor.copy(anchorWorld);
  swing.anchorVel.set(0, 0, 0);
  swing.live = true;
}

/**
 * Advance one frame and return the current hang direction, world space.
 * `snap` re-seats everything — call it whenever time has jumped.
 */
export function stepSwing(
  swing: Swing,
  anchorWorld: THREE.Vector3,
  dt: number,
  opts: SwingOpts,
  snap = false,
): THREE.Vector3 {
  if (snap || !swing.live) {
    resetSwing(swing, anchorWorld);
    return swing.dir;
  }
  const step = Math.max(1e-4, dt);

  // how fast the anchor is moving, and how fast that is changing
  _v.copy(anchorWorld).sub(swing.anchor).divideScalar(step);
  _acc.copy(_v).sub(swing.anchorVel).divideScalar(step);
  swing.anchor.copy(anchorWorld);
  swing.anchorVel.copy(_v);

  // keep the integrator inside its stability window whatever the frame rate
  const omega = Math.sqrt(Math.max(1e-4, opts.stiffness));
  const sub = Math.min(12, Math.max(1, Math.ceil((omega * step) / 0.2)));
  const h = step / sub;

  for (let i = 0; i < sub; i++) {
    // spring back to hanging, minus the pseudo-force of the anchor's motion
    _f.copy(REST).sub(swing.dir).multiplyScalar(opts.stiffness);
    _f.addScaledVector(swing.vel, -opts.damping);
    _f.addScaledVector(_acc, -opts.inertia);
    // only the part perpendicular to the strand can swing it
    _f.addScaledVector(swing.dir, -_f.dot(swing.dir));
    swing.vel.addScaledVector(_f, h);
    swing.dir.addScaledVector(swing.vel, h);
    if (swing.dir.lengthSq() < 1e-8) swing.dir.copy(REST);
    swing.dir.normalize();
    // strip any velocity along the strand: it cannot stretch
    swing.vel.addScaledVector(swing.dir, -swing.vel.dot(swing.dir));
  }

  // and it is hair, not a flail
  const cosLimit = Math.cos(opts.limit);
  const dot = swing.dir.dot(REST);
  if (dot < cosLimit) {
    _axis.crossVectors(REST, swing.dir);
    if (_axis.lengthSq() > 1e-10) {
      _axis.normalize();
      swing.dir.copy(REST).applyAxisAngle(_axis, opts.limit);
      swing.vel.multiplyScalar(0.4);
    }
  }
  return swing.dir;
}

const _q = new THREE.Quaternion();
const _parent = new THREE.Quaternion();

/**
 * Turn a world hang direction into the local rotation a bone-parented group
 * needs so that its own "down" points that way.
 */
export function applySwing(group: THREE.Object3D, dir: THREE.Vector3, blend = 1) {
  const parent = group.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_parent);
  _q.setFromUnitVectors(REST, dir);
  _parent.invert().multiply(_q);
  if (blend >= 1) group.quaternion.copy(_parent);
  else group.quaternion.slerp(_parent, blend);
}
