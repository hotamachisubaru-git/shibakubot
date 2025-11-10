"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCounts = getAllCounts;
exports.getImmuneList = getImmuneList;
exports.addCountGuild = addCountGuild;
exports.setCountGuild = setCountGuild;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
exports.isImmune = isImmune;
exports.getSbkRange = getSbkRange;
exports.setSbkRange = setSbkRange;
exports.loadGuildStore = loadGuildStore;
// src/data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data', 'guilds');
function ensureDir(p) { if (!fs_1.default.existsSync(p))
    fs_1.default.mkdirSync(p, { recursive: true }); }
function dbFile(gid) { ensureDir(DATA_DIR); return path_1.default.join(DATA_DIR, `${gid}.db`); }
// 1. DB オープン＆スキーマ
function openDb(gid) {
    const db = new better_sqlite3_1.default(dbFile(gid));
    db.pragma('journal_mode = WAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS counts(
      userId   TEXT PRIMARY KEY,
      count    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS immune(
      userId   TEXT PRIMARY KEY
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
      delta INTEGER NOT NULL
    );
  `);
    return db;
}
// 2. 読み取り
// ① 全件取得
function getAllCounts(gid) {
    const db = openDb(gid);
    const rows = db
        .prepare(`SELECT userId, count FROM counts ORDER BY count DESC`)
        .all(); // ←型を明示
    const map = {};
    for (const r of rows) { // r は {userId, count}
        map[r.userId] = r.count;
    }
    return map;
}
function getImmuneList(gid) {
    const db = openDb(gid);
    const rows = db
        .prepare(`SELECT userId FROM immune`)
        .all(); // ←型を明示
    return rows.map(r => r.userId);
}
// 3. しばき加算（UPSERT）
function addCountGuild(gid, userId, by = 1, actor, reason) {
    const db = openDb(gid);
    const tx = db.transaction(() => {
        db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = count + excluded.count
    `).run(userId, by);
        db.prepare(`INSERT INTO logs(at, actor, target, reason, delta) VALUES(?,?,?,?,?)`)
            .run(Date.now(), actor ?? null, userId, reason ?? null, by);
        const row = db
            .prepare(`SELECT count FROM counts WHERE userId=?`)
            .get(userId); // ←型を明示
        return row?.count ?? by;
    });
    return tx();
}
// 4. しばき値を直接セット（/control 用）
function setCountGuild(gid, userId, value) {
    const db = openDb(gid);
    db.prepare(`
    INSERT INTO counts(userId, count) VALUES(?, ?)
    ON CONFLICT(userId) DO UPDATE SET count = excluded.count
  `).run(userId, Math.max(0, value));
    const row = db
        .prepare(`SELECT count FROM counts WHERE userId=?`)
        .get(userId); // ←型を明示
    return row?.count ?? 0;
}
// 5. 免除
function addImmuneId(gid, userId) {
    const db = openDb(gid);
    const info = db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`).run(userId);
    return info.changes > 0;
}
function removeImmuneId(gid, userId) {
    const db = openDb(gid);
    return db.prepare(`DELETE FROM immune WHERE userId=?`).run(userId).changes > 0;
}
function isImmune(gid, userId) {
    const db = openDb(gid);
    return !!db.prepare(`SELECT 1 FROM immune WHERE userId=?`).get(userId);
}
// 6. しばき範囲（settings テーブル）
const SBK_MIN_KEY = 'sbkMin';
const SBK_MAX_KEY = 'sbkMax';
const SBK_MIN_DEFAULT = 1;
const SBK_MAX_DEFAULT = 25;
function getSbkRange(gid) {
    const db = openDb(gid);
    const minRow = db
        .prepare(`SELECT value FROM settings WHERE key=?`)
        .get('sbkMin'); // ←型を明示
    const maxRow = db
        .prepare(`SELECT value FROM settings WHERE key=?`)
        .get('sbkMax');
    let min = Number(minRow?.value ?? 1);
    let max = Number(maxRow?.value ?? 25);
    min = Math.max(1, Math.min(min, 25));
    max = Math.max(min, Math.min(max, 25));
    return { min, max };
}
function setSbkRange(gid, min, max) {
    const db = openDb(gid);
    min = Math.max(1, Math.min(min, 25));
    max = Math.max(min, Math.min(max, 25));
    const tx = db.transaction(() => {
        db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(SBK_MIN_KEY, String(min));
        db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(SBK_MAX_KEY, String(max));
    });
    tx();
    return { min, max };
}
// 7. 互換ラッパ（既存コードが store.* を前提にしている箇所のため）
function loadGuildStore(gid) {
    return {
        counts: getAllCounts(gid),
        immune: getImmuneList(gid),
        settings: (() => {
            const { min, max } = getSbkRange(gid);
            return { sbkMin: min, sbkMax: max };
        })(),
    };
}
// JSON 時代の saveGuildStore は不要。残ってるなら呼び出しを削除/置換してください。
