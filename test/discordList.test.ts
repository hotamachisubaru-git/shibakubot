import assert from "node:assert/strict";
import test from "node:test";
import { formatLimitedList, truncateDiscordText } from "../src/utils/discordList";

test("一覧の件数を制限し残件数を表示する", () => {
  const text = formatLimitedList(["a", "b", "c"], {
    maxItems: 2,
    maxLength: 100,
    formatItem: (item, index) => `${index + 1}. ${item}`,
  });
  assert.equal(text, "1. a\n2. b\n…ほか 1 件");
});

test("一覧を指定文字数以内に収める", () => {
  const text = formatLimitedList(["12345", "67890"], {
    maxItems: 10,
    maxLength: 15,
    formatItem: (item) => item,
  });
  assert.ok(text.length <= 15);
});

test("長い文字列を省略する", () => {
  assert.equal(truncateDiscordText("abcdef", 4), "abc…");
});
