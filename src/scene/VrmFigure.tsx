import { runtime } from "./runtime";
import { createVrmRig, type VrmRig } from "./vrmIk";
import { bootWork } from "@/engine/operator";
import type { TeaserState } from "@/engine/types";
import { DEFAULT_SETTINGS } from "@/engine/types";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
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

function stylizeVrm(root: THREE.Object3D) {
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
    if (/hair|kami|bang|kaminoke|chignon|braid/.test(label)) mesh.visible = false;
  });
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
        stylizeVrm(scene);
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
