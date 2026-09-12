import type { TeaserState } from "./types";

export interface EngineBridge {
  applyState: (state: TeaserState) => void;
  redrawArtwork: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  setExporting: (on: boolean) => void;
  setPixelSize: (w: number, h: number) => void;
  renderFrame: () => void;
  restoreSize: () => void;
}

export const engineBridge: { current: EngineBridge | null } = { current: null };
