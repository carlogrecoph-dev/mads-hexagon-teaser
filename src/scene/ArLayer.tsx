import { HEX, CAMERA_PRESETS, monitorAngle } from "@/engine/config";
import { useStudio } from "@/store/studio";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { runtime } from "./runtime";

const LIME = "#c8f542";
const MAGENTA = "#e83a7a";

function labelTexture(text: string, color: string, size = 256) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.font = `600 ${size * 0.52}px Outfit, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.strokeText(text, size / 2, size / 2 + size * 0.04);
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function SpriteLabel({
  text,
  color,
  position,
  scale = 0.28,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  scale?: number;
}) {
  const tex = useMemo(() => labelTexture(text, color), [text, color]);
  return (
    <sprite position={position} scale={[scale, scale, scale]} renderOrder={20}>
      <spriteMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function HexGrid() {
  const { ring, spokes } = useMemo(() => {
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      ringPts.push(new THREE.Vector3(Math.sin(a) * HEX.radius, 0.018, Math.cos(a) * HEX.radius));
    }
    const ring = new THREE.BufferGeometry().setFromPoints(ringPts);
    const spokePts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      spokePts.push(new THREE.Vector3(0, 0.018, 0));
      spokePts.push(new THREE.Vector3(Math.sin(a) * HEX.radius, 0.018, Math.cos(a) * HEX.radius));
    }
    const spokes = new THREE.BufferGeometry().setFromPoints(spokePts);
    return { ring, spokes };
  }, []);
  return (
    <group>
      <lineLoop geometry={ring}>
        <lineBasicMaterial color={LIME} transparent opacity={0.55} />
      </lineLoop>
      <lineSegments geometry={spokes}>
        <lineBasicMaterial color={LIME} transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}

function MonitorTags() {
  const items = useMemo(() => {
    const out: { n: string; pos: [number, number, number] }[] = [];
    for (let i = 1; i <= 6; i++) {
      const a = monitorAngle(i);
      const r = HEX.radius - 0.14;
      const tilt = HEX.inwardTilt;
      const y = HEX.outerCenterY + HEX.screen75.height * 0.32 * Math.cos(tilt);
      out.push({
        n: String(i),
        pos: [Math.sin(a) * r, y, Math.cos(a) * r],
      });
    }
    out.push({ n: "7", pos: [0, HEX.tableHeight + 0.08, HEX.tableZ + 0.12] });
    return out;
  }, []);
  return (
    <>
      {items.map((it) => (
        <SpriteLabel key={it.n} text={it.n} color="#ffffff" position={it.pos} scale={0.26} />
      ))}
    </>
  );
}

function CameraRigs() {
  const pulse = useRef(0);
  const top = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const left = useRef<THREE.Mesh>(null);

  useFrame((_, d) => {
    pulse.current += d;
    const s = 1 + Math.sin(pulse.current * 3) * 0.12;
    const lock = runtime.cameraLock;
    if (top.current) top.current.scale.setScalar(lock === "top" ? s * 1.25 : 1);
    if (right.current) right.current.scale.setScalar(lock === "right" ? s * 1.25 : 1);
    if (left.current) left.current.scale.setScalar(lock === "left" ? s * 1.25 : 1);
  });

  const t = CAMERA_PRESETS.top.position;
  const r = CAMERA_PRESETS.right.position;
  const l = CAMERA_PRESETS.left.position;
  return (
    <group>
      <mesh ref={top} position={[t.x, t.y, t.z]}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color={LIME} toneMapped={false} />
      </mesh>
      <SpriteLabel text="TOP" color={LIME} position={[t.x, t.y + 0.14, t.z]} scale={0.32} />
      <mesh ref={right} position={[r.x, r.y, r.z]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={MAGENTA} toneMapped={false} />
      </mesh>
      <SpriteLabel text="R" color={MAGENTA} position={[r.x, r.y + 0.12, r.z]} scale={0.22} />
      <mesh ref={left} position={[l.x, l.y, l.z]}>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshBasicMaterial color={MAGENTA} toneMapped={false} />
      </mesh>
      <SpriteLabel text="L" color={MAGENTA} position={[l.x, l.y + 0.12, l.z]} scale={0.22} />
    </group>
  );
}

function ToyOrbit() {
  const enabled = useStudio((s) => s.toyMode);
  return (
    <OrbitControls
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      target={[0, 0.92, 0.08]}
      minDistance={1.35}
      maxDistance={7.5}
      maxPolarAngle={Math.PI / 2.05}
      enablePan={false}
      makeDefault={enabled}
    />
  );
}

export function ArLayer() {
  const overlay = useStudio((s) => s.arOverlay);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) group.current.visible = overlay && !runtime.exporting;
  });
  return (
    <>
      <group ref={group} visible={overlay}>
        <HexGrid />
        <MonitorTags />
        <CameraRigs />
      </group>
      <ToyOrbit />
    </>
  );
}
