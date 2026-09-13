import Dexie, { type Table } from "dexie";
import type { ArtworkRecord, EngineSettings, FocusPoint, RenderJob } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export class HexagonDB extends Dexie {
  artworks!: Table<ArtworkRecord, string>;
  jobs!: Table<RenderJob, string>;
  kv!: Table<{ id: string; value: unknown }, string>;

  constructor() {
    super("mads-hexagon-teaser");
    this.version(1).stores({
      artworks: "id, name, createdAt, status",
      jobs: "id, artworkId, status, createdAt",
      kv: "id",
    });
  }
}

let db: HexagonDB | null = null;

export function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!db) db = new HexagonDB();
  return db;
}

export async function loadSettings(): Promise<EngineSettings> {
  const database = getDb();
  if (!database) return { ...DEFAULT_SETTINGS };
  const row = await database.kv.get("settings");
  if (!row || typeof row.value !== "object" || !row.value) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<EngineSettings>) };
}

export async function saveSettings(settings: EngineSettings) {
  const database = getDb();
  if (!database) return;
  await database.kv.put({ id: "settings", value: settings });
}

export async function listArtworks() {
  const database = getDb();
  if (!database) return [];
  return database.artworks.orderBy("createdAt").reverse().toArray();
}

export async function putArtwork(record: ArtworkRecord) {
  const database = getDb();
  if (!database) return;
  await database.artworks.put(record);
}

export async function deleteArtwork(id: string) {
  const database = getDb();
  if (!database) return;
  await database.artworks.delete(id);
  const jobs = await database.jobs.where("artworkId").equals(id).primaryKeys();
  await database.jobs.bulkDelete(jobs);
}

export async function updateFocus(id: string, focusPoints: FocusPoint[]) {
  const database = getDb();
  if (!database) return;
  await database.artworks.update(id, { focusPoints });
}

export async function listJobs() {
  const database = getDb();
  if (!database) return [];
  return database.jobs.orderBy("createdAt").reverse().toArray();
}

export async function putJob(job: RenderJob) {
  const database = getDb();
  if (!database) return;
  await database.jobs.put(job);
}

export const SAMPLE_MANIFEST = [
  {
    file: "samples/portrait-gaze.jpg",
    name: "Portrait Gaze",
    id: "sample-portrait-gaze",
  },
  {
    file: "samples/color-field.jpg",
    name: "Color Field",
    id: "sample-color-field",
  },
  {
    file: "samples/night-harbor.jpg",
    name: "Night Harbor",
    id: "sample-night-harbor",
  },
  {
    file: "samples/still-life.jpg",
    name: "Still Life",
    id: "sample-still-life",
  },
] as const;
