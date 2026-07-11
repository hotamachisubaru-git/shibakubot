import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExternalTrackBlockedMessage,
  buildTrackTooLongMessage,
  buildUnknownDurationBlockedMessage,
} from "../src/music/misc/trackValidation";

const limit = {
  maxTrackMinutes: 15,
  maxTrackMs: 15 * 60 * 1000,
};

test("unknown duration and live tracks are blocked", () => {
  assert.equal(
    buildExternalTrackBlockedMessage("live", null, false, limit),
    buildUnknownDurationBlockedMessage(limit),
  );
  assert.equal(
    buildExternalTrackBlockedMessage("live", 60_000, true, limit),
    buildUnknownDurationBlockedMessage(limit),
  );
});

test("tracks over the configured duration are blocked", () => {
  assert.equal(
    buildExternalTrackBlockedMessage("long track", 16 * 60 * 1000, false, limit),
    buildTrackTooLongMessage("long track", 16 * 60 * 1000, limit),
  );
});

test("tracks within the configured duration are allowed", () => {
  assert.equal(
    buildExternalTrackBlockedMessage("normal track", 10 * 60 * 1000, false, limit),
    null,
  );
});
