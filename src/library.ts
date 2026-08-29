import { access, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { child, parseNodes, textValue, type SeratoNode } from "./serato-format.js";

export interface Track {
  path: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  bpm?: string;
  key?: string;
  rating?: number;
  emoji?: string;
  playCount?: number;
  missing?: boolean;
}

export interface Crate { name: string; file: string; tracks: string[] }

export interface HistorySessionSummary {
  id: number;
  name?: string;
  startTime: string;
  endTime?: string;
  notes?: string;
  entryCount: number;
  playedCount: number;
}

export interface HistoryEntry {
  sequence: number;
  id: number;
  title: string;
  artist: string;
  album: string;
  path?: string;
  startTime: string;
  endTime?: string;
  played: boolean;
  deck?: string;
  bpm?: number;
  key?: string;
}

export interface HistorySession extends HistorySessionSummary {
  entries: HistoryEntry[];
}

export function defaultSeratoRoot(platform = process.platform, home = os.homedir()): string {
  // Serato DJ Pro/Lite use the user's Music folder on both supported platforms.
  if (platform === "win32") return path.win32.join(home, "Music", "_Serato_");
  if (platform === "darwin") return path.posix.join(home, "Music", "_Serato_");
  throw new Error(`Unsupported platform ${platform}; set SERATO_ROOT explicitly to inspect a mounted library`);
}

export function configuredRoot(): string {
  return path.resolve(process.env.SERATO_ROOT ?? defaultSeratoRoot());
}

export function defaultCurrentLibraryRoot(platform = process.platform, home = os.homedir()): string {
  if (platform === "win32") {
    return path.win32.join(process.env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local"), "Serato", "Library");
  }
  if (platform === "darwin") return path.posix.join(home, "Library", "Application Support", "Serato", "Library");
  throw new Error(`Unsupported platform ${platform}; set SERATO_LIBRARY_ROOT explicitly`);
}

export function configuredCurrentLibraryRoot(): string {
  return path.resolve(process.env.SERATO_LIBRARY_ROOT ?? defaultCurrentLibraryRoot());
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

export async function libraryStatus(root = configuredRoot()) {
  const database = path.join(root, "database V2");
  const subcrates = path.join(root, "Subcrates");
  const currentLibraryRoot = configuredCurrentLibraryRoot();
  const currentDatabase = path.join(currentLibraryRoot, "master.sqlite");
  const currentDatabaseFound = await exists(currentDatabase);
  return {
    platform: process.platform,
    root,
    rootFound: await exists(root),
    legacyDatabaseFound: await exists(database),
    subcratesFound: await exists(subcrates),
    currentLibraryRoot,
    currentDatabaseFound,
    libraryFormat: currentDatabaseFound ? "serato-dj-4-sqlite" : "legacy",
    mode: "read-only" as const,
    note: "Live deck state/control is unavailable because Serato does not publish a general live-control API."
  };
}

function nested(node: SeratoNode): SeratoNode[] {
  return Array.isArray(node.value) ? node.value : [];
}

function withCurrentDatabase<T>(callback: (database: DatabaseSync) => T): T {
  const file = path.join(configuredCurrentLibraryRoot(), "master.sqlite");
  const database = new DatabaseSync(file, { readOnly: true });
  try { return callback(database); } finally { database.close(); }
}

function isoTime(value: unknown): string | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

export async function listHistorySessions(): Promise<HistorySessionSummary[]> {
  if (!await exists(path.join(configuredCurrentLibraryRoot(), "master.sqlite"))) {
    throw new Error("Detailed play history requires the Serato DJ 4 SQLite library");
  }
  return withCurrentDatabase((database) => database.prepare(`
    SELECT s.id, s.name, s.start_time AS startTime, s.end_time AS endTime, s.notes,
           COUNT(e.id) AS entryCount,
           COALESCE(SUM(CASE WHEN e.played = 1 THEN 1 ELSE 0 END), 0) AS playedCount
    FROM history_session s
    LEFT JOIN history_entry e ON e.session_id = s.id
    GROUP BY s.id
    ORDER BY s.start_time DESC, s.id DESC
  `).all().map((row) => ({
    id: Number(row.id),
    name: row.name == null || row.name === "" ? undefined : String(row.name),
    startTime: isoTime(row.startTime)!,
    endTime: isoTime(row.endTime),
    notes: row.notes == null || row.notes === "" ? undefined : String(row.notes),
    entryCount: Number(row.entryCount),
    playedCount: Number(row.playedCount)
  })));
}

export async function getHistorySession(id: number, includeUnplayed = false): Promise<HistorySession | undefined> {
  const summary = (await listHistorySessions()).find((session) => session.id === id);
  if (!summary) return undefined;
  return withCurrentDatabase((database) => {
    const rows = database.prepare(`
      SELECT id, name AS title, artist, album, file_name AS path,
             start_time AS startTime, end_time AS endTime, played, deck, bpm, key
      FROM history_entry
      WHERE session_id = ? AND (? = 1 OR played = 1)
      ORDER BY start_time, id
    `).all(id, includeUnplayed ? 1 : 0);
    return {
      ...summary,
      entries: rows.map((row, index) => ({
        sequence: index + 1,
        id: Number(row.id),
        title: String(row.title ?? ""),
        artist: String(row.artist ?? ""),
        album: String(row.album ?? ""),
        path: row.path == null || row.path === "" ? undefined : String(row.path),
        startTime: isoTime(row.startTime)!,
        endTime: isoTime(row.endTime),
        played: Boolean(row.played),
        deck: row.deck == null || row.deck === "" ? undefined : String(row.deck),
        bpm: row.bpm == null ? undefined : Number(row.bpm),
        key: row.key == null || row.key === "" ? undefined : String(row.key)
      }))
    };
  });
}

async function readCurrentTracks(): Promise<Track[]> {
  return withCurrentDatabase((database) => database.prepare(`
    SELECT file_name AS path, name AS title, artist, album, genre, bpm, key,
           rating, emoji, dj_play_count AS playCount, is_missing AS missing
    FROM asset
    ORDER BY artist COLLATE NOCASE, name COLLATE NOCASE
  `).all().map((row) => ({
    path: String(row.path ?? ""),
    title: row.title == null ? undefined : String(row.title),
    artist: row.artist == null ? undefined : String(row.artist),
    album: row.album == null ? undefined : String(row.album),
    genre: row.genre == null ? undefined : String(row.genre),
    bpm: row.bpm == null ? undefined : String(row.bpm),
    key: row.key == null ? undefined : String(row.key),
    rating: row.rating == null ? undefined : Number(row.rating),
    emoji: row.emoji == null ? undefined : String(row.emoji),
    playCount: row.playCount == null ? undefined : Number(row.playCount),
    missing: Boolean(row.missing)
  })));
}

export async function readTracks(root = configuredRoot()): Promise<Track[]> {
  if (await exists(path.join(configuredCurrentLibraryRoot(), "master.sqlite"))) return readCurrentTracks();
  const file = path.join(root, "database V2");
  const nodes = parseNodes(await readFile(file));
  return nodes.filter((node) => node.tag === "otrk").map((node) => {
    const fields = nested(node);
    return {
      path: textValue(child(fields, "pfil")) ?? "",
      title: textValue(child(fields, "tsng")),
      artist: textValue(child(fields, "tart")),
      album: textValue(child(fields, "talb")),
      genre: textValue(child(fields, "tgen")),
      bpm: textValue(child(fields, "tbpm")),
      key: textValue(child(fields, "tkey"))
    };
  }).filter((track) => track.path);
}

async function listCurrentCrates(): Promise<Crate[]> {
  return withCurrentDatabase((database) => {
    const rows = database.prepare(`
      WITH RECURSIVE library_tree(id) AS (
        SELECT id FROM container WHERE name = 'Serato Library root'
        UNION ALL
        SELECT child.id FROM container child JOIN library_tree parent ON child.parent_id = parent.id
      )
      SELECT c.id AS containerId, c.name AS crateName, a.file_name AS trackPath,
             ca.list_order AS trackOrder
      FROM container c
      LEFT JOIN location_container lc ON lc.container_id = c.id
      LEFT JOIN container_asset ca ON ca.location_container_id = lc.id
      LEFT JOIN asset a ON a.id = ca.asset_id
      WHERE c.type = 1 AND c.id IN (SELECT id FROM library_tree)
      ORDER BY c.list_order, c.name COLLATE NOCASE, ca.list_order
    `).all();
    const crates = new Map<number, Crate>();
    for (const row of rows) {
      const id = Number(row.containerId);
      const crate = crates.get(id) ?? { name: String(row.crateName), file: `serato-sqlite://container/${id}`, tracks: [] };
      if (row.trackPath != null) crate.tracks.push(String(row.trackPath));
      crates.set(id, crate);
    }
    return [...crates.values()];
  });
}

export async function listCrates(root = configuredRoot()): Promise<Crate[]> {
  if (await exists(path.join(configuredCurrentLibraryRoot(), "master.sqlite"))) return listCurrentCrates();
  const directory = path.join(root, "Subcrates");
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".crate"));
  return Promise.all(files.map(async (entry) => {
    const file = path.join(directory, entry.name);
    const nodes = parseNodes(await readFile(file));
    const tracks = nodes.filter((node) => node.tag === "otrk")
      .map((node) => textValue(child(nested(node), "ptrk")))
      .filter((value): value is string => Boolean(value));
    return { name: entry.name.slice(0, -6), file, tracks };
  }));
}
