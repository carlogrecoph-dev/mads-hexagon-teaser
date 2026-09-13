import { useStudio } from "@/store/studio";
import { engineBridge } from "@/engine/bridge";
import { evaluateTeaser } from "@/engine/choreography";
import { bootWork } from "@/engine/operator";
import { CAMERA_PRESETS } from "@/engine/config";
import { resolvedCamera, runtime } from "./runtime";
import { useThree, useFrame } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import type { TeaserState } from "@/engine/types";

function applyPose(cam: THREE.PerspectiveCamera, pose: TeaserState["camera"], aspect: number) {
  cam.position.set(pose.position.x, pose.position.y, pose.position.z);
  cam.up.set(0, 1, 0);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.rotateZ(pose.roll);
  cam.fov = pose.fov;
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  runtime.barrel = pose.barrel ?? 0;
}

function applyCamera(cam: THREE.PerspectiveCamera, state: TeaserState, aspect: number) {
  applyPose(cam, resolvedCamera(state), aspect);
}

export function Director() {
  const { camera, gl, size, scene } = useThree();
  const persp = camera as THREE.PerspectiveCamera;

  useLayoutEffect(() => {
    const apply = (state: TeaserState) => {
      runtime.lastState = state;
      runtime.playhead = state.time;
      runtime.applyCharacter(state);
      runtime.redrawArtwork();
      const aspect = gl.domElement.width / Math.max(1, gl.domElement.height);
      applyCamera(persp, state, aspect);
    };
    runtime.getCanvas = () => gl.domElement;
    runtime.setPixelSize = (w, h) => {
      gl.setPixelRatio(1);
      gl.setSize(w, h, false);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      runtime.composer?.setSize(w, h);
      const el = gl.domElement;
      el.style.width = "auto";
      el.style.height = "100%";
      el.style.maxWidth = "100%";
      el.style.aspectRatio = `${w} / ${h}`;
      el.style.objectFit = "contain";
      el.style.margin = "0 auto";
      el.style.display = "block";
    };
    engineBridge.current = {
      applyState: apply,
      redrawArtwork: () => runtime.redrawArtwork(),
      getCanvas: () => gl.domElement,
      setExporting: (on) => {
        runtime.exporting = on;
      },
      setPixelSize: runtime.setPixelSize,
      renderFrame: () => {
        if (runtime.exporting || !runtime.composer) gl.render(scene, persp);
        else runtime.composer.render();
        if (runtime.exporting) {
          const ctx = gl.getContext();
          ctx.flush();
          ctx.finish();
        }
      },
      restoreSize: () => {
        const pr = Math.min(window.devicePixelRatio || 1, 1.5);
        gl.setPixelRatio(pr);
        gl.setSize(size.width, size.height, false);
        persp.aspect = size.width / Math.max(1, size.height);
        persp.updateProjectionMatrix();
        runtime.composer?.setSize(size.width * pr, size.height * pr);
        const el = gl.domElement;
        el.style.width = `${size.width}px`;
        el.style.height = `${size.height}px`;
        el.style.maxWidth = "";
        el.style.aspectRatio = "";
        el.style.objectFit = "";
        el.style.margin = "";
        el.style.display = "";
      },
    };
    return () => {
      if (engineBridge.current?.getCanvas() === gl.domElement) {
        engineBridge.current = null;
      }
    };
  }, [gl, persp, scene, size.width, size.height]);

  useFrame((_, delta) => {
    if (runtime.exporting) return;
    try {
      const store = useStudio.getState();
      runtime.cameraLock = store.cameraLock;
      runtime.toyMode = store.toyMode;
      const plan = store.plan;
      const aspect = size.width / Math.max(1, size.height);
      const d = Math.min(delta, 0.1);
      runtime.playhead += d;
      let state: TeaserState;
      if (!plan) {
        if (runtime.playhead > 40) runtime.playhead = 0;
        state = bootWork(store.settings, runtime.playhead);
      } else {
        if (runtime.playhead >= plan.duration) runtime.playhead = 0;
        state = evaluateTeaser(plan, runtime.playhead, store.settings);
      }
      runtime.lastState = state;
      runtime.applyCharacter(state);
      if (!store.toyMode) {
        if (plan) applyCamera(persp, state, aspect);
        else applyPose(persp, CAMERA_PRESETS.top, aspect);
      }
      const now = performance.now();
      if (!store.lastState || now - runtime.lastUiSync > 90) {
        runtime.lastUiSync = now;
        useStudio.setState({ time: runtime.playhead, lastState: state });
      }
    } catch {
      /* never freeze the canvas */
    }
  }, -1);

  return null;
}
