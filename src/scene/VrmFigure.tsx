import { runtime } from "./runtime";
import { createVrmRig, type VrmRig } from "./vrmIk";
import { bootWork } from "@/engine/operator";
import type { TeaserState } from "@/engine/types";
import { DEFAULT_SETTINGS } from "@/engine/types";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { dressBodice, dressSkirt, mangaWig } from "./wardrobe";
import * as THREE from "three";

type VrmHumanoid = {
  getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
  getRawBoneNode?: (name: string) => THREE.Object3D | null;
  update?: () => void;
  autoUpdateHumanBones?: boolean;
};

type VrmHandle = {
  scene: THREE.Object3D;
  humanoid?: VrmHumanoid;
  lookAt?: { target?: THREE.Object3D | null };
};

const REPLACED = /tops_|bottoms_|onepiece|accessory_tie|shirt|uniform|sailor/;

interface FigureMeasure {
  slices: { y: number; x: number; z: number }[];
  skull: { centre: THREE.Vector3; radius: number } | null;
}

function measureFigure(root: THREE.Object3D): FigureMeasure {
  const BINS = 48;
  const wide = new Float32Array(BINS);
  const deep = new Float32Array(BINS);
  const hit = new Uint16Array(BINS);
  let lo = Infinity;
  let hi = -Infinity;
  const v = new THREE.Vector3();
  const skinMeshes: THREE.Mesh[] = [];
  let headBox: THREE.Box3 | null = null;

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const names = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const tag = `${mesh.name} ${names.map((m) => (m as THREE.Material)?.name ?? "").join(" ")}`.toLowerCase();
    if (/face|head/.test(tag) && !/body|hair/.test(tag)) {
      const pos = mesh.geometry.attributes.position;
      if (!pos) return;
      const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      box.applyMatrix4(mesh.matrixWorld);
      headBox = headBox ? headBox.union(box) : box;
      return;
    }
    if (/body|skin|cloth|tops|bottoms/.test(tag)) skinMeshes.push(mesh);
  });

  for (const mesh of skinMeshes) {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      lo = Math.min(lo, v.y);
      hi = Math.max(hi, v.y);
    }
  }
  if (!Number.isFinite(lo) || hi <= lo) return { slices: [], skull: null };

  for (const mesh of skinMeshes) {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const skinned = mesh as THREE.SkinnedMesh;
    const bones = skinned.skeleton?.bones ?? [];
    const limb = bones.map((b) => /arm|hand|shoulder|finger|thumb|index|middle|ring|little/i.test(b.name));
    const skinIndex = mesh.geometry.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const skinWeight = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute | undefined;
    const isLimb = (i: number) => {
      if (!skinIndex || !skinWeight || !bones.length) return false;
      let best = -1;
      let bestW = 0;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = skinIndex.getComponent(i, k);
        }
      }
      return best >= 0 && limb[best] === true;
    };
    for (let i = 0; i < pos.count; i++) {
      if (isLimb(i)) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const b = Math.min(BINS - 1, Math.max(0, Math.floor(((v.y - lo) / (hi - lo)) * BINS)));
      wide[b] = Math.max(wide[b]!, Math.abs(v.x));
      deep[b] = Math.max(deep[b]!, Math.abs(v.z));
      hit[b] = (hit[b] ?? 0) + 1;
    }
  }

  const slices: { y: number; x: number; z: number }[] = [];
  for (let b = 0; b < BINS; b++) {
    if (!hit[b]) continue;
    slices.push({ y: lo + ((b + 0.5) / BINS) * (hi - lo), x: wide[b]!, z: deep[b]! });
  }
  let skull: FigureMeasure["skull"] = null;
  if (headBox) {
    const box = headBox as THREE.Box3;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    skull = { centre, radius: Math.max(size.x, size.z) * 0.52 };
  }
  return { slices, skull };
}

