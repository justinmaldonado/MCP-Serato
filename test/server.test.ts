import assert from "node:assert/strict";
import test from "node:test";
import { trackMatchesQuery } from "../src/server.js";

const track = {
  path: "C:\\Music\\Example.mp3",
  title: "Example",
  bpm: "128",
  rating: 5,
  playCount: 12,
  missing: false
};

test("search matches BPM when tracks contain non-string metadata", () => {
  assert.equal(trackMatchesQuery(track, "128"), true);
});

test("search safely checks numeric and boolean metadata", () => {
  assert.equal(trackMatchesQuery(track, "12"), true);
  assert.equal(trackMatchesQuery(track, "false"), true);
  assert.equal(trackMatchesQuery(track, "not present"), false);
});
