import assert from "node:assert/strict";
import test from "node:test";
import {
  isLavalinkReady,
  updateLavalinkNodeConnection,
} from "../src/lavalink/lavalink";

test("利用可能nodeが1つ以上ある場合だけreadyになる", () => {
  updateLavalinkNodeConnection("node-a", false);
  updateLavalinkNodeConnection("node-b", false);
  assert.equal(isLavalinkReady(), false);

  updateLavalinkNodeConnection("node-a", true);
  assert.equal(isLavalinkReady(), true);

  updateLavalinkNodeConnection("node-b", true);
  updateLavalinkNodeConnection("node-a", false);
  assert.equal(isLavalinkReady(), true);

  updateLavalinkNodeConnection("node-b", false);
  assert.equal(isLavalinkReady(), false);
});