function girthAt(m: FigureMeasure, y: number) {
  if (!m.slices.length) return { x: 0.11, z: 0.09 };
  let best = m.slices[0]!;
  let bestD = Math.abs(best.y - y);
  for (const s of m.slices) {
    const d = Math.abs(s.y - y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { x: Math.max(0.07, best.x), z: Math.max(0.055, best.z) };
}

function hideStock(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matName = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.name ?? "").join(" ")
      : ((mesh.material as THREE.Material | undefined)?.name ?? "");
    const label = `${mesh.name} ${matName}`.toLowerCase();
    const stockHair = /hair|kami|bang|kaminoke|chignon|braid/.test(label);
    const hairBack = /hairback|hair_back/.test(label);
    if (stockHair && !hairBack) mesh.visible = false;
    if (REPLACED.test(label)) mesh.visible = false;
    if (hairBack) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (!m?.color) continue;
        m.color.set("#14121b");
        if ("sheenColor" in m && m.sheenColor) (m.sheenColor as THREE.Color).set("#2b2036");
      }
    }
  });
}

function wearLook(root: THREE.Object3D, humanoid?: VrmHumanoid) {
  if (!humanoid) return;
  const bone = (n: string) => humanoid.getRawBoneNode?.(n) ?? humanoid.getNormalizedBoneNode(n);
  const head = bone("head");
  const chest = bone("upperChest") ?? bone("chest");
  const hips = bone("hips");
  root.updateMatrixWorld(true);
  const m = measureFigure(root);

  if (head && !head.getObjectByName("mangaWig")) {
    head.updateWorldMatrix(true, false);
    const scale = Math.max(1e-4, head.getWorldScale(new THREE.Vector3()).x);
    const radius = (m.skull?.radius ?? 0.11) / scale;
    const wig = mangaWig({ head: radius });
    if (m.skull) wig.position.copy(head.worldToLocal(m.skull.centre.clone()));
    else wig.position.set(0, 0.08, 0);
    const headQuat = head.getWorldQuaternion(new THREE.Quaternion());
    wig.quaternion.copy(headQuat.invert());
    head.add(wig);
  }

  if (!chest || !hips) return;
  if (chest.getObjectByName("dressBodice")) return;

  const world = (o: THREE.Object3D | null) => {
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(new THREE.Vector3());
  };
  const hipsW = world(hips)!;
  const chestW = world(chest)!;
  const neckW = world(bone("neck")) ?? chestW.clone().setY(chestW.y + 0.11);
  const kneeW = world(bone("leftLowerLeg"));
  const footW = world(bone("leftFoot"));
  const chestScale = Math.max(1e-4, chest.getWorldScale(new THREE.Vector3()).x);
  const hipScale = Math.max(1e-4, hips.getWorldScale(new THREE.Vector3()).x);
  const EASE = 1.12;
  const ring = (attach: THREE.Object3D, scale: number, y: number, grow = 1): [number, number, number] => {
    const g = girthAt(m, y);
    const local = attach.worldToLocal(new THREE.Vector3(chestW.x, y, chestW.z)).y;
    return [local, (g.x * EASE * grow) / scale, (g.z * EASE * grow) / scale];
  };

  const shoulderY = neckW.y - (neckW.y - chestW.y) * 0.08;
  const bustY = chestW.y - (chestW.y - hipsW.y) * 0.16;
  const underY = chestW.y - (chestW.y - hipsW.y) * 0.38;
  const waistY = chestW.y - (chestW.y - hipsW.y) * 0.72;
  const hipY = hipsW.y;
  const topY = bustY + (shoulderY - bustY) * 0.7;

  const rings: [number, number, number][] = [
    ring(chest, chestScale, waistY, 1.04),
    ring(chest, chestScale, underY, 1.08),
    ring(chest, chestScale, bustY, 1.18),
    ring(chest, chestScale, topY, 1.02),
  ];
  const half = rings[2]![1];
  const depth = rings[2]![2];
  chest.add(
    dressBodice({
      rings,
      color: "#0c0c10",
      sheen: "#2a2a32",
      neck: 0,
      neckWidth: 0.2,
      halfWidth: half,
      straps: {
        front: [half * 0.38, rings[3]![0], depth * 0.9],
        over: [
          half * 0.85,
          chest.worldToLocal(new THREE.Vector3(chestW.x, shoulderY + (neckW.y - shoulderY) * 0.4, chestW.z)).y,
          0,
        ],
        back: [half * 0.5, rings[3]![0] - 0.02, -depth * 0.95],
      },
    }),
  );

  if (!hips.getObjectByName("dressSkirt")) {
    const knee = kneeW?.y ?? hipsW.y - 0.35;
    const hemY = knee - (knee - (footW?.y ?? knee - 0.2)) * 0.35;
    const hipRing = (y: number, grow: number): [number, number, number] => {
      const g = girthAt(m, y);
      const local = hips.worldToLocal(new THREE.Vector3(hipsW.x, y, hipsW.z)).y;
      return [local, (g.x * EASE * grow) / hipScale, (g.z * EASE * grow) / hipScale];
    };
    hips.add(
      dressSkirt({
        color: "#0c0c10",
        sheen: "#2a2a32",
        rings: [
          hipRing(hemY, 1.45),
          hipRing(hemY + (hipsW.y - hemY) * 0.4, 1.22),
          hipRing(hemY + (hipsW.y - hemY) * 0.75, 1.1),
          hipRing(hipY + (chestW.y - hipsW.y) * 0.08, 1.05),
        ],
      }),
    );
  }
}

