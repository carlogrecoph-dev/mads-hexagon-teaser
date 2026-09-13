import type { TeaserState } from "@/engine/types";
import { CAMERA_PRESETS } from "@/engine/config";
import type { CameraMode } from "@/engine/types";

export const runtime = {
  exporting: false,
  cameraLock: "auto" as CameraMode,
  toyMode: false,
  artworkImage: null as CanvasImageSource | null,
  artworkSize: { w: 1, h: 1 },
  logoImage: null as CanvasImageSource | null,
  avgColor: { r: 0.42, g: 0.18, b: 0.28 },
  head: { x: 0, y: 1.55, z: -0.58 },
  /**
   * Live measurements of the posed hands, in metres above the glass.
   * `worst` is the closest any bone of that hand comes to the surface —
   * it must never go negative, or a finger is inside the monitor.
   */
  rigProbe: {
    left: { role: "", tip: 0, palm: 0, worst: 0, reach: 0, err: 0, wrist: [0, 0, 0] as number[], elbow: [0, 0, 0] as number[] },
    right: { role: "", tip: 0, palm: 0, worst: 0, reach: 0, err: 0, wrist: [0, 0, 0] as number[], elbow: [0, 0, 0] as number[] },
    body: { over: 0, lean: 0, headY: 0, headZ: 0, chestZ: 0 },
  },
  lastState: null as TeaserState | null,
  playhead: 0,
  lastUiSync: 0,
  barrel: 0,
  redrawArtwork: () => {},
  applyCharacter: (_s: TeaserState) => {},
  getCanvas: () => null as HTMLCanvasElement | null,
  setPixelSize: (_w: number, _h: number) => {},
  composer: null as { setSize: (w: number, h: number) => void; render: () => void } | null,
  applyState(state: TeaserState) {
    this.lastState = state;
    this.playhead = state.time;
    this.redrawArtwork();
    this.applyCharacter(state);
  },
};

export function resolvedCamera(state: TeaserState) {
  if (runtime.cameraLock !== "auto") return CAMERA_PRESETS[runtime.cameraLock];
  return state.camera;
}

if (typeof window !== "undefined") {
  (window as unknown as { __hexagon: unknown }).__hexagon = {
    runtime,
    /** Live camera presets — mutate for QA / close-up inspection. */
    presets: CAMERA_PRESETS,
    get time() {
      return runtime.lastState?.time ?? runtime.playhead;
    },
    get camera() {
      return runtime.lastState?.cameraId ?? "top";
    },
  };
}
