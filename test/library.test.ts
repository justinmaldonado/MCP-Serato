import assert from "node:assert/strict";
import test from "node:test";
import { defaultCurrentLibraryRoot, defaultSeratoRoot } from "../src/library.js";

test("discovers the Windows library", () => {
  assert.equal(defaultSeratoRoot("win32", "C:\\Users\\DJ"), "C:\\Users\\DJ\\Music\\_Serato_");
});

test("discovers the macOS library", () => {
  assert.equal(defaultSeratoRoot("darwin", "/Users/dj"), "/Users/dj/Music/_Serato_");
});

test("discovers the current macOS SQLite library", () => {
  assert.equal(defaultCurrentLibraryRoot("darwin", "/Users/dj"), "/Users/dj/Library/Application Support/Serato/Library");
});
