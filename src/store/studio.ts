import { create } from "zustand";
import { analyzeArtwork } from "@/engine/focus";
import {
  deleteArtwork,
  getDb,
  listArtworks,
  listJobs,
  loadSettings,
  putArtwork,
  putJob,
  SAMPLE_MANIFEST,
  saveSettings,
  updateFocus,
} from "@/engine/db";
import { evaluateTeaser, generatePlan } from "@/engine/choreography";
import { exportTeaser } from "@/engine/export-video";
import { publicUrl } from "@/lib/asset";
import { shareOrSave } from "@/lib/save-file";
import { publishTeaser } from "@/lib/publish-teaser";
import type {
  ArtworkRecord,
  CameraMode,
  EngineSettings,
  FocusPoint,
  RenderJob,
  TeaserPlan,
  TeaserState,
} from "@/engine/types";
import { DEFAULT_SETTINGS } from "@/engine/types";
import { hashSeed } from "@/engine/math";
import { runtime } from "@/scene/runtime";

export interface IdentityState {
  portraitUrl?: string;
  logoUrl?: string;
  vrmUrl?: string;
  skin?: { r: number; g: number; b: number };
}

interface StudioStore {
  ready: boolean;
  artworks: ArtworkRecord[];
  activeId: string | null;
  selectedIds: string[];
  settings: EngineSettings;
  plan: TeaserPlan | null;
  time: number;
  playing: boolean;
  cameraLock: CameraMode;
  cameraFlash: number;
  jobs: RenderJob[];
  identity: IdentityState;
  busy: string | null;
  lastState: TeaserState | null;
  queueRunning: boolean;
  abort: AbortController | null;
  arOverlay: boolean;
  toyMode: boolean;
  exportProgress: number;
  exportFrame: string;

  hydrate: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  selectArtwork: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  removeArtwork: (id: string) => Promise<void>;
  setFocusPoints: (id: string, points: FocusPoint[]) => Promise<void>;
  setSettings: (patch: Partial<EngineSettings>) => void;
  randomizeSeed: () => void;
  setSeed: (seed: number) => void;
  rebuildPlan: () => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  advance: (dt: number) => void;
  setCameraLock: (mode: CameraMode) => void;
  setArOverlay: (on: boolean) => void;
  setToyMode: (on: boolean) => void;
  setIdentityLogo: (file: File | null) => Promise<void>;
  setIdentityPortrait: (file: File | null) => Promise<void>;
  setIdentityVrm: (file: File | null) => Promise<void>;
  enqueueSelected: () => void;
  enqueueActive: () => void;
  cancelJobs: () => void;
  retryFailed: () => void;
  downloadJob: (id: string) => void;
  downloadAll: () => void;
  tickState: () => TeaserState | null;
}

