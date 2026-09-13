export type CameraId = "top" | "right" | "left";

export type CameraMode = CameraId | "auto";

export type OutputFormat = "9:16" | "1:1" | "16:9";

export type MovementPreset = "soft" | "cinematic" | "dynamic";

export type GestureId =
  | "SPREAD"
  | "PINCH"
  | "PAN_LEFT"
  | "PAN_RIGHT"
  | "PAN_UP"
  | "PAN_DOWN"
  | "DETAIL_POINT"
  | "RETURN"
  | "HOLD";

export type TransitionPrimitive =
  | "DRONE_RISE"
  | "DRONE_DESCEND"
  | "DRONE_ARC_LEFT"
  | "DRONE_ARC_RIGHT"
  | "DRONE_PULLBACK"
  | "DRONE_PUSH_FORWARD"
  | "DRONE_ORBIT"
  | "MONITOR_PASS"
  | "SHOULDER_PASS"
  | "TOP_REVEAL";

export type FocusSemantic =
  | "face"
  | "figure"
  | "color"
  | "contrast"
  | "texture"
  | "composition"
  | "manual";

export type JobStatus = "pending" | "rendering" | "completed" | "failed" | "cancelled";

export type ArtworkStatus = "analyzing" | "ready" | "rendering" | "completed" | "failed";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArtworkViewport {
  /** Artwork-space center X, 0 left → 1 right */
  cx: number;
  /** Artwork-space center Y, 0 top → 1 bottom */
  cy: number;
  /** 1 = full contain, >1 crops toward (cx, cy) */
  zoom: number;
}

export interface FocusPoint {
  id: string;
  cx: number;
  cy: number;
  /** Normalized half-extents in artwork space */
  width: number;
  height: number;
  score: number;
  semantic: FocusSemantic;
  recommendedZoom: number;
  locked: boolean;
  source: "auto" | "manual";
}

export interface InteractionState {
  /** 0 rest → 1 full spread (zoom in) */
  spread: number;
  /** -1 hands left → +1 hands right */
  panX: number;
  /** -1 hands down → +1 hands up */
  panY: number;
  /** 0 none → 1 decisive point */
  point: number;
  /** -1 left hand leads, +1 right hand leads */
  lead?: number;
  /** 0 working the glass → 1 head up to the 75" walls */
  glance?: number;
  /** -1 look left monitors, +1 look right */
  glanceDir?: number;
  /** 0 work → 1 stretch / sgranchirsi */
  stretch?: number;
  /** Artwork-space look target — set by focus map */
  targetCx?: number;
  targetCy?: number;
  /** Viewport zoom the teaser should hit at this pose */
  targetZoom?: number;
  /** Zoom of the last held frame — second zoom starts from here */
  baseZoom?: number;
  gesture: GestureId;
}

export interface TouchMotor {
  /** Artwork units per second */
  dCx: number;
  dCy: number;
  dZoom: number;
  speed: number;
}

/** What this hand is doing on the glass right now. */
export type ContactRole = "point" | "pinch" | "drag" | "park";

export interface HandTarget {
  /** index fingertip goal, world metres */
  x: number;
  y: number;
  z: number;
  /** thumb tip goal — set only for a one-hand pinch */
  thumb?: Vec3;
  /** 0 pressed on the glass → 1 lifted clear of it */
  lift: number;
  /** 0 no contact → 1 full skin contact */
  press: number;
  role: ContactRole;
  pose: GestureId;
}

export interface HandState {
  left: HandTarget;
  right: HandTarget;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
  roll: number;
  barrel: number;
}

export interface TeaserState {
  time: number;
  duration: number;
  cameraId: CameraId;
  camera: CameraPose;
  viewport: ArtworkViewport;
  interaction: InteractionState;
  hands: HandState;
  touch: TouchMotor;
  segmentLabel: string;
  seed: number;
}

export interface HoldSegment {
  kind: "hold";
  camera: CameraId;
  t0: number;
  t1: number;
  gesture: GestureId;
  from: InteractionState;
  to: InteractionState;
  focusId?: string;
}

export interface TransitionSegment {
  kind: "transition";
  fromCamera: CameraId;
  toCamera: CameraId;
  primitive: TransitionPrimitive;
  t0: number;
  t1: number;
  curvature: number;
  height: number;
  from: InteractionState;
  to: InteractionState;
}

export type PlanSegment = HoldSegment | TransitionSegment;

export interface TeaserPlan {
  seed: number;
  duration: number;
  format: OutputFormat;
  preset: MovementPreset;
  order: CameraId[];
  segments: PlanSegment[];
  focusIds: string[];
  artWidth: number;
  artHeight: number;
  /** Seeded drone take — continuous, always looking at the 55". */
  drone?: {
    keys: {
      t: number;
      kind: string;
      position: Vec3;
      target: Vec3;
      fov: number;
      roll: number;
    }[];
    opening?: string;
    model?: number;
    modelName?: string;
  };
}

export interface EngineSettings {
  preset: MovementPreset;
  cameraIntensity: number;
  zoomIntensity: number;
  panIntensity: number;
  handAmplitude: number;
  transitionDuration: number;
  stabilization: number;
  format: OutputFormat;
  fps: number;
  includeCharacter: boolean;
  glasses: boolean;
  /** 2k = 1440p master. hd = 1080p social. fast = 720p bozza. */
  exportQuality: "fast" | "hd" | "2k";
  /** auto = the seed picks the opening. otherwise pin the first shot. */
  droneOpening: "auto" | "outside" | "inside" | "right" | "left" | "behind" | "face" | "high";
  /** 0–19 authored shoot models. */
  droneModel: number;
}

export interface ArtworkRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  mime: string;
  createdAt: number;
  seed: number;
  status: ArtworkStatus;
  focusPoints: FocusPoint[];
  duration: number;
  blob?: Blob;
  thumb?: Blob;
  videoBlob?: Blob;
  videoName?: string;
}

export interface RenderJob {
  id: string;
  artworkId: string;
  artworkName: string;
  seed: number;
  format: OutputFormat;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: number;
  videoBlob?: Blob;
  videoName?: string;
  videoHref?: string;
}

export const OUTPUT_PIXELS: Record<OutputFormat, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

/** 2K QHD master — long side 2560. */
export const MASTER_PIXELS: Record<OutputFormat, { w: number; h: number }> = {
  "9:16": { w: 1440, h: 2560 },
  "1:1": { w: 1440, h: 1440 },
  "16:9": { w: 2560, h: 1440 },
};

export const DEFAULT_SETTINGS: EngineSettings = {
  preset: "cinematic",
  cameraIntensity: 0.6,
  zoomIntensity: 0.86,
  panIntensity: 0.8,
  handAmplitude: 0.88,
  transitionDuration: 0.48,
  stabilization: 0.62,
  format: "9:16",
  fps: 30,
  includeCharacter: true,
  glasses: true,
  exportQuality: "2k",
  droneOpening: "auto",
  droneModel: 0,
};
