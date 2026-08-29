# MCP Serato

A read-only MCP server that lets AI clients inspect a Serato DJ Pro/Lite library on Windows or macOS.

## Current capabilities

- Prefer the current Serato DJ 4 SQLite library on Windows and macOS.
- Fall back to `Music/_Serato_` legacy files or use `SERATO_ROOT`.
- Report library/capability status.
- List legacy `.crate` files and ordered track paths.
- Search metadata in the legacy `database V2` file.
- Read Serato DJ 4 session history and ordered playback timelines.
- Never modify Serato files.

Serato does not publish a general API for live deck state or transport control. Those features are therefore not claimed by this server.

## Requirements and setup

Install Node.js 22.5 or newer, then:

```sh
npm install
npm run build
```

Configure an MCP client to launch the built server:

```json
{
  "mcpServers": {
    "serato": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-serato/dist/src/index.js"]
    }
  }
}
```

If the library is not in the standard location, add an environment variable:

```json
"env": { "SERATO_ROOT": "/absolute/path/to/_Serato_" }
```

On Windows, use a fully escaped path in JSON, such as `D:\\Music\\_Serato_`.
For a nonstandard Serato DJ 4 database location, use `SERATO_LIBRARY_ROOT` instead.

## Tools

- `serato_status`
- `list_crates` (`includeTracks` defaults to `false`)
- `get_crate` (`name` is case-insensitive)
- `search_library` (`query`, optional `limit` up to 200)
- `list_history_sessions`
- `get_history_session` (`id`, optional `includeUnplayed`, defaults to `false`)

## Safety

Keep Serato's own backups enabled. This project is unofficial and is not affiliated with Serato. Parsing is based on the established TLV structure used by legacy Serato database and crate files.
