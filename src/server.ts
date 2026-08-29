import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { configuredCurrentLibraryRoot, configuredRoot, getHistorySession, libraryStatus, listCrates, listHistorySessions, readTracks } from "./library.js";
import type { Track } from "./library.js";

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }]
});

export function trackMatchesQuery(track: Track, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return Object.values(track).some((value) =>
    value != null && String(value).toLocaleLowerCase().includes(needle)
  );
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-serato", version: "0.1.0" });

  server.tool("serato_status", "Locate the Serato DJ library and report supported capabilities.", {}, async () => {
    try { return json(await libraryStatus()); } catch (error) { return failure(error); }
  });

  server.tool("list_crates", "List Serato crates, optionally including their track paths.", {
    includeTracks: z.boolean().default(false)
  }, async ({ includeTracks }) => {
    try {
      const crates = await listCrates();
      return json(includeTracks ? crates : crates.map(({ name, file, tracks }) => ({ name, file, trackCount: tracks.length })));
    } catch (error) { return failure(error); }
  });

  server.tool("get_crate", "Get one Serato crate and its ordered track paths.", {
    name: z.string().min(1)
  }, async ({ name }) => {
    try {
      const crate = (await listCrates()).find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      return crate ? json(crate) : failure(new Error(`Crate not found: ${name}`));
    } catch (error) { return failure(error); }
  });

  server.tool("list_history_sessions", "List Serato DJ 4 history sessions with chronological bounds and track counts.", {}, async () => {
    try { return json(await listHistorySessions()); } catch (error) { return failure(error); }
  });

  server.tool("get_history_session", "Get a Serato DJ 4 session's track timeline in playback order.", {
    id: z.number().int().positive(),
    includeUnplayed: z.boolean().default(false)
  }, async ({ id, includeUnplayed }) => {
    try {
      const session = await getHistorySession(id, includeUnplayed);
      return session ? json(session) : failure(new Error(`History session not found: ${id}`));
    } catch (error) { return failure(error); }
  });

  server.tool("search_library", "Search the legacy Serato library metadata by title, artist, album, genre, key, BPM, or path.", {
    query: z.string().min(1),
    limit: z.number().int().min(1).max(200).default(50)
  }, async ({ query, limit }) => {
    try {
      const tracks = (await readTracks()).filter((track) => trackMatchesQuery(track, query)).slice(0, limit);
      const status = await libraryStatus();
      return json({
        root: status.currentDatabaseFound ? configuredCurrentLibraryRoot() : configuredRoot(),
        libraryFormat: status.libraryFormat,
        count: tracks.length,
        tracks
      });
    } catch (error) { return failure(error); }
  });

  return server;
}
