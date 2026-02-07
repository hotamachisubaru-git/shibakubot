"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDb = openDb;
exports.getAllCounts = getAllCounts;
exports.getImmuneList = getImmuneList;
exports.getRecentLogs = getRecentLogs;
exports.getLogCount = getLogCount;
exports.addCountGuild = addCountGuild;
exports.setCountGuild = setCountGuild;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
exports.isImmune = isImmune;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.getSbkRange = getSbkRange;
exports.getUserMusicVolume = getUserMusicVolume;
exports.setUserMusicVolume = setUserMusicVolume;
exports.getMusicNgWords = getMusicNgWords;
exports.addMusicNgWord = addMusicNgWord;
exports.removeMusicNgWord = removeMusicNgWord;
exports.clearMusicNgWords = clearMusicNgWords;
exports.getMusicEnabled = getMusicEnabled;
exports.setMusicEnabled = setMusicEnabled;
exports.getMaintenanceEnabled = getMaintenanceEnabled;
exports.setMaintenanceEnabled = setMaintenanceEnabled;
exports.setSbkRange = setSbkRange;
exports.loadGuildStore = loadGuildStore;
exports.getMedalBalance = getMedalBalance;
exports.getTopMedals = getTopMedals;
exports.setMedals = setMedals;
exports.addMedals = addMedals;
// src/data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
// メダル用（非同期 sqlite）
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const BIGINT_RE = /^-?\d+$/;
function hasTextAffinity(type) {
    const t = (type ?? "").toUpperCase();
    return t.includes("TEXT") || t.includes("CHAR") || t.includes("CLOB");
}
function coerceBigInt(value, fallback = 0n) {
    if (typeof value === "bigint")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            return fallback;
        return BigInt(Math.trunc(value));
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!BIGINT_RE.test(trimmed))
            return fallback;
        try {
            return BigInt(trimmed);
        }
        catch {
            return fallback;
        }
    }
    return fallback;
}
function toBigIntInput(value) {
    if (typeof value === "bigint")
        return value;
    if (!Number.isFinite(value))
        return 0n;
    return BigInt(Math.trunc(value));
}
function toDbText(value) {
    return value.toString();
}
// ---------- パス系 ----------
const DATA_DIR = path_1.default.join(process.cwd(), "data", "guilds");
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
function dbPath(gid) {
    ensureDir(DATA_DIR);
    return path_1.default.join(DATA_DIR, `${gid}.db`);
}
// メダルバンク DB パス
const MEDAL_DB_PATH = path_1.default.join(process.cwd(), "data", "medalbank.db");
// ---------- スキーマ & マイグレ ----------
function ensureSchema(db) {
    // 期待する各テーブルを作成
    db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      userId TEXT PRIMARY KEY,
      count  TEXT NOT NULL DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS immune (
      userId TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      at     INTEGER NOT NULL,
      actor  TEXT,
      target TEXT NOT NULL,
      reason TEXT,
      delta  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_music_settings (
      userId TEXT NOT NULL,
      key    TEXT NOT NULL,
      value  TEXT,
      PRIMARY KEY (userId, key)
    );

  `);
    // counts の列チェック（legacy: user / username → userId）
    let cols = db.prepare(`PRAGMA table_info(counts)`).all();
    const hasUserId = cols.some((c) => c.name === "userId");
    const hasUser = cols.some((c) => c.name === "user");
    const hasUsername = cols.some((c) => c.name === "username");
    if (!hasUserId && (hasUser || hasUsername)) {
        const sourceCol = hasUser ? "user" : "username";
        db.transaction(() => {
            db.exec(`ALTER TABLE counts RENAME TO counts_legacy;`);
            db.exec(`
        CREATE TABLE counts (
          userId TEXT PRIMARY KEY,
          count  TEXT NOT NULL DEFAULT '0'
        );
      `);
            db.exec(`
        INSERT INTO counts(userId, count)
        SELECT ${sourceCol}, CAST(count AS TEXT) FROM counts_legacy;
      `);
            db.exec(`DROP TABLE counts_legacy;`);
        })();
    }
    cols = db.prepare(`PRAGMA table_info(counts)`).all();
    const countCol = cols.find((c) => c.name === "count");
    if (countCol && !hasTextAffinity(countCol.type)) {
        db.transaction(() => {
            db.exec(`ALTER TABLE counts RENAME TO counts_text_legacy;`);
            db.exec(`
        CREATE TABLE counts (
          userId TEXT PRIMARY KEY,
          count  TEXT NOT NULL DEFAULT '0'
        );
      `);
            db.exec(`
        INSERT INTO counts(userId, count)
        SELECT userId, CAST(count AS TEXT) FROM counts_text_legacy;
      `);
            db.exec(`DROP TABLE counts_text_legacy;`);
        })();
    }
    const logCols = db.prepare(`PRAGMA table_info(logs)`).all();
    const deltaCol = logCols.find((c) => c.name === "delta");
    if (deltaCol && !hasTextAffinity(deltaCol.type)) {
        db.transaction(() => {
            db.exec(`ALTER TABLE logs RENAME TO logs_text_legacy;`);
            db.exec(`
        CREATE TABLE logs (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          at     INTEGER NOT NULL,
          actor  TEXT,
          target TEXT NOT NULL,
          reason TEXT,
          delta  TEXT NOT NULL
        );
      `);
            db.exec(`
        INSERT INTO logs(id, at, actor, target, reason, delta)
        SELECT id, at, actor, target, reason, CAST(delta AS TEXT) FROM logs_text_legacy;
      `);
            db.exec(`DROP TABLE logs_text_legacy;`);
        })();
    }
}
// ---------- DB open (これだけを使う) ----------
function openDb(gid) {
    const db = new better_sqlite3_1.default(dbPath(gid));
    db.pragma("journal_mode = WAL");
    ensureSchema(db);
    return db;
}
// ---------- 読み取り ----------
function getAllCounts(gid) {
    const db = openDb(gid);
    const rows = db.prepare(`SELECT userId, count FROM counts`).all();
    const map = {};
    for (const r of rows)
        map[r.userId] = coerceBigInt(r.count);
    return map;
}
function getImmuneList(gid) {
    const db = openDb(gid);
    const rows = db.prepare(`SELECT userId FROM immune`).all();
    return rows.map((r) => r.userId);
}
// ---------- ログ ----------
function getRecentLogs(gid, limit = 20) {
    const db = openDb(gid);
    const rows = db
        .prepare(`
    SELECT id, at, actor, target, reason, delta
    FROM logs
    ORDER BY id DESC
    LIMIT ?
  `)
        .all(limit);
    return rows.map((row) => ({
        ...row,
        delta: coerceBigInt(row.delta),
    }));
}
function getLogCount(gid) {
    const db = openDb(gid);
    const row = db.prepare(`SELECT COUNT(*) AS count FROM logs`).get();
    return row?.count ?? 0;
}
// ---------- 書き込み ----------
function addCountGuild(gid, userId, by = 1, actor, reason) {
    const db = openDb(gid);
    const tx = db.transaction(() => {
        const delta = toBigIntInput(by);
        const currentRow = db
            .prepare(`SELECT count FROM counts WHERE userId=?`)
            .get(userId);
        const current = coerceBigInt(currentRow?.count);
        const next = current + delta;
        db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = excluded.count
    `).run(userId, toDbText(next));
        db.prepare(`
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `).run(Date.now(), actor ?? null, userId, reason ?? null, toDbText(delta));
        return next;
    });
    return tx();
}
function setCountGuild(gid, userId, value) {
    const db = openDb(gid);
    const next = toBigIntInput(value);
    const clamped = next < 0n ? 0n : next;
    db.prepare(`
    INSERT INTO counts(userId, count) VALUES(?, ?)
    ON CONFLICT(userId) DO UPDATE SET count = excluded.count
  `).run(userId, toDbText(clamped));
    const row = db
        .prepare(`SELECT count FROM counts WHERE userId=?`)
        .get(userId);
    return row ? coerceBigInt(row.count) : clamped;
}
// ---------- 免除 ----------
function addImmuneId(gid, userId) {
    const db = openDb(gid);
    return (db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`).run(userId)
        .changes > 0);
}
function removeImmuneId(gid, userId) {
    const db = openDb(gid);
    return (db.prepare(`DELETE FROM immune WHERE userId=?`).run(userId).changes > 0);
}
function isImmune(gid, userId) {
    const db = openDb(gid);
    return !!db.prepare(`SELECT 1 FROM immune WHERE userId=?`).get(userId);
}
// ---------- しばく回数の範囲 ----------
const SBK_MIN_KEY = "sbkMin";
const SBK_MAX_KEY = "sbkMax";
const SBK_MIN_DEFAULT = 1;
const SBK_MAX_DEFAULT = 25; // 初期値としてだけ使う
function getSetting(gid, key) {
    const db = openDb(gid);
    const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key);
    return row?.value ?? null;
}
function setSetting(gid, key, value) {
    const db = openDb(gid);
    if (value === null) {
        db.prepare(`DELETE FROM settings WHERE key=?`).run(key);
        return;
    }
    db.prepare(`
    INSERT INTO settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, value);
}
function getSbkRange(gid) {
    const db = openDb(gid);
    const minRow = db
        .prepare(`SELECT value FROM settings WHERE key=?`)
        .get(SBK_MIN_KEY);
    const maxRow = db
        .prepare(`SELECT value FROM settings WHERE key=?`)
        .get(SBK_MAX_KEY);
    let min = Number(minRow?.value ?? SBK_MIN_DEFAULT);
    let max = Number(maxRow?.value ?? SBK_MAX_DEFAULT);
    // 数値チェック & 下限だけ守る（1以上・max は min 以上）
    if (!Number.isFinite(min) || min < 1)
        min = SBK_MIN_DEFAULT;
    if (!Number.isFinite(max) || max < min)
        max = min;
    min = Math.floor(min);
    max = Math.floor(max);
    return { min, max };
}
// ---------- 音量設定 ----------
const MUSIC_VOL_KEY = "musicVolume";
const MUSIC_VOL_DEFAULT = 20;
const MUSIC_VOL_MIN = 0;
const MUSIC_VOL_MAX = 20;
function getUserMusicVolume(gid, userId) {
    const db = openDb(gid);
    const row = db
        .prepare(`SELECT value FROM user_music_settings WHERE userId=? AND key=?`)
        .get(userId, MUSIC_VOL_KEY);
    const v = Number(row?.value ?? MUSIC_VOL_DEFAULT);
    if (!Number.isFinite(v))
        return MUSIC_VOL_DEFAULT;
    return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(v)));
}
function setUserMusicVolume(gid, userId, vol) {
    const db = openDb(gid);
    const clamped = Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(vol)));
    db.prepare(`
    INSERT INTO user_music_settings(userId, key, value) VALUES(?, ?, ?)
    ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
  `).run(userId, MUSIC_VOL_KEY, String(clamped));
    return clamped;
}
// ---------- 音楽 NG ワード ----------
const MUSIC_NG_KEY = "musicNgWords";
function normalizeNgWord(word) {
    return word.trim().toLowerCase();
}
function saveMusicNgWords(gid, words) {
    const normalized = Array.from(new Set(words.map(normalizeNgWord).filter((w) => w.length > 0))).sort();
    setSetting(gid, MUSIC_NG_KEY, JSON.stringify(normalized));
    return normalized;
}
function getMusicNgWords(gid) {
    const raw = getSetting(gid, MUSIC_NG_KEY);
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return Array.from(new Set(parsed
            .filter((w) => typeof w === "string")
            .map((w) => normalizeNgWord(w))
            .filter((w) => w.length > 0))).sort();
    }
    catch {
        return [];
    }
}
function addMusicNgWord(gid, word) {
    const current = getMusicNgWords(gid);
    const normalized = normalizeNgWord(word);
    if (!normalized)
        return { added: false, list: current };
    if (current.includes(normalized))
        return { added: false, list: current };
    const list = saveMusicNgWords(gid, [...current, normalized]);
    return { added: true, list };
}
function removeMusicNgWord(gid, word) {
    const current = getMusicNgWords(gid);
    const normalized = normalizeNgWord(word);
    if (!normalized)
        return { removed: false, list: current };
    const next = current.filter((w) => w !== normalized);
    if (next.length === current.length)
        return { removed: false, list: current };
    const list = saveMusicNgWords(gid, next);
    return { removed: true, list };
}
function clearMusicNgWords(gid) {
    setSetting(gid, MUSIC_NG_KEY, JSON.stringify([]));
}
// ---------- 音楽機能有効化設定 ----------
const MUSIC_ENABLED_KEY = "musicEnabled";
function getMusicEnabled(gid) {
    const raw = getSetting(gid, MUSIC_ENABLED_KEY);
    if (!raw)
        return true; // デフォルト有効
    return raw.toLowerCase() === "true";
}
function setMusicEnabled(gid, enabled) {
    setSetting(gid, MUSIC_ENABLED_KEY, enabled ? "true" : "false");
}
// ---------- メンテナンスモード ----------
const MAINTENANCE_KEY = "maintenanceEnabled";
function getMaintenanceEnabled(gid) {
    const raw = getSetting(gid, MAINTENANCE_KEY);
    if (!raw)
        return false; // デフォルト無効
    return raw.toLowerCase() === "true";
}
function setMaintenanceEnabled(gid, enabled) {
    setSetting(gid, MAINTENANCE_KEY, enabled ? "true" : "false");
}
function setSbkRange(gid, min, max) {
    const db = openDb(gid);
    if (!Number.isFinite(min) || min < 1)
        min = SBK_MIN_DEFAULT;
    if (!Number.isFinite(max) || max < min)
        max = min;
    min = Math.floor(min);
    max = Math.floor(max);
    db.transaction(() => {
        db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SBK_MIN_KEY, String(min));
        db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SBK_MAX_KEY, String(max));
    })();
    return { min, max };
}
// ---------- 互換ラッパ ----------
function loadGuildStore(gid) {
    const { min, max } = getSbkRange(gid);
    return {
        counts: getAllCounts(gid),
        immune: getImmuneList(gid),
        settings: { sbkMin: min, sbkMax: max },
    };
}
// ------------------------------
// メダルバンク（SQLite, 非同期）
// ------------------------------
let medalDB = null;
async function getMedalDB() {
    if (!medalDB) {
        ensureDir(path_1.default.dirname(MEDAL_DB_PATH));
        medalDB = await (0, sqlite_1.open)({
            filename: MEDAL_DB_PATH,
            driver: sqlite3_1.default.Database,
        });
        await medalDB.exec(`
      CREATE TABLE IF NOT EXISTS medals (
        user_id TEXT PRIMARY KEY,
        balance TEXT NOT NULL DEFAULT '0'
      );
    `);
        const cols = await medalDB.all(`PRAGMA table_info(medals)`);
        const balanceCol = cols.find((c) => c.name === "balance");
        if (balanceCol && !hasTextAffinity(balanceCol.type)) {
            await medalDB.exec("BEGIN");
            try {
                await medalDB.exec(`ALTER TABLE medals RENAME TO medals_text_legacy;`);
                await medalDB.exec(`
          CREATE TABLE medals (
            user_id TEXT PRIMARY KEY,
            balance TEXT NOT NULL DEFAULT '0'
          );
        `);
                await medalDB.exec(`
          INSERT INTO medals(user_id, balance)
          SELECT user_id, CAST(balance AS TEXT) FROM medals_text_legacy;
        `);
                await medalDB.exec(`DROP TABLE medals_text_legacy;`);
                await medalDB.exec("COMMIT");
            }
            catch (e) {
                await medalDB.exec("ROLLBACK");
                throw e;
            }
        }
    }
    return medalDB;
}
// 残高取得（なければ自動で 1000 を付与）
async function getMedalBalance(userId) {
    const db = await getMedalDB();
    const row = await db.get("SELECT balance FROM medals WHERE user_id = ?", userId);
    if (row) {
        return coerceBigInt(row.balance);
    }
    // ★ ここ：未登録ユーザー → 自動で 1000 を保存
    const defaultBalance = 1000n;
    await db.run("INSERT INTO medals (user_id, balance) VALUES (?, ?)", userId, toDbText(defaultBalance));
    return defaultBalance;
}
async function getTopMedals(limit = 20) {
    const db = await getMedalDB();
    const rows = await db.all(`
      SELECT user_id, balance
      FROM medals
      ORDER BY LENGTH(balance) DESC, balance DESC
      LIMIT ?
    `, [limit]);
    return rows.map((r) => ({
        userId: r.user_id,
        balance: coerceBigInt(r.balance),
    }));
}
// 残高を上書き
async function setMedals(userId, amount) {
    const db = await getMedalDB();
    const next = toBigIntInput(amount);
    await db.run(`
      INSERT INTO medals (user_id, balance)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance;
    `, userId, toDbText(next));
    return next;
}
// 増減
async function addMedals(userId, diff) {
    const db = await getMedalDB();
    const before = await getMedalBalance(userId);
    const delta = toBigIntInput(diff);
    const next = before + delta;
    const after = next < 0n ? 0n : next;
    await db.run(`
      INSERT INTO medals (user_id, balance)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance;
    `, userId, toDbText(after));
    return after;
}
