import type { CameraId, CameraMode, JobStatus, ArtworkStatus } from "@/engine/types";

export const CAMERAS: {
  id: CameraMode;
  title: string;
  hint: string;
  short: string;
}[] = [
  { id: "auto", title: "Auto", hint: "Drone in sala, sempre sul touch", short: "Drone" },
  { id: "top", title: "Vista dall'alto", hint: "Ripresa sopra l'esagono", short: "Alto" },
  { id: "right", title: "GoPro destra", hint: "Spalla destra, grandangolo", short: "Destra" },
  { id: "left", title: "GoPro sinistra", hint: "Spalla sinistra, grandangolo", short: "Sinistra" },
];

export const CAMERA_TITLE: Record<CameraId, string> = {
  top: "Vista dall'alto",
  right: "GoPro destra",
  left: "GoPro sinistra",
};

export const PRESET_COPY = [
  { id: "soft" as const, title: "Morbido", hint: "Movimenti lenti" },
  { id: "cinematic" as const, title: "Cinema", hint: "Zoom e carrelli" },
  { id: "dynamic" as const, title: "Dinamico", hint: "Tagli più rapidi" },
];

export function artworkStatusLabel(status: ArtworkStatus | string) {
  switch (status) {
    case "analyzing":
      return "Analisi";
    case "ready":
      return "Pronta";
    case "rendering":
      return "In corso";
    case "completed":
      return "Video pronto";
    case "failed":
      return "Errore";
    default:
      return status;
  }
}

export function jobStatusLabel(status: JobStatus) {
  switch (status) {
    case "pending":
      return "In coda";
    case "rendering":
      return "Generazione";
    case "completed":
      return "Completato";
    case "failed":
      return "Fallito";
    case "cancelled":
      return "Annullato";
  }
}

export const SEGMENT_IT: Record<string, string> = {
  DRONE_RISE: "Salita",
  DRONE_DESCEND: "Discesa",
  DRONE_ARC_LEFT: "Arco sinistro",
  DRONE_ARC_RIGHT: "Arco destro",
  DRONE_PULLBACK: "Allontanamento",
  DRONE_PUSH_FORWARD: "Avvicinamento",
  DRONE_ORBIT: "Orbita",
  MONITOR_PASS: "Passaggio monitor",
  SHOULDER_PASS: "Passaggio spalla",
  TOP_REVEAL: "Rivelazione dall'alto",
};

export const GESTURE_IT: Record<string, string> = {
  SPREAD: "Apertura",
  PINCH: "Pinch",
  PAN_LEFT: "Pan sinistra",
  PAN_RIGHT: "Pan destra",
  PAN_UP: "Pan su",
  PAN_DOWN: "Pan giù",
  DETAIL_POINT: "Dettaglio",
  RETURN: "Ritorno",
  HOLD: "Posa",
};

export function segmentIt(label: string) {
  const key = label.trim().replaceAll(" ", "_");
  if (SEGMENT_IT[key]) return SEGMENT_IT[key];
  const parts = label.split(" · ");
  if (parts.length === 2) {
    const cam = parts[0]!.toLowerCase() as CameraId;
    const gkey = parts[1]!.replaceAll(" ", "_");
    const g = GESTURE_IT[gkey] ?? parts[1];
    return `${CAMERA_TITLE[cam] ?? parts[0]} · ${g}`;
  }
  return label.replaceAll("_", " ");
}

