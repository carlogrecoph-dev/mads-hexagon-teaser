import { runtime } from "./runtime";
import { createVrmRig, type VrmRig } from "./vrmIk";
import type { TeaserState } from "@/engine/types";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

type VrmHumanoid = {
  getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
  update?: () => void;
};

type VrmHandle = {
  scene: THREE.Object3D;
  humanoid?: VrmHumanoid;
  lookAt?: { target?: THREE.Object3D | null };
};

function paintTailleur(src: THREE.Texture) {
  const img = src.image as { width: number; height: number } | HTMLImageElement | ImageBitmap | undefined;
  if (!img || !("width" in img) || !img.width) return src;
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img as CanvasImageSource, 0, 0);
    const pix = ctx.getImageData(0, 0, c.width, c.height);
    const d = pix.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!,
        g = d[i + 1]!,
        b = d[i + 2]!,
        a = d[i + 3]!;
      if (a < 12) continue;
      const avg = (r + g + b) / 3;
      const isSkin = r > 88 && r > g + 6 && r > b + 10 && g > 42 && b > 28 && r < 250 && g - b < 55;
      const isLip = r > 110 && r > g + 20 && r > b + 15 && avg < 180;
      const isEyeWhite = avg > 200 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18;
      if (isSkin || isLip || isEyeWhite) continue;
      d[i] = 12;
      d[i + 1] = 12;
      d[i + 2] = 16;
    }
    ctx.putImageData(pix, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = src.colorSpace;
    t.flipY = src.flipY;
    t.wrapS = src.wrapS;
    t.wrapT = src.wrapT;
    t.minFilter = src.minFilter;
    t.magFilter = src.magFilter;
    t.needsUpdate = true;
    return t;
  } catch {
    return src;
  }
}

function clothMat(kind: "suit" | "hair" | "skin") {
  if (kind === "hair") {
    return new THREE.MeshPhysicalMaterial({
      color: "#0b0b0d",
      roughness: 0.22,
      metalness: 0.04,
      sheen: 0.22,
      sheenColor: new THREE.Color("#1a1a1e"),
      sheenRoughness: 0.28,
      clearcoat: 0.42,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.05,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.28,
    });
  }
  if (kind === "skin") {
    return new THREE.MeshPhysicalMaterial({
      color: "#c4a088",
      roughness: 0.5,
      metalness: 0.02,
      sheen: 0.26,
      sheenColor: new THREE.Color("#c9a88a"),
      sheenRoughness: 0.55,
      clearcoat: 0.04,
      clearcoatRoughness: 0.72,
      envMapIntensity: 0.03,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: "#0c0c0f",
    roughness: 0.4,
    metalness: 0.08,
    sheen: 0.38,
    sheenColor: new THREE.Color("#1c1c24"),
    sheenRoughness: 0.42,
    clearcoat: 0.08,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.04,
  });
}

function hairMat() {
  const hair = clothMat("hair");
  hair.transparent = false;
  hair.alphaTest = 0;
  hair.side = THREE.FrontSide;
  return hair;
}

function addBraid(
  parent: THREE.Group,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  beads: number,
) {
  const mid = a.clone().lerp(b, 0.5);
  const nrm = new THREE.Vector3().subVectors(b, a);
  const len = nrm.length() || 0.01;
  nrm.normalize();
  const side = Math.abs(nrm.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(nrm).normalize() : new THREE.Vector3(1, 0, 0);
  const up = nrm.clone().cross(side).normalize();
  for (let i = 0; i < beads; i++) {
    const t = i / (beads - 1);
    const p = a.clone().lerp(b, t);
    const lift = Math.sin(t * Math.PI) * len * 0.08;
    p.addScaledVector(up, lift);
    const weave = Math.sin(i * 2.15) * radius * 0.55;
    const weave2 = Math.cos(i * 2.15) * radius * 0.4;
    p.addScaledVector(side, weave);
    p.addScaledVector(up, weave2 * 0.35);
    const s = new THREE.Mesh(new THREE.SphereGeometry(radius * (1.05 - t * 0.18), 8, 6), mat);
    s.position.copy(p);
    s.castShadow = true;
    parent.add(s);
  }
  void mid;
}

function makeChignon() {
  const mat = hairMat();
  const g = new THREE.Group();
  g.name = "chignon";

  const scalp = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), mat);
  scalp.scale.set(1.05, 0.72, 1.12);
  scalp.position.set(0, 0.042, 0.0);
  scalp.castShadow = true;
  g.add(scalp);

  const hairline = 0.055;
  const rows = 7;
  for (let i = 0; i < rows; i++) {
    const u = (i / (rows - 1)) * 2 - 1;
    const from = new THREE.Vector3(u * 0.078, hairline, 0.078 - Math.abs(u) * 0.02);
    const to = new THREE.Vector3(u * 0.028, 0.1, -0.048);
    addBraid(g, mat, from, to, 0.011 + (1 - Math.abs(u)) * 0.004, 11);
  }
  for (const sign of [-1, 1]) {
    const from = new THREE.Vector3(sign * 0.09, 0.02, 0.04);
    const mid = new THREE.Vector3(sign * 0.07, 0.07, -0.02);
    const to = new THREE.Vector3(sign * 0.02, 0.1, -0.05);
    addBraid(g, mat, from, mid, 0.014, 8);
    addBraid(g, mat, mid, to, 0.013, 7);
  }

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 14), mat);
  core.scale.set(1.2, 0.9, 1.15);
  core.position.set(0, 0.11, -0.052);
  core.castShadow = true;
  g.add(core);
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 18), mat);
  wrap.rotation.x = Math.PI / 2;
  wrap.position.set(0, 0.102, -0.052);
  wrap.castShadow = true;
  g.add(wrap);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat);
    bead.position.set(Math.cos(a) * 0.058, 0.108 + Math.sin(a * 2) * 0.01, -0.052 + Math.sin(a) * 0.05);
    bead.castShadow = true;
    g.add(bead);
  }
  return g;
}

