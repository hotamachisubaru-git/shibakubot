import assert from "node:assert/strict";
import test from "node:test";
import { getMusicVoiceAccess } from "../src/music/misc/music-permissions";

test("BotがVC未接続なら操作を制限しない", () => {
  assert.equal(getMusicVoiceAccess(null, null).allowed, true);
});

test("Bot接続中はVC未参加ユーザーを拒否する", () => {
  assert.equal(getMusicVoiceAccess(null, "voice-a").allowed, false);
});

test("Botと別VCのユーザーを拒否する", () => {
  assert.equal(getMusicVoiceAccess("voice-b", "voice-a").allowed, false);
});

test("Botと同じVCのユーザーを許可する", () => {
  assert.equal(getMusicVoiceAccess("voice-a", "voice-a").allowed, true);
});
