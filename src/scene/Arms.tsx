import { HEX } from "@/engine/config";
import { clamp, damp } from "@/engine/math";
import type { GestureId, TeaserState } from "@/engine/types";
import { placeBetweenLocal, solveElbow } from "./ik";
import { runtime } from "./runtime";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

const UPPER = 0.38;
const LOWER = 0.34;
const _sL = new THREE.Vector3();
const _sR = new THREE.Vector3();
const _tL = new THREE.Vector3();
const _tR = new THREE.Vector3();
const _pL = new THREE.Vector3();
const _pR = new THREE.Vector3();
const _eL = new THREE.Vector3();
const _eR = new THREE.Vector3();
const _smoothL = new THREE.Vector3();
const _smoothR = new THREE.Vector3();
let _armed = false;
let _lastT = 0;
let _open = 0;

function curlFor(pose: GestureId, i: number) {
  if (pose === "DETAIL_POINT" && i === 1) return 0.02;
  if (pose === "DETAIL_POINT") return 0.58;
  if (pose === "PINCH") return 0.42;
  if (pose === "SPREAD") return 0.05;
  if (pose === "RETURN") return 0.28;
  return 0.18;
}

function Hand({ side, skin }: { side: "left" | "right"; skin: THREE.Material }) {
  const fingers = useRef<(THREE.Group | null)[]>([]);
  const joints = useRef<(THREE.Group | null)[]>([]);
  const s = side === "left" ? 1 : -1;

  useFrame((_, dt) => {
    const spread = runtime.lastState?.interaction.spread ?? 0.4;
    const k = 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < 4; i++) {
      const g = fingers.current[i];
      const j = joints.current[i];
      if (!g) continue;
      const targetX = (i - 1.5) * (0.012 + spread * 0.016);
      g.position.x += (targetX - g.position.x) * k;
      const c = 0.72 * (1 - spread) + 0.04 * spread + i * 0.04 * (1 - spread);
      g.rotation.x += (c * 0.85 - g.rotation.x) * k;
      if (j) j.rotation.x += (c * 1.05 - j.rotation.x) * k;
    }
  });

  return (
    <group scale={0.92} rotation={[-0.04, 0, s * 0.05]}>
      <mesh material={skin} castShadow scale={[1.02, 0.36, 1.18]}>
        <sphereGeometry args={[0.042, 16, 12]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          ref={(el) => {
            fingers.current[i] = el;
          }}
          position={[(i - 1.5) * 0.016, 0.003, 0.034]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} material={skin} castShadow>
            <capsuleGeometry args={[0.0066, 0.02, 4, 8]} />
          </mesh>
          <group
            ref={(el) => {
              joints.current[i] = el;
            }}
            position={[0, 0, 0.016]}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]} material={skin} castShadow>
              <capsuleGeometry args={[0.0058, 0.015, 4, 8]} />
            </mesh>
          </group>
        </group>
      ))}
      <mesh
        position={[s * 0.034, 0.002, 0.004]}
        rotation={[0.48, s * 0.85, s * 0.1]}
        material={skin}
        castShadow
      >
        <capsuleGeometry args={[0.0074, 0.026, 4, 8]} />
      </mesh>
    </group>
  );
}

export function Arms({ sleeve, skin }: { sleeve: THREE.Material; skin: THREE.Material }) {
  const root = useRef<THREE.Group>(null);
  const upperL = useRef<THREE.Mesh>(null);
  const lowerL = useRef<THREE.Mesh>(null);
  const upperR = useRef<THREE.Mesh>(null);
  const lowerR = useRef<THREE.Mesh>(null);
  const handL = useRef<THREE.Group>(null);
  const handR = useRef<THREE.Group>(null);
  const shoulderL = useRef<THREE.Group>(null);
  const shoulderR = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    runtime.applyCharacter = (state: TeaserState) => {
      const group = root.current;
      if (!group) return;
      const ls = shoulderL.current;
      const rs = shoulderR.current;
      if (!ls || !rs) return;
      ls.getWorldPosition(_sL);
      rs.getWorldPosition(_sR);
      const tgtL = state.hands.left;
      const tgtR = state.hands.right;
      const t = state.time;
      if (!_armed || t + 1e-4 < _lastT) {
        _smoothL.set(tgtL.x, tgtL.y, tgtL.z);
        _smoothR.set(tgtR.x, tgtR.y, tgtR.z);
        _open = state.interaction.spread;
        _armed = true;
        _lastT = t;
      } else {
        const dt = clamp(t - _lastT, 1 / 120, 0.08);
        _lastT = t;
        const a = 1 - Math.exp(-5.2 * dt);
        _tL.set(tgtL.x, tgtL.y, tgtL.z);
        _tR.set(tgtR.x, tgtR.y, tgtR.z);
        _smoothL.lerp(_tL, a);
        _smoothR.lerp(_tR, a);
        _open = damp(_open, state.interaction.spread, 2.6, dt);
      }
      _tL.copy(_smoothL);
      _tR.copy(_smoothR);
      const open = _open;
      _pL.set(-0.35 - 0.25 * open, 1.05 + 0.08 * open, HEX.personZ + 0.12);
      _pR.set(0.35 + 0.25 * open, 1.05 + 0.08 * open, HEX.personZ + 0.12);
      solveElbow(_sL, _tL, _pL, UPPER, LOWER, _eL);
      solveElbow(_sR, _tR, _pR, UPPER, LOWER, _eR);
      if (upperL.current) placeBetweenLocal(upperL.current, group, _sL, _eL);
      if (lowerL.current) placeBetweenLocal(lowerL.current, group, _eL, _tL);
      if (upperR.current) placeBetweenLocal(upperR.current, group, _sR, _eR);
      if (lowerR.current) placeBetweenLocal(lowerR.current, group, _eR, _tR);

      const tilt = HEX.tableTilt;
      if (handL.current) {
        const p = _tL.clone();
        group.worldToLocal(p);
        handL.current.position.copy(p);
        handL.current.rotation.set(-Math.PI / 2 + tilt + 0.1, 0.1, 0.08);
      }
      if (handR.current) {
        const p = _tR.clone();
        group.worldToLocal(p);
        handR.current.position.copy(p);
        const point = state.hands.right.pose === "DETAIL_POINT" ? 0.22 : 0.1;
        handR.current.rotation.set(-Math.PI / 2 + tilt + point, -0.1, -0.08);
      }
    };
  });

  useFrame(() => {
    const s = runtime.lastState;
    if (s) runtime.applyCharacter(s);
  });

  return (
    <group ref={root}>
      <group ref={shoulderL} position={[-0.17, 1.39, 0.05]} />
      <group ref={shoulderR} position={[0.17, 1.39, 0.05]} />
      <mesh ref={upperL} material={sleeve} castShadow>
        <cylinderGeometry args={[0.032, 0.042, 1, 14]} />
      </mesh>
      <mesh ref={lowerL} material={sleeve} castShadow>
        <cylinderGeometry args={[0.026, 0.032, 1, 14]} />
      </mesh>
      <mesh ref={upperR} material={sleeve} castShadow>
        <cylinderGeometry args={[0.032, 0.042, 1, 14]} />
      </mesh>
      <mesh ref={lowerR} material={sleeve} castShadow>
        <cylinderGeometry args={[0.026, 0.032, 1, 14]} />
      </mesh>
      <group ref={handL}>
        <Hand side="left" skin={skin} />
      </group>
      <group ref={handR}>
        <Hand side="right" skin={skin} />
      </group>
    </group>
  );
}
