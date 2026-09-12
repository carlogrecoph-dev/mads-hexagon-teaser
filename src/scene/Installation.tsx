import { HEX, monitorAngle } from "@/engine/config";
import { clamp, damp, lerp } from "@/engine/math";
import { publicUrl } from "@/lib/asset";
import { runtime } from "./runtime";
import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function useTex(url: string, repeat?: [number, number]) {
  const tex = useLoader(THREE.TextureLoader, url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function Truss({ steelMap }: { steelMap: THREE.Texture }) {
  const y = 2.72;
  const r = HEX.radius + 0.18;
  const beams = useMemo(() => {
    const out: { pos: [number, number, number]; rot: number; len: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a0 = monitorAngle(i + 1);
      const a1 = monitorAngle(i + 2 > 6 ? 1 : i + 2);
      const x0 = Math.sin(a0) * r;
      const z0 = Math.cos(a0) * r;
      const x1 = Math.sin(a1) * r;
      const z1 = Math.cos(a1) * r;
      out.push({
        pos: [(x0 + x1) / 2, y, (z0 + z1) / 2],
        rot: Math.atan2(x1 - x0, z1 - z0),
        len: Math.hypot(x1 - x0, z1 - z0),
      });
    }
    return out;
  }, []);

  const steel = useMemo(
    () => new THREE.MeshBasicMaterial({ map: steelMap, color: "#7a8088" }),
    [steelMap],
  );
  const led = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e63b8a", toneMapped: false }), []);

  return (
    <group>
      {beams.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={[0, b.rot, 0]} material={steel}>
          <boxGeometry args={[0.07, 0.09, b.len]} />
        </mesh>
      ))}
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const a = monitorAngle(i);
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        return (
          <group key={`p${i}`}>
            <mesh position={[x, y * 0.5, z]} material={steel}>
              <boxGeometry args={[0.06, y, 0.06]} />
            </mesh>
            <mesh position={[x, 0.05, z]} material={steel}>
              <boxGeometry args={[0.16, 0.08, 0.16]} />
            </mesh>
            <mesh position={[x * 0.97, y - 0.04, z * 0.97]} material={led}>
              <boxGeometry args={[0.018, 0.018, 0.22]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function PhotographicLights() {
  return (
    <>
      <directionalLight
        position={[0.4, 6.2, -1.4]}
        intensity={0.004}
        color="#c8d0da"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[0, 1.4, HEX.personZ - 0.55]} intensity={0.003} distance={1.8} color="#b8b2aa" />
    </>
  );
}

function RimLights() {
  const face = useRef<THREE.SpotLight>(null);
  const bounce = useRef<THREE.SpotLight>(null);
  const tgt = useRef<THREE.Object3D>(null);
  const follow = useRef({ x: 0, y: 1.55, z: HEX.personZ as number, lx: -0.4, ly: 1.6, lz: HEX.personZ + 0.4 });

  useFrame((_, dt) => {
    const t = tgt.current;
    const f = face.current;
    const b = bounce.current;
    if (!t || !f || !b) return;
    const h = runtime.head;
    const step = clamp(dt, 1 / 120, 0.05);
    const g = follow.current;
    g.x = damp(g.x, h.x, 9, step);
    g.y = damp(g.y, h.y, 9, step);
    g.z = damp(g.z, h.z, 9, step);
    t.position.set(g.x, g.y, g.z);
    t.updateMatrixWorld();

    const cam = runtime.lastState?.camera.position ?? { x: 0, y: 4.2, z: -0.5 };
    const topK = clamp((cam.y - 2.05) / 2.05, 0, 1);
    const side = clamp(cam.x / 1.35, -1, 1);
    const wantLx = g.x - side * lerp(0.5, 0.08, topK);
    const wantLy = g.y + lerp(0.05, -0.4, topK);
    const wantLz = g.z + lerp(0.46, 0.2, topK);
    g.lx = damp(g.lx, wantLx, 6, step);
    g.ly = damp(g.ly, wantLy, 6, step);
    g.lz = damp(g.lz, wantLz, 6, step);
    f.position.set(g.lx, g.ly, g.lz);
    f.target = t;
    b.position.set(g.x * 0.3, 1.16, HEX.tableZ + 0.06);
    b.target = t;

    const c = runtime.avgColor;
    f.color.setRGB(0.62 + c.r * 0.28, 0.28 + c.g * 0.2, 0.24 + c.b * 0.18);
    b.color.copy(f.color);
    f.intensity = lerp(1.05, 0.72, topK);
    b.intensity = lerp(0.22, 0.55, topK);
  }, 1);

  return (
    <>
      <object3D ref={tgt} position={[0, 1.55, HEX.personZ]} />
      <spotLight
        ref={face}
        position={[-0.48, 1.6, HEX.personZ + 0.46]}
        intensity={1.05}
        angle={0.155}
        penumbra={0.72}
        distance={1.7}
        decay={1.35}
        color="#8a4450"
      />
      <spotLight
        ref={bounce}
        position={[0, 1.16, HEX.tableZ]}
        intensity={0.28}
        angle={0.55}
        penumbra={0.88}
        distance={1.8}
        decay={1.5}
        color="#8a4450"
      />
    </>
  );
}

function StudioFloor({ map }: { map: THREE.Texture }) {
  const hexR = HEX.radius + 0.48;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[HEX.floorSize / 2, 96]} />
        <meshBasicMaterial map={map} color="#c4bbb0" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 6]} position={[0, 0.006, 0]}>
        <ringGeometry args={[hexR, hexR + 0.028, 6]} />
        <meshBasicMaterial color="#e63b8a" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 6]} position={[0, 0.007, 0]}>
        <ringGeometry args={[hexR + 0.05, hexR + 0.062, 6]} />
        <meshBasicMaterial color="#3de0d0" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[6.12, 6.22, 72]} />
        <meshBasicMaterial color="#e63b8a" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[6.28, 6.34, 72]} />
        <meshBasicMaterial color="#2ad4c8" toneMapped={false} />
      </mesh>
    </group>
  );
}