function stylizeVrm(root: THREE.Object3D, humanoid?: VrmHumanoid) {
  hideStock(root);
  wearLook(root, humanoid);
}

export function VrmFigure({ url }: { url: string }) {
  const root = useRef<THREE.Group>(null);
  const vrmRef = useRef<VrmHandle | null>(null);
  const rigRef = useRef<VrmRig | null>(null);

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    let cancelled = false;
    const added: THREE.Object3D[] = [];
    let apply: ((state: TeaserState) => void) | null = null;
    void (async () => {
      try {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(url);
        if (cancelled) return;
        const vrm = gltf.userData.vrm as VrmHandle | undefined;
        const scene = vrm?.scene ?? gltf.scene;
        if (vrm) VRMUtils.rotateVRM0(vrm as never);
        VRMUtils.removeUnnecessaryVertices(scene);
        stylizeVrm(scene, vrm?.humanoid);
        scene.scale.setScalar(1.22);
        group.add(scene);
        added.push(scene);
        vrmRef.current = vrm ?? { scene };
        if (vrm?.lookAt) vrm.lookAt.target = null;
        if (vrm?.humanoid) {
          vrm.humanoid.autoUpdateHumanBones = false;
          scene.updateMatrixWorld(true);
          rigRef.current = createVrmRig(vrm.humanoid);
          const boot = bootWork(DEFAULT_SETTINGS, 0.6);
          runtime.lastState = boot;
          rigRef.current.apply(boot, false);
        }
        apply = (state: TeaserState) => {
          if (cancelled) return;
          try {
            rigRef.current?.apply(state, runtime.exporting);
          } catch {
            /* never kill the canvas */
          }
        };
        runtime.applyCharacter = apply;
      } catch (err) {
        console.warn("[hexagon] VRM load failed", err);
      }
    })();
    return () => {
      cancelled = true;
      vrmRef.current = null;
      rigRef.current = null;
      if (apply && runtime.applyCharacter === apply) runtime.applyCharacter = () => {};
      for (const obj of added) {
        group.remove(obj);
      }
    };
  }, [url]);

  useFrame(() => {
    const s = runtime.lastState ?? bootWork(DEFAULT_SETTINGS, runtime.playhead);
    if (!s || !rigRef.current) return;
    try {
      rigRef.current.apply(s, runtime.exporting);
    } catch {
      /* keep the girl on screen */
    }
  });

  return <group ref={root} />;
}
