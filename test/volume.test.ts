import assert from "node:assert/strict";
import test from "node:test";
import { parseVolumeArg } from "../src/music/misc/volume";

test("parseVolumeArg requires a value", () => {
  assert.equal(parseVolumeArg(undefined), null);
  assert.equal(parseVolumeArg(""), null);
  assert.equal(parseVolumeArg("invalid"), null);
});

test("parseVolumeArg rounds and clamps to 1-100", () => {
  assert.equal(parseVolumeArg("50.6"), 51);
  assert.equal(parseVolumeArg("0"), 1);
  assert.equal(parseVolumeArg("101"), 100);
});