function FlightCase({
  position,
  size,
  yaw,
  body,
  trim,
}: {
  position: [number, number, number];
  size: [number, number, number];
  yaw: number;
  body: THREE.Material;
  trim: THREE.Material;
}) {
  const [w, h, d] = size;
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh material={body}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh position={[0, h * 0.5 + 0.008, 0]} material={trim}>
        <boxGeometry args={[w * 0.92, 0.012, d * 0.92]} />
      </mesh>
      <mesh position={[0, 0, d * 0.5 + 0.006]} material={trim}>
        <boxGeometry args={[w * 0.2, 0.04, 0.012]} />
      </mesh>
    </group>
  );
}

function Practical({
  position,
  steel,
  lamp,
}: {
  position: [number, number, number];
  steel: THREE.Material;
  lamp: THREE.Material;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.9, 0]} material={steel}>
        <cylinderGeometry args={[0.018, 0.022, 1.8, 8]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} material={steel}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 10]} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.16, 0.03, Math.cos(a) * 0.16]} rotation={[0.15, a, 0]} material={steel}>
          <boxGeometry args={[0.03, 0.025, 0.28]} />
        </mesh>
      ))}
      <mesh position={[0, 1.86, 0]} material={steel}>
        <cylinderGeometry args={[0.09, 0.14, 0.16, 12]} />
      </mesh>
      <mesh position={[0, 1.78, 0]} material={lamp}>
        <sphereGeometry args={[0.055, 12, 8]} />
      </mesh>
    </group>
  );
}

function WorkshopSet({ wallMap, steelMap }: { wallMap: THREE.Texture; steelMap: THREE.Texture }) {
  const steel = useMemo(
    () => new THREE.MeshBasicMaterial({ map: steelMap, color: "#6a6e76" }),
    [steelMap],
  );
  const crate = useMemo(() => new THREE.MeshBasicMaterial({ color: "#14161c" }), []);
  const trim = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e63b8a" }), []);
  const lamp = useMemo(() => new THREE.MeshBasicMaterial({ color: "#3de0d0", toneMapped: false }), []);
  const cases: { pos: [number, number, number]; size: [number, number, number]; yaw: number }[] = [
    { pos: [-3.7, 0.3, -1.2], size: [0.95, 0.6, 0.58], yaw: 0.2 },
    { pos: [3.55, 0.24, 0.85], size: [0.78, 0.48, 0.52], yaw: -0.4 },
    { pos: [-3.25, 0.2, 2.45], size: [0.58, 0.4, 0.72], yaw: 0.7 },
    { pos: [3.3, 0.18, -2.35], size: [0.52, 0.36, 0.5], yaw: -0.25 },
    { pos: [-4.1, 0.14, 0.6], size: [0.42, 0.28, 0.42], yaw: 0.1 },
  ];

  return (
    <group>
      <mesh position={[0, 2.65, 0]}>
        <cylinderGeometry args={[6.5, 6.5, 5.4, 64, 1, true]} />
        <meshBasicMaterial map={wallMap} side={THREE.BackSide} color="#b8b2aa" />
      </mesh>
      <mesh position={[0, 5.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6.6, 48]} />
        <meshBasicMaterial color="#2a2c32" />
      </mesh>
      {[-2.55, 0, 2.55].map((x) => (
        <mesh key={x} position={[x, 5.22, 0]} material={steel}>
          <boxGeometry args={[0.16, 0.12, 9.2]} />
        </mesh>
      ))}
      {[-2.2, 2.2].map((z) => (
        <mesh key={`z${z}`} position={[0, 5.22, z]} material={steel}>
          <boxGeometry args={[9.2, 0.1, 0.14]} />
        </mesh>
      ))}
      {cases.map((c, i) => (
        <FlightCase key={i} position={c.pos} size={c.size} yaw={c.yaw} body={crate} trim={trim} />
      ))}
      <Practical position={[-4.05, 0, -0.55]} steel={steel} lamp={lamp} />
      <Practical position={[4.15, 0, 2.05]} steel={steel} lamp={lamp} />
      <Practical position={[-4.2, 0, 2.7]} steel={steel} lamp={lamp} />
      <Practical position={[4.0, 0, -2.55]} steel={steel} lamp={lamp} />
    </group>
  );
}

export function Installation() {
  const floorMap = useTex(publicUrl("brand/studio-floor.jpg"));
  const wallMap = useTex(publicUrl("brand/studio-wall.jpg"), [2.2, 1]);
  const steelMap = useTex(publicUrl("brand/studio-steel.jpg"), [2, 2]);
  return (
    <>
      <color attach="background" args={["#1c1a18"]} />
      <PhotographicLights />
      <RimLights />
      <StudioFloor map={floorMap} />
      <WorkshopSet wallMap={wallMap} steelMap={steelMap} />
      <Truss steelMap={steelMap} />
    </>
  );
}
