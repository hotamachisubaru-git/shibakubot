import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const BIGINT_RE = /^-?\d+$/;

function toCountText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (BIGINT_RE.test(trimmed)) return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const num = Number(value);
  if (Number.isFinite(num)) return String(Math.trunc(num));
  return "0";
}

const GUILDS_DIR = path.join(process.cwd(), "data", "guilds");
if (!fs.existsSync(GUILDS_DIR)) {
  console.error("❌ data/guilds フォルダが見つかりません。");
  process.exit(1);
}

const files = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith(".json"));
if (files.length === 0) {
  console.log("✅ 旧 JSON ファイルが見つかりません。");
  process.exit(0);
}

for (const file of files) {
  const gid = path.basename(file, ".json");
  const jsonPath = path.join(GUILDS_DIR, file);
  const dbPath = path.join(GUILDS_DIR, `${gid}.db`);

  console.log(`移行中: ${file} → ${gid}.db`);

  // JSON を読み込み
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (e) {
    console.error(`⚠️ JSON 読み込み失敗: ${file}`, e);
    continue;
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts(
      userId TEXT PRIMARY KEY,
      count  TEXT NOT NULL DEFAULT '0'
    );
    CREATE TABLE IF NOT EXISTS immune(
      userId TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      actor TEXT,
      target TEXT,
      reason TEXT,
      delta TEXT NOT NULL
    );
  `);

  const tx = db.transaction(() => {
    // counts
    if (data.counts) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO counts(userId, count) VALUES(?, ?)`);
      for (const [uid, cnt] of Object.entries(data.counts)) {
        stmt.run(uid, toCountText(cnt));
      }
    }

    // immune
    if (data.immune) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`);
      for (const uid of data.immune as string[]) {
        stmt.run(uid);
      }
    }

    // settings
    if (data.settings) {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`
      );
      if ("sbkMin" in data.settings)
        stmt.run("sbkMin", String(data.settings.sbkMin));
      if ("sbkMax" in data.settings)
        stmt.run("sbkMax", String(data.settings.sbkMax));
    }
  });
  tx();

  console.log(`✅ 完了: ${gid}.db`);
}

console.log("\n🎉 すべての JSON → SQLite 移行が完了しました。");
