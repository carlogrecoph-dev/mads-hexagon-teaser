import { HEX } from "@/engine/config";
import { runtime } from "./runtime";
import { ContactShadows } from "@react-three/drei";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";
import * as THREE from "three";

function makeEnvScene() {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight("#a8b4c4", "#1a1410", 1.15));
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 20, 14),
    new THREE.MeshBasicMaterial({ color: "#1c2228", side: THREE.BackSide }),
  );
  s.add(sky);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 24),
    new THREE.MeshBasicMaterial({ color: "#2c241c" }),
  );
  floor.rotation.x = -Math.PI / 2;
  s.add(floor);
  const warm = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 12, 10),
    new THREE.MeshBasicMaterial({ color: "#f0d2a8" }),
  );
  warm.position.set(0, 0.4, 3.2);
  s.add(warm);
  const cool = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 10),
    new THREE.MeshBasicMaterial({ color: "#8aa0c8" }),
  );
  cool.position.set(-3.2, 2.4, -1);
  s.add(cool);
  return s;
}

function StudioEnv() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const gen = new THREE.PMREMGenerator(gl);
    const envScene = makeEnvScene();
    const rt = gen.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.02;
    return () => {
      scene.environment = null;
      rt.dispose();
      gen.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function Cinematic() {
  const composerRef = useRef<EffectComposerImpl>(null);

  useFrame(() => {
    if (runtime.exporting) {
      runtime.composer = null;
      return;
    }
    runtime.composer = composerRef.current;
  });

  return (
    <>
      <StudioEnv />
      <ContactShadows
        position={[0, 0.012, HEX.personZ]}
        opacity={0.28}
        scale={3.4}
        blur={3.4}
        far={1.8}
        color="#05060a"
      />
      <EffectComposer ref={composerRef} enabled={!runtime.exporting} multisampling={0} stencilBuffer={false}>
        <SMAA />
        <HueSaturation saturation={0.02} hue={-0.01} />
        <BrightnessContrast brightness={0.06} contrast={0.05} />
        <Bloom luminanceThreshold={0.62} intensity={0.14} mipmapBlur luminanceSmoothing={0.45} />
        <Vignette offset={0.4} darkness={0.28} />
        <Noise opacity={0.02} />
      </EffectComposer>
    </>
  );
}
