import { describe, expect, test } from "bun:test";
import Database from "better-sqlite3";
import { coerceBigInt, parseSettingBoolean } from "../src/data/store";
import { getBaseArgsInternal } from "../src/music/ytDlp/ytDlpProcess";

describe("Bun runtime compatibility", () => {
  test("native better-sqlite3 can write, read, and roll back transactions", () => {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE counts (userId TEXT PRIMARY KEY, count TEXT NOT NULL)");
      const insert = db.prepare("INSERT INTO counts (userId, count) VALUES (?, ?)");
      const read = db.prepare("SELECT count FROM counts WHERE userId = ?");
      const largeCount = "900719925474099312345";

      db.transaction(() => insert.run("user-1", largeCount))();
      expect(read.get("user-1")).toEqual({ count: largeCount });
      expect(coerceBigInt(largeCount)).toBe(900719925474099312345n);

      expect(() => db.transaction(() => {
        insert.run("user-2", "1");
        throw new Error("rollback");
      })()).toThrow("rollback");
      expect(read.get("user-2")).toBeUndefined();
    } finally {
      db.close();
    }
  });

  test("settings parsing preserves default behavior", () => {
    expect(parseSettingBoolean("true", false)).toBe(true);
    expect(parseSettingBoolean(null, true)).toBe(true);
    expect(parseSettingBoolean("false", true)).toBe(false);
  });

  test("yt-dlp is instructed to run real Node.js, never the Bun binary", () => {
    const args = getBaseArgsInternal();
    expect(args.slice(0, 3)).toEqual([
      "--ignore-config",
      "--no-update",
      "--abort-on-error",
    ]);
    expect(args.includes("--js-runtimes")).toBe(true);

    const runtime = args[args.indexOf("--js-runtimes") + 1];
    expect(runtime).toBe("node");
    expect(runtime).not.toContain(process.execPath);
  });
});