function seedFromName(name: string, i: number) {
  let h = 2166136261 ^ i;
  for (let c = 0; c < name.length; c++) {
    h ^= name.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function fileToRecord(file: File, id: string, seed: number): Promise<ArtworkRecord> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const focusPoints = await analyzeArtwork(bitmap);
  const thumb = await makeThumb(bitmap);
  bitmap.close();
  return {
    id,
    name: file.name.replace(/\.[^.]+$/, ""),
    width,
    height,
    mime: file.type || "image/jpeg",
    createdAt: Date.now(),
    seed,
    status: "ready",
    focusPoints,
    duration: 40,
    blob: file,
    thumb,
  };
}

async function makeThumb(source: ImageBitmap) {
  const max = 320;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  return blob ?? undefined;
}

async function blobUrl(blob?: Blob) {
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}

function downloadBlob(blob: Blob, name: string) {
  void shareOrSave(blob, name);
}

export const useStudio = create<StudioStore>((set, get) => ({
  ready: false,
  artworks: [],
  activeId: null,
  selectedIds: [],
  settings: { ...DEFAULT_SETTINGS },
  plan: null,
  time: 0,
  playing: true,
  cameraLock: "auto",
  cameraFlash: 0,
  jobs: [],
  identity: {},
  busy: null,
  lastState: null,
  arOverlay: false,
  toyMode: false,
  queueRunning: false,
  abort: null,
  exportProgress: 0,
  exportFrame: "",

  hydrate: async () => {
    const settings = await loadSettings();
    const jobs = await listJobs();
    set({ settings, jobs, ready: true });
    let artworks = await listArtworks();
    if (artworks.length === 0) {
      for (const sample of SAMPLE_MANIFEST) {
        try {
          const res = await fetch(publicUrl(sample.file));
          const blob = await res.blob();
          const file = new File([blob], `${sample.name}.jpg`, { type: blob.type || "image/jpeg" });
          const rec = await fileToRecord(file, sample.id, seedFromName(sample.name, 1));
          rec.createdAt = Date.now() - 1000;
          await putArtwork(rec);
          artworks.push(rec);
          if (!get().activeId) {
            set({ artworks: [...artworks], activeId: rec.id });
            get().rebuildPlan();
          } else {
            set({ artworks: [...artworks] });
          }
        } catch (err) {
          console.warn("Sample load failed", sample.file, err);
        }
      }
    }
    artworks = artworks.sort((a, b) => b.createdAt - a.createdAt);
    const activeId = get().activeId ?? artworks[0]?.id ?? null;
    set({ artworks, activeId, ready: true });
    if (activeId && !get().plan) get().rebuildPlan();
  },

  addFiles: async (files) => {
    const images = files.filter((f) => /image\/(jpeg|png|webp)/i.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!images.length) return;
    set({ busy: "Analisi dell'opera…" });
    const added: ArtworkRecord[] = [];
    for (let i = 0; i < images.length; i++) {
      const file = images[i]!;
      const id = crypto.randomUUID();
      try {
        const rec = await fileToRecord(file, id, seedFromName(file.name, Date.now() + i));
        await putArtwork(rec);
        added.push(rec);
      } catch (err) {
        console.warn("Failed to import", file.name, err);
      }
    }
    const artworks = [...added, ...get().artworks];
    set({
      artworks,
      activeId: added[0]?.id ?? get().activeId,
      selectedIds: added.map((a) => a.id),
      busy: null,
    });
    if (added[0]) get().rebuildPlan();
  },

  selectArtwork: (id) => {
    set({ activeId: id, time: 0 });
    get().rebuildPlan();
  },

  toggleSelected: (id) => {
    const selectedIds = get().selectedIds.includes(id)
      ? get().selectedIds.filter((s) => s !== id)
      : [...get().selectedIds, id];
    set({ selectedIds });
  },

  selectAll: () => {
    const ids = get().artworks.map((a) => a.id);
    set({ selectedIds: get().selectedIds.length === ids.length ? [] : ids });
  },

  removeArtwork: async (id) => {
    await deleteArtwork(id);
    const artworks = get().artworks.filter((a) => a.id !== id);
    const activeId = get().activeId === id ? (artworks[0]?.id ?? null) : get().activeId;
    set({ artworks, activeId, selectedIds: get().selectedIds.filter((s) => s !== id) });
    if (activeId) get().rebuildPlan();
    else set({ plan: null });
  },

  setFocusPoints: async (id, points) => {
    await updateFocus(id, points);
    set({
      artworks: get().artworks.map((a) => (a.id === id ? { ...a, focusPoints: points } : a)),
    });
    if (get().activeId === id) get().rebuildPlan();
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void saveSettings(settings);
    get().rebuildPlan();
  },

  randomizeSeed: () => {
    const art = get().artworks.find((a) => a.id === get().activeId);
    if (!art) return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const next = { ...art, seed };
    void putArtwork(next);
    set({
      artworks: get().artworks.map((a) => (a.id === art.id ? next : a)),
    });
    get().rebuildPlan();
  },

  setSeed: (seed) => {
    const art = get().artworks.find((a) => a.id === get().activeId);
    if (!art) return;
    const next = { ...art, seed: seed >>> 0 };
    void putArtwork(next);
    set({ artworks: get().artworks.map((a) => (a.id === art.id ? next : a)) });
    get().rebuildPlan();
  },

  rebuildPlan: () => {
    const { activeId, artworks, settings } = get();
    const art = artworks.find((a) => a.id === activeId);
    if (!art) {
      set({ plan: null });
      return;
    }
    try {
      const plan = generatePlan({
        seed: art.seed,
        focusPoints: art.focusPoints,
        settings,
        artWidth: art.width,
        artHeight: art.height,
      });
      set({ plan, time: 0, playing: true });
      runtime.playhead = 0;
    } catch (err) {
      console.error("[rebuildPlan]", err);
      set({ plan: null, playing: false });
    }
  },

  play: () => {
    runtime.playhead = get().time;
    set({ playing: true });
  },
  pause: () => set({ playing: false }),
  seek: (t) => {
    const dur = get().plan?.duration ?? 12;
    const time = Math.min(dur, Math.max(0, t));
    runtime.playhead = time;
    set({ time, playing: false });
  },
  advance: (dt) => {
    const { playing, plan, time } = get();
    if (!playing || !plan) return;
    let next = time + dt;
    if (next >= plan.duration) next = 0;
    runtime.playhead = next;
    set({ time: next });
  },
  setCameraLock: (mode) => set({ cameraLock: mode, cameraFlash: Date.now(), toyMode: false }),
  setArOverlay: (on) => set({ arOverlay: on }),
  setToyMode: (on) => {
    if (on) set({ toyMode: true, playing: false, cameraLock: "auto" });
    else set({ toyMode: false });
  },

  setIdentityLogo: async (file) => {
    const prev = get().identity.logoUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({ identity: { ...get().identity, logoUrl: undefined } });
      return;
    }
    set({ identity: { ...get().identity, logoUrl: URL.createObjectURL(file) } });
  },

  setIdentityVrm: async (file) => {
    const prev = get().identity.vrmUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({ identity: { ...get().identity, vrmUrl: undefined } });
      return;
    }
    set({ identity: { ...get().identity, vrmUrl: URL.createObjectURL(file) } });
  },

  setIdentityPortrait: async (file) => {
    const prev = get().identity.portraitUrl;
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      set({ identity: { ...get().identity, portraitUrl: undefined, skin: undefined } });
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const bmp = await createImageBitmap(file);
      const { sampleSkinTone } = await import("@/engine/focus");
      const skin = sampleSkinTone(bmp);
      bmp.close();
      set({ identity: { ...get().identity, portraitUrl: url, skin } });
    } catch {
      set({ identity: { ...get().identity, portraitUrl: url } });
    }
  },

  enqueueSelected: () => {
    const ids = (
      get().selectedIds.length ? get().selectedIds : get().activeId ? [get().activeId] : []
    ).filter((id): id is string => Boolean(id));
    const jobs: RenderJob[] = ids.map((id) => {
      const art = get().artworks.find((a) => a.id === id);
      return {
        id: crypto.randomUUID(),
        artworkId: id,
        artworkName: art?.name ?? "artwork",
        seed: art?.seed ?? hashSeed(Date.now()),
        format: get().settings.format,
        status: "pending" as const,
        progress: 0,
        createdAt: Date.now(),
      };
    });
    jobs.forEach((j) => void putJob(j));
    set({ jobs: [...jobs, ...get().jobs] });
    void runQueue();
  },

  enqueueActive: () => {
    const id = get().activeId;
    if (!id) return;
    set({ selectedIds: [id] });
    get().enqueueSelected();
  },

  cancelJobs: () => {
    get().abort?.abort();
    const jobs = get().jobs.map((j) =>
      j.status === "pending" || j.status === "rendering" ? { ...j, status: "cancelled" as const } : j,
    );
    jobs.forEach((j) => void putJob(j));
    set({ jobs, abort: null, queueRunning: false });
  },

  retryFailed: () => {
    const jobs = get().jobs.map((j) =>
      j.status === "failed" || j.status === "cancelled"
        ? { ...j, status: "pending" as const, progress: 0, error: undefined }
        : j,
    );
    jobs.forEach((j) => void putJob(j));
    set({ jobs });
    void runQueue();
  },

  downloadJob: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (job?.videoBlob && job.videoName) downloadBlob(job.videoBlob, job.videoName);
  },

  downloadAll: () => {
    get()
      .jobs.filter((j) => j.status === "completed" && j.videoBlob)
      .forEach((j) => j.videoBlob && j.videoName && downloadBlob(j.videoBlob, j.videoName));
  },

  tickState: () => {
    const { plan, time, settings } = get();
    if (!plan) return null;
    const state = evaluateTeaser(plan, time, settings);
    set({ lastState: state });
    return state;
  },
}));

