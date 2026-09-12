import type { GestureId } from "./types.ts";

/** Canonical mapping: her gesture commands the artwork. */
export type GestureDrive = {
  zoom: "in" | "out" | "hold";
  panX: -1 | 0 | 1;
  panY: -1 | 0 | 1;
  bothHands: boolean;
  label: string;
};

export const GESTURE_DRIVE: Record<GestureId, GestureDrive> = {
  SPREAD: { zoom: "in", panX: 0, panY: 0, bothHands: true, label: "pinch-open → zoom in" },
  PINCH: { zoom: "out", panX: 0, panY: 0, bothHands: true, label: "pinch-close → zoom out" },
  RETURN: { zoom: "out", panX: 0, panY: 0, bothHands: true, label: "gather → full artwork" },
  PAN_LEFT: { zoom: "hold", panX: -1, panY: 0, bothHands: false, label: "slide left → image left" },
  PAN_RIGHT: { zoom: "hold", panX: 1, panY: 0, bothHands: false, label: "slide right → image right" },
  PAN_UP: { zoom: "hold", panX: 0, panY: 1, bothHands: false, label: "slide up → image up" },
  PAN_DOWN: { zoom: "hold", panX: 0, panY: -1, bothHands: false, label: "slide down → image down" },
  DETAIL_POINT: { zoom: "hold", panX: 0, panY: 0, bothHands: false, label: "go-to point on glass" },
  HOLD: { zoom: "hold", panX: 0, panY: 0, bothHands: true, label: "rest / pause / glance" },
};

export function driveOf(g: GestureId): GestureDrive {
  return GESTURE_DRIVE[g];
}
