import { publicUrl } from "@/lib/asset";
import { useTexture } from "@react-three/drei";
import { useLayoutEffect } from "react";
import * as THREE from "three";

function prep(tex: THREE.Texture, repeat: [number, number]) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
}

export function useStudioTextures() {
  const [floor, hoodie, wall] = useTexture([
    publicUrl("textures/floor.jpg"),
    publicUrl("textures/hoodie.jpg"),
    publicUrl("textures/wall.jpg"),
  ]);
  useLayoutEffect(() => {
    prep(floor, [8, 8]);
    prep(hoodie, [2.4, 2.4]);
    prep(wall, [3, 1.6]);
  }, [floor, hoodie, wall]);
  return { floor, hoodie, wall };
}
