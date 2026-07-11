import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBoolean,
  parseCsvValues,
  parseGuildValueMap,
  parseInteger,
} from "../src/utils/env";

test("parseCsvValues trims values and removes empty entries", () => {
  assert.deepEqual(parseCsvValues(" a, ,b ,, c "), ["a", "b", "c"]);
  assert.deepEqual(parseCsvValues(undefined), []);
});

test("parseInteger applies fallback and range validation", () => {
  assert.equal(parseInteger("42", 10, { min: 1, max: 100 }), 42);
  assert.equal(parseInteger("0", 10, { min: 1 }), 10);
  assert.equal(parseInteger("invalid", 10), 10);
});

test("parseBoolean accepts explicit boolean values only", () => {
  assert.equal(parseBoolean(" TRUE ", false), true);
  assert.equal(parseBoolean("false", true), false);
  assert.equal(parseBoolean("yes", false), false);
});

test("parseGuildValueMap ignores malformed entries", () => {
  assert.deepEqual(
    [...parseGuildValueMap("guild-a:value-a,invalid,guild-b:value:b")],
    [
      ["guild-a", "value-a"],
      ["guild-b", "value:b"],
    ],
  );
});
