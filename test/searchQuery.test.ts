import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchQueries,
  extractAudiostockKeyword,
  isAudiostockExplicitQuery,
  parseExplicitKeywordSearchQuery,
} from "../src/music/search/searchQuery";

test("buildSearchQueries adds each search prefix", () => {
  assert.deepEqual(buildSearchQueries("song", ["ytmsearch", "scsearch"]), [
    "ytmsearch:song",
    "scsearch:song",
  ]);
});

test("parseExplicitKeywordSearchQuery normalizes supported aliases", () => {
  assert.equal(parseExplicitKeywordSearchQuery(" yt: test song "), "ytsearch:test song");
  assert.equal(parseExplicitKeywordSearchQuery("YouTubeMusic:test"), "ytmsearch:test");
  assert.equal(parseExplicitKeywordSearchQuery("unknown:test"), null);
  assert.equal(parseExplicitKeywordSearchQuery("yt:"), null);
});

test("Audiostock helpers detect and extract explicit queries", () => {
  assert.equal(isAudiostockExplicitQuery("as: sound effect"), true);
  assert.equal(extractAudiostockKeyword("audiostock: sound effect"), "sound effect");
  assert.equal(extractAudiostockKeyword(" plain keyword "), "plain keyword");
});
