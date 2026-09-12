import type { CameraId, CameraPose, MovementPreset } from "./types.ts";

/** Physical installation — metres, Y-up. Editable. */
export const HEX = {
  /** Centre to outer monitor face (apothem) */
  radius: 1.62,
  screen75: { width: 1.661, height: 0.934, depth: 0.055 },
  screen55: { width: 1.217, height: 0.685, depth: 0.04 },
  bezel: 0.024,
  /** Standing monitor centre height */
  outerCenterY: 1.38,
  /** Inward tilt of outer monitors (rad) */
  inwardTilt: 0.1,
  tableHeight: 1.14,
  /** Table tilt from horizontal: near edge (operator) lower, far edge higher */
  tableTilt: 0.16,
  tableZ: 0.1,
  personZ: -0.58,
  personHeight: 1.86,
  floorSize: 12,
} as const;

/**
 * Outer monitors, 0 = front (+Z), clockwise from above.
 * 1 front, 2 front-right, 3 rear-right (GoPro R),
 * 4 rear, 5 rear-left (GoPro L), 6 front-left.
 */
export const OUTER_MONITOR_INDEX = [1, 2, 3, 4, 5, 6] as const;

export function monitorAngle(index: number) {
  return ((index - 1) * Math.PI) / 3;
}

export function monitorPosition(index: number, radius = HEX.radius) {
  const a = monitorAngle(index);
  return {
    x: Math.sin(a) * radius,
    y: HEX.outerCenterY,
    z: Math.cos(a) * radius,
  };
}

/** GoPro mounted on a rear monitor, just behind the shoulder. */
function goproPose(side: 1 | -1): CameraPose {
  const index = side === 1 ? 3 : 5;
  const a = monitorAngle(index);
  const r = HEX.radius - 0.08;
  return {
    position: {
      x: Math.sin(a) * r,
      y: 1.66,
      z: Math.cos(a) * r,
    },
    target: { x: -side * 0.12, y: 1.2, z: 0.38 },
    fov: 86,
    roll: side * 0.028,
    barrel: 0.22,
  };
}

export const CAMERA_PRESETS: Record<CameraId, CameraPose> = {
  top: {
    position: { x: 0.06, y: 4.2, z: -0.48 },
    target: { x: 0, y: 0.42, z: 0.12 },
    fov: 58,
    roll: 0,
    barrel: 0,
  },
  right: goproPose(1),
  left: goproPose(-1),
};

export const MOVEMENT_PRESETS: Record<
  MovementPreset,
  {
    cameraAmp: number;
    zoomMax: number;
    panAmp: number;
    handAmp: number;
    transScale: number;
    microHz: number;
  }
> = {
  soft: {
    cameraAmp: 0.4,
    zoomMax: 2.7,
    panAmp: 0.44,
    handAmp: 0.75,
    transScale: 1.1,
    microHz: 0.07,
  },
  cinematic: {
    cameraAmp: 0.62,
    zoomMax: 3.5,
    panAmp: 0.56,
    handAmp: 1.12,
    transScale: 0.95,
    microHz: 0.12,
  },
  dynamic: {
    cameraAmp: 0.9,
    zoomMax: 4.1,
    panAmp: 0.68,
    handAmp: 1.15,
    transScale: 0.78,
    microHz: 0.17,
  },
};

export const LIMITS = {
  zoomMin: 1,
  zoomMax: 4.2,
  cameraIntensity: [0, 1],
  zoomIntensity: [0, 1],
  panIntensity: [0, 1],
  handAmplitude: [0.2, 1.2],
  transitionDuration: [0.35, 1.6],
  stabilization: [0, 1],
  duration: [38, 42],
  fps: 30,
} as const;

export const CAMERA_SEQUENCES: CameraId[][] = [
  ["top", "right", "left", "top", "right", "left"],
  ["right", "top", "left", "right", "top", "left"],
  ["left", "right", "top", "left", "right", "top"],
  ["top", "left", "right", "top", "left", "right"],
  ["right", "left", "top", "right", "left", "top"],
  ["left", "top", "right", "left", "top", "right"],
];

export const DISPLAY_ASPECT = 16 / 9;
