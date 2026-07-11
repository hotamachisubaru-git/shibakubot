import assert from "node:assert/strict";
import test from "node:test";
import { truncateUtf16, truncateUtf16WithEllipsis } from "../src/utils/text";

test("UTF-16上限でサロゲートペアを分割しない", () => {
  assert.equal(truncateUtf16("ab😀cd", 4), "ab😀");
  assert.equal(truncateUtf16("ab😀cd", 3), "ab");
});

test("省略記号を含めて上限以内に収める", () => {
  const result = truncateUtf16WithEllipsis("理由😀理由😀", 6);
  assert.ok(result.length <= 6);
  assert.ok(result.endsWith("…"));
});
