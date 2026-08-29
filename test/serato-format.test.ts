import assert from "node:assert/strict";
import test from "node:test";
import { decodeUtf16Be, parseNodes, textValue } from "../src/serato-format.js";

function record(tag: string, value: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(tag, 0, "ascii");
  header.writeUInt32BE(value.length, 4);
  return Buffer.concat([header, value]);
}

function utf16be(value: string): Buffer {
  const le = Buffer.from(value, "utf16le");
  for (let i = 0; i < le.length; i += 2) [le[i], le[i + 1]] = [le[i + 1], le[i]];
  return le;
}

test("decodes UTF-16 big endian strings", () => {
  assert.equal(decodeUtf16Be(utf16be("Beyoncé")), "Beyoncé");
});

test("parses a nested crate track", () => {
  const data = Buffer.concat([
    record("vrsn", utf16be("1.0/Serato ScratchLive Crate")),
    record("otrk", record("ptrk", utf16be("Music/Test.mp3")))
  ]);
  const nodes = parseNodes(data);
  assert.equal(nodes[1].tag, "otrk");
  const track = nodes[1].value;
  assert.ok(Array.isArray(track));
  assert.equal(textValue(track[0]), "Music/Test.mp3");
});

test("rejects truncated data", () => {
  assert.throws(() => parseNodes(record("vrsn", Buffer.from([1, 2])).subarray(0, 9)), /Invalid Serato record/);
});