function makeLapel(sign: number) {
  const mat = clothMat("suit");
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.012), mat);
  mesh.position.set(sign * 0.055, 0.04, 0.07);
  mesh.rotation.set(-0.15, sign * 0.35, sign * 0.18);
  mesh.castShadow = true;
  return mesh;
}

function stylizeVrm(root: THREE.Object3D, humanoid?: VrmHumanoid) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const srcs = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const label = `${mesh.name} ${srcs.map((s) => (s as THREE.Material).name ?? "").join(" ")}`.toLowerCase();
    const hair = /hair|kami|bang|kaminoke/.test(label);
    const face = /face|head|noshade/.test(label) && !hair && !/body/.test(label);
    const hand = /hand|finger|thumb|index|nail/.test(label);
    const skin = face || hand;
    const eye = /eye|iris|pupil|highlight|kage/.test(label);
    const next = srcs.map((src) => {
      if (eye) return src;
      const s = src as THREE.MeshStandardMaterial & {
        map?: THREE.Texture;
        normalMap?: THREE.Texture;
        color?: THREE.Color;
        transparent?: boolean;
        alphaTest?: number;
        side?: THREE.Side;
      };
      const rawMap =
        s.map ??
        (s as unknown as { uniforms?: { map?: { value: THREE.Texture } } }).uniforms?.map?.value ??
        null;
      const mat = clothMat(hair ? "hair" : skin ? "skin" : "suit");
      if (rawMap) {
        mat.map = hair || !skin ? paintTailleur(rawMap) : rawMap;
        if (!skin && !hair) mat.color.set("#d8d8d8");
      }
      if (s.normalMap) mat.normalMap = s.normalMap;
      if (hair) {
        mat.color.set("#0a0a0c");
        mat.map = rawMap ? paintTailleur(rawMap) : null;
      } else if (skin) {
        if (s.color) mat.color.copy(s.color);
      } else if (!rawMap) {
        mat.color.set("#0c0c0f");
      }
      mat.transparent = Boolean(s.transparent || hair);
      mat.alphaTest = s.alphaTest || (hair ? 0.32 : 0);
      mat.side = hair ? THREE.DoubleSide : (s.side ?? THREE.FrontSide);
      return mat;
    });
    mesh.material = next.length === 1 ? next[0]! : next;
  });
  const head = humanoid?.getNormalizedBoneNode("head");
  if (head) {
    head.scale.setScalar(0.86);
    if (!head.getObjectByName("chignon")) head.add(makeChignon());
  }
  const hips = humanoid?.getNormalizedBoneNode("hips");
  if (hips) hips.scale.set(0.9, 1, 0.96);
  const chest = humanoid?.getNormalizedBoneNode("chest");
  if (chest && !chest.getObjectByName("lapelL")) {
    const l = makeLapel(-1);
    l.name = "lapelL";
    const r = makeLapel(1);
    r.name = "lapelR";
    chest.add(l, r);
  }
  for (const side of ["left", "right"] as const) {
    const leg = humanoid?.getNormalizedBoneNode(`${side}UpperLeg`);
    if (leg) leg.scale.set(0.88, 1.04, 0.92);
    const sh = humanoid?.getNormalizedBoneNode(`${side}Shoulder`);
    if (sh) sh.scale.set(1.06, 1, 1.02);
  }
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
    void (async () => {
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
      scene.rotation.y = Math.PI;
      scene.scale.setScalar(1.42);
      group.add(scene);
      added.push(scene);
      vrmRef.current = vrm ?? { scene };
      if (vrm?.lookAt) vrm.lookAt.target = null;
      if (vrm?.humanoid) {
        scene.updateMatrixWorld(true);
        rigRef.current = createVrmRig(vrm.humanoid);
      }
      runtime.applyCharacter = (state: TeaserState) => {
        const rig = rigRef.current;
        if (!rig) return;
        rig.apply(state, runtime.exporting);
        vrmRef.current?.humanoid?.update?.();
      };
    })();
    return () => {
      cancelled = true;
      vrmRef.current = null;
      rigRef.current = null;
      runtime.applyCharacter = () => {};
      for (const obj of added) group.remove(obj);
    };
  }, [url]);

  return <group ref={root} />;
}