async function runQueue() {
  const store = useStudio.getState();
  if (store.queueRunning) return;
  useStudio.setState({ queueRunning: true });
  const abort = new AbortController();
  useStudio.setState({ abort });

  const patchJob = (id: string, patch: Partial<RenderJob>) => {
    const jobs = useStudio.getState().jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    const job = jobs.find((j) => j.id === id);
    if (job) {
      const { videoBlob: _blob, ...row } = job;
      void putJob(row as RenderJob);
    }
    useStudio.setState({ jobs });
  };

  try {
    while (true) {
      const pending = useStudio.getState().jobs.find((j) => j.status === "pending");
      if (!pending) break;
      if (abort.signal.aborted) break;
      const art = useStudio.getState().artworks.find((a) => a.id === pending.artworkId);
      if (!art) {
        patchJob(pending.id, { status: "failed", error: "Artwork missing" });
        continue;
      }
      patchJob(pending.id, { status: "rendering", progress: 0.01 });
      useStudio.setState({
        activeId: art.id,
        playing: false,
        exportProgress: 0,
        exportFrame: "Avvio encoder…",
      });
      const settings = useStudio.getState().settings;
      let plan;
      try {
        plan = generatePlan({
          seed: pending.seed,
          focusPoints: art.focusPoints,
          settings: { ...settings, format: pending.format },
          artWidth: art.width,
          artHeight: art.height,
        });
      } catch (err) {
        patchJob(pending.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "Piano di ripresa non valido",
        });
        continue;
      }
      useStudio.setState({ plan, time: 0 });
      await new Promise((r) => setTimeout(r, 120));
      let lastUi = 0;
      try {
        const { blob, name } = await exportTeaser({
          plan,
          settings: { ...settings, format: pending.format },
          artworkName: art.name,
          format: pending.format,
          signal: abort.signal,
          onProgress: (p, label) => {
            const now = performance.now();
            if (p < 1 && now - lastUi < 180) return;
            lastUi = now;
            useStudio.setState({ exportProgress: p, exportFrame: label ?? `${Math.round(p * 100)}%` });
          },
        });
        const href = await publishTeaser(blob, name);
        patchJob(pending.id, {
          status: "completed",
          progress: 1,
          videoBlob: blob,
          videoName: name,
          videoHref: href ?? undefined,
        });
        const nextArt = { ...art, status: "completed" as const, videoName: name };
        void putArtwork(nextArt);
        useStudio.setState({
          exportProgress: 1,
          exportFrame: "Pronto",
          artworks: useStudio.getState().artworks.map((a) =>
            a.id === art.id ? { ...nextArt, videoBlob: blob } : a,
          ),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Render failed";
        if (message === "Cancelled" || abort.signal.aborted) {
          patchJob(pending.id, { status: "cancelled", error: message });
          break;
        }
        patchJob(pending.id, { status: "failed", error: message });
      }
    }
  } finally {
    useStudio.setState({ queueRunning: false, abort: null, playing: true });
  }
}

export async function artworkObjectUrl(art: ArtworkRecord) {
  if (art.blob) return URL.createObjectURL(art.blob);
  return undefined;
}

void getDb();
