"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDb = openDb;
exports.getAllCounts = getAllCounts;
exports.getUserCount = getUserCount;
exports.getTrackedUserCount = getTrackedUserCount;
exports.getCountRankingPage = getCountRankingPage;
exports.getTopCountEntries = getTopCountEntries;
exports.getImmuneList = getImmuneList;
exports.getGuildStatsSnapshot = getGuildStatsSnapshot;
exports.getRecentLogs = getRecentLogs;
exports.getLogCount = getLogCount;
exports.addCountGuild = addCountGuild;
exports.setCountGuild = setCountGuild;
exports.resetAllCounts = resetAllCounts;
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
exports.getAiChatEnabled = getAiChatEnabled;
exports.setAiChatEnabled = setAiChatEnabled;
exports.setSbkRange = setSbkRange;
exports.getAiConversationHistory = getAiConversationHistory;
exports.appendAiConversationTurn = appendAiConversationTurn;
exports.getAiConversationLastTurn = getAiConversationLastTurn;
exports.removeAiConversationLastTurn = removeAiConversationLastTurn;
exports.resetAiConversation = resetAiConversation;
exports.getAiCustomPrompt = getAiCustomPrompt;
exports.setAiCustomPrompt = setAiCustomPrompt;
exports.getAiCharacter = getAiCharacter;
exports.setAiCharacter = setAiCharacter;
exports.getAiReplyState = getAiReplyState;
exports.setAiReplyState = setAiReplyState;
exports.clearAiReplyState = clearAiReplyState;
exports.getAiGuildMemory = getAiGuildMemory;
exports.setAiGuildMemory = setAiGuildMemory;
exports.clearAiGuildMemory = clearAiGuildMemory;
exports.getGuildDbInfo = getGuildDbInfo;
exports.checkpointGuildDb = checkpointGuildDb;
exports.vacuumGuildDb = vacuumGuildDb;
exports.loadGuildStore = loadGuildStore;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const runtime_1 = require("./config/runtime");
const paths_1 = require("./constants/paths");
const settings_1 = require("./constants/settings");
const BIGINT_RE = /^-?\d+$/;
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const guildDbContexts = new Map();
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
function parseSettingBoolean(raw, fallback) {
    if (raw === null)
        return fallback;
    return raw.toLowerCase() === "true";
}
function sumCounts(counts) {
    let total = 0n;
    for (const value of Object.values(counts)) {
        total += value;
    }
    return total;
}
// ---------- パス系 ----------
const DATA_DIR = paths_1.GUILD_DB_ROOT;
function ensureDir(p) {
    if (!node_fs_1.default.existsSync(p))
        node_fs_1.default.mkdirSync(p, { recursive: true });
}
function dbPath(gid) {
    ensureDir(DATA_DIR);
    return node_path_1.default.join(DATA_DIR, `${gid}.db`);
}
// ---------- スキーマ & マイグレ ----------
function ensureSchema(db) {
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

    CREATE TABLE IF NOT EXISTS ai_sessions (
      conversationKey TEXT PRIMARY KEY,
      customPrompt    TEXT,
      characterId     TEXT,
      updatedAt       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationKey TEXT NOT NULL,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      createdAt       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
      ON ai_messages(conversationKey, id);

    CREATE TABLE IF NOT EXISTS ai_reply_states (
      conversationKey      TEXT PRIMARY KEY,
      targetMessageId      TEXT NOT NULL,
      userMessage          TEXT NOT NULL,
      quickReplyInput      TEXT NOT NULL,
      lastAssistantMessage TEXT NOT NULL,
      isPrivate            INTEGER NOT NULL DEFAULT 0,
      updatedAt            INTEGER NOT NULL DEFAULT 0
    );
  `);
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
function buildStatements(db) {
    return {
        selectAllCounts: db.prepare(`SELECT userId, count FROM counts`),
        selectCountByUser: db.prepare(`SELECT count FROM counts WHERE userId=?`),
        upsertCount: db.prepare(`
      INSERT INTO counts(userId, count) VALUES(?, ?)
      ON CONFLICT(userId) DO UPDATE SET count = excluded.count
    `),
        resetAllCounts: db.prepare(`UPDATE counts SET count='0'`),
        countTrackedUsers: db.prepare(`SELECT COUNT(*) AS count FROM counts`),
        // count は TEXT 管理なので、非負整数である前提で桁数 -> 文字列の順に並べる。
        selectRankedCountsPage: db.prepare(`
      SELECT userId, count
      FROM counts
      ORDER BY LENGTH(count) DESC, count DESC, userId ASC
      LIMIT ? OFFSET ?
    `),
        selectAllImmuneIds: db.prepare(`SELECT userId FROM immune`),
        selectImmuneId: db.prepare(`SELECT userId FROM immune WHERE userId=?`),
        insertImmuneId: db.prepare(`INSERT OR IGNORE INTO immune(userId) VALUES(?)`),
        deleteImmuneId: db.prepare(`DELETE FROM immune WHERE userId=?`),
        countImmuneIds: db.prepare(`SELECT COUNT(*) AS count FROM immune`),
        selectSetting: db.prepare(`SELECT value FROM settings WHERE key=?`),
        upsertSetting: db.prepare(`
      INSERT INTO settings(key, value) VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `),
        deleteSetting: db.prepare(`DELETE FROM settings WHERE key=?`),
        selectRecentLogs: db.prepare(`
      SELECT id, at, actor, target, reason, delta
      FROM logs
      ORDER BY id DESC
      LIMIT ?
    `),
        countLogs: db.prepare(`SELECT COUNT(*) AS count FROM logs`),
        insertLog: db.prepare(`
      INSERT INTO logs(at, actor, target, reason, delta)
      VALUES(?,?,?,?,?)
    `),
        countSettings: db.prepare(`SELECT COUNT(*) AS count FROM settings`),
        selectMusicVolume: db.prepare(`
      SELECT value
      FROM user_music_settings
      WHERE userId=? AND key=?
    `),
        upsertMusicVolume: db.prepare(`
      INSERT INTO user_music_settings(userId, key, value) VALUES(?, ?, ?)
      ON CONFLICT(userId, key) DO UPDATE SET value = excluded.value
    `),
        selectAiSession: db.prepare(`
      SELECT customPrompt, characterId
      FROM ai_sessions
      WHERE conversationKey=?
    `),
        upsertAiSession: db.prepare(`
      INSERT INTO ai_sessions(conversationKey, customPrompt, characterId, updatedAt)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(conversationKey) DO UPDATE
      SET customPrompt = excluded.customPrompt,
          characterId = excluded.characterId,
          updatedAt = excluded.updatedAt
    `),
        deleteAiSession: db.prepare(`
      DELETE FROM ai_sessions
      WHERE conversationKey=?
    `),
        selectAiMessages: db.prepare(`
      SELECT role, content
      FROM ai_messages
      WHERE conversationKey=?
      ORDER BY id ASC
    `),
        selectAiMessagesDescLimited: db.prepare(`
      SELECT id, role, content
      FROM ai_messages
      WHERE conversationKey=?
      ORDER BY id DESC
      LIMIT ?
    `),
        insertAiMessage: db.prepare(`
      INSERT INTO ai_messages(conversationKey, role, content, createdAt)
      VALUES(?, ?, ?, ?)
    `),
        countAiMessages: db.prepare(`
      SELECT COUNT(*) AS count
      FROM ai_messages
      WHERE conversationKey=?
    `),
        deleteOldestAiMessages: db.prepare(`
      DELETE FROM ai_messages
      WHERE id IN (
        SELECT id
        FROM ai_messages
        WHERE conversationKey=?
        ORDER BY id ASC
        LIMIT ?
      )
    `),
        deleteAiMessagesByConversation: db.prepare(`
      DELETE FROM ai_messages
      WHERE conversationKey=?
    `),
        deleteAiMessageById: db.prepare(`
      DELETE FROM ai_messages
      WHERE id=?
    `),
        selectAiReplyState: db.prepare(`
      SELECT
        targetMessageId,
        userMessage,
        quickReplyInput,
        lastAssistantMessage,
        isPrivate
      FROM ai_reply_states
      WHERE conversationKey=?
    `),
        upsertAiReplyState: db.prepare(`
      INSERT INTO ai_reply_states(
        conversationKey,
        targetMessageId,
        userMessage,
        quickReplyInput,
        lastAssistantMessage,
        isPrivate,
        updatedAt
      )
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversationKey) DO UPDATE
      SET targetMessageId = excluded.targetMessageId,
          userMessage = excluded.userMessage,
          quickReplyInput = excluded.quickReplyInput,
          lastAssistantMessage = excluded.lastAssistantMessage,
          isPrivate = excluded.isPrivate,
          updatedAt = excluded.updatedAt
    `),
        deleteAiReplyState: db.prepare(`
      DELETE FROM ai_reply_states
      WHERE conversationKey=?
    `),
    };
}
// ---------- DB open ----------
function openDb(gid) {
    const db = new better_sqlite3_1.default(dbPath(gid));
    db.pragma("journal_mode = WAL");
    ensureSchema(db);
    return db;
}
function createGuildDbContext(gid) {
    const db = openDb(gid);
    return {
        db,
        statements: buildStatements(db),
        settingsCache: new Map(),
        countsCache: null,
        immuneCache: null,
    };
}
function getGuildDbContext(gid) {
    const existing = guildDbContexts.get(gid);
    if (existing) {
        return existing;
    }
    const created = createGuildDbContext(gid);
    guildDbContexts.set(gid, created);
    return created;
}
function closeGuildDbContext(gid) {
    const existing = guildDbContexts.get(gid);
    if (!existing)
        return;
    guildDbContexts.delete(gid);
    try {
        existing.db.close();
    }
    catch {
        // noop
    }
}
function closeAllGuildDbContexts() {
    for (const gid of [...guildDbContexts.keys()]) {
        closeGuildDbContext(gid);
    }
}
process.once("exit", () => {
    closeAllGuildDbContexts();
});
function getAiSessionRow(context, conversationKey) {
    return context.statements.selectAiSession.get(conversationKey);
}
function saveAiSessionRow(context, conversationKey, customPrompt, characterId) {
    if (customPrompt === null && characterId === null) {
        context.statements.deleteAiSession.run(conversationKey);
        return;
    }
    context.statements.upsertAiSession.run(conversationKey, customPrompt, characterId, Date.now());
}
function normalizeAiRole(role) {
    if (role === "system" || role === "user" || role === "assistant") {
        return role;
    }
    return undefined;
}
function getAiMessageCount(context, conversationKey) {
    const row = context.statements.countAiMessages.get(conversationKey);
    return row?.count ?? 0;
}
function loadCountsCache(context) {
    if (context.countsCache) {
        return context.countsCache;
    }
    const map = {};
    const rows = context.statements.selectAllCounts.all();
    for (const row of rows) {
        map[row.userId] = coerceBigInt(row.count);
    }
    context.countsCache = map;
    return map;
}
function loadImmuneCache(context) {
    if (context.immuneCache) {
        return context.immuneCache;
    }
    const ids = new Set();
    const rows = context.statements.selectAllImmuneIds.all();
    for (const row of rows) {
        ids.add(row.userId);
    }
    context.immuneCache = ids;
    return ids;
}
function getCountRow(context, userId) {
    const row = context.statements.selectCountByUser.get(userId);
    return coerceBigInt(row?.count);
}
function runGuildMaintenance(gid, task) {
    closeGuildDbContext(gid);
    const db = openDb(gid);
    try {
        return task(db);
    }
    finally {
        db.close();
    }
}
// ---------- 読み取り ----------
function getAllCounts(gid) {
    const counts = loadCountsCache(getGuildDbContext(gid));
    return { ...counts };
}
function getUserCount(gid, userId) {
    const context = getGuildDbContext(gid);
    if (context.countsCache) {
        return context.countsCache[userId] ?? 0n;
    }
    return getCountRow(context, userId);
}
function getTrackedUserCount(gid) {
    const context = getGuildDbContext(gid);
    if (context.countsCache) {
        return Object.keys(context.countsCache).length;
    }
    const row = context.statements.countTrackedUsers.get();
    return row?.count ?? 0;
}
function getCountRankingPage(gid, offset, limit) {
    const context = getGuildDbContext(gid);
    const rows = context.statements.selectRankedCountsPage.all(limit, offset);
    return rows.map((row) => [row.userId, coerceBigInt(row.count)]);
}
function getTopCountEntries(gid, limit) {
    return getCountRankingPage(gid, 0, limit);
}
function getImmuneList(gid) {
    return [...loadImmuneCache(getGuildDbContext(gid))];
}
function getGuildStatsSnapshot(gid) {
    const context = getGuildDbContext(gid);
    const counts = loadCountsCache(context);
    const immune = loadImmuneCache(context);
    return {
        total: sumCounts(counts),
        members: Object.keys(counts).length,
        immune: immune.size,
    };
}
// ---------- ログ ----------
function getRecentLogs(gid, limit = 20) {
    const context = getGuildDbContext(gid);
    const rows = context.statements.selectRecentLogs.all(limit);
    return rows.map((row) => ({
        ...row,
        delta: coerceBigInt(row.delta),
    }));
}
function getLogCount(gid) {
    const context = getGuildDbContext(gid);
    const row = context.statements.countLogs.get();
    return row?.count ?? 0;
}
// ---------- 書き込み ----------
function addCountGuild(gid, userId, by = 1, actor, reason) {
    const context = getGuildDbContext(gid);
    const tx = context.db.transaction(() => {
        const delta = toBigIntInput(by);
        const current = context.countsCache
            ? (context.countsCache[userId] ?? 0n)
            : getCountRow(context, userId);
        const next = current + delta;
        context.statements.upsertCount.run(userId, toDbText(next));
        context.statements.insertLog.run(Date.now(), actor ?? null, userId, reason ?? null, toDbText(delta));
        if (context.countsCache) {
            context.countsCache[userId] = next;
        }
        return next;
    });
    return tx();
}
function setCountGuild(gid, userId, value) {
    const context = getGuildDbContext(gid);
    const next = toBigIntInput(value);
    const clamped = next < 0n ? 0n : next;
    context.statements.upsertCount.run(userId, toDbText(clamped));
    if (context.countsCache) {
        context.countsCache[userId] = clamped;
    }
    return clamped;
}
function resetAllCounts(gid) {
    const context = getGuildDbContext(gid);
    context.statements.resetAllCounts.run();
    if (!context.countsCache) {
        return;
    }
    for (const userId of Object.keys(context.countsCache)) {
        context.countsCache[userId] = 0n;
    }
}
// ---------- 免除 ----------
function addImmuneId(gid, userId) {
    const context = getGuildDbContext(gid);
    const added = context.statements.insertImmuneId.run(userId).changes > 0;
    if (added && context.immuneCache) {
        context.immuneCache.add(userId);
    }
    return added;
}
function removeImmuneId(gid, userId) {
    const context = getGuildDbContext(gid);
    const removed = context.statements.deleteImmuneId.run(userId).changes > 0;
    if (removed && context.immuneCache) {
        context.immuneCache.delete(userId);
    }
    return removed;
}
function isImmune(gid, userId) {
    const context = getGuildDbContext(gid);
    if (context.immuneCache) {
        return context.immuneCache.has(userId);
    }
    return !!context.statements.selectImmuneId.get(userId);
}
// ---------- 設定 ----------
const SBK_MIN_DEFAULT = runtimeConfig.sbk.min;
const SBK_MAX_DEFAULT = runtimeConfig.sbk.max;
function getSetting(gid, key) {
    const context = getGuildDbContext(gid);
    if (context.settingsCache.has(key)) {
        return context.settingsCache.get(key) ?? null;
    }
    const row = context.statements.selectSetting.get(key);
    const value = row?.value ?? null;
    context.settingsCache.set(key, value);
    return value;
}
function setSetting(gid, key, value) {
    const context = getGuildDbContext(gid);
    if (value === null) {
        context.statements.deleteSetting.run(key);
        context.settingsCache.set(key, null);
        return;
    }
    context.statements.upsertSetting.run(key, value);
    context.settingsCache.set(key, value);
}
function getSbkRange(gid) {
    let min = Number(getSetting(gid, settings_1.SETTING_KEYS.sbkMin) ?? SBK_MIN_DEFAULT);
    let max = Number(getSetting(gid, settings_1.SETTING_KEYS.sbkMax) ?? SBK_MAX_DEFAULT);
    if (!Number.isFinite(min) || min < 1)
        min = SBK_MIN_DEFAULT;
    if (!Number.isFinite(max) || max < min)
        max = min;
    min = Math.floor(min);
    max = Math.floor(max);
    return { min, max };
}
// ---------- 音量設定 ----------
const MUSIC_VOL_DEFAULT = runtimeConfig.music.fixedVolume;
const MUSIC_VOL_MIN = 0;
const MUSIC_VOL_MAX = 20;
function getUserMusicVolume(gid, userId) {
    const context = getGuildDbContext(gid);
    const row = context.statements.selectMusicVolume.get(userId, settings_1.SETTING_KEYS.musicVolume);
    const v = Number(row?.value ?? MUSIC_VOL_DEFAULT);
    if (!Number.isFinite(v))
        return MUSIC_VOL_DEFAULT;
    return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(v)));
}
function setUserMusicVolume(gid, userId, vol) {
    const context = getGuildDbContext(gid);
    const clamped = Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(vol)));
    context.statements.upsertMusicVolume.run(userId, settings_1.SETTING_KEYS.musicVolume, String(clamped));
    return clamped;
}
// ---------- 音楽 NG ワード ----------
function normalizeNgWord(word) {
    return word.trim().toLowerCase();
}
function saveMusicNgWords(gid, words) {
    const normalized = Array.from(new Set(words.map(normalizeNgWord).filter((w) => w.length > 0))).sort();
    setSetting(gid, settings_1.SETTING_KEYS.musicNgWords, JSON.stringify(normalized));
    return normalized;
}
function getMusicNgWords(gid) {
    const raw = getSetting(gid, settings_1.SETTING_KEYS.musicNgWords);
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
    setSetting(gid, settings_1.SETTING_KEYS.musicNgWords, JSON.stringify([]));
}
// ---------- 音楽機能有効化設定 ----------
function getMusicEnabled(gid) {
    return parseSettingBoolean(getSetting(gid, settings_1.SETTING_KEYS.musicEnabled), true);
}
function setMusicEnabled(gid, enabled) {
    setSetting(gid, settings_1.SETTING_KEYS.musicEnabled, enabled ? "true" : "false");
}
// ---------- メンテナンスモード ----------
function getMaintenanceEnabled(gid) {
    return parseSettingBoolean(getSetting(gid, settings_1.SETTING_KEYS.maintenanceEnabled), false);
}
function setMaintenanceEnabled(gid, enabled) {
    setSetting(gid, settings_1.SETTING_KEYS.maintenanceEnabled, enabled ? "true" : "false");
}
// ---------- AIチャット有効化設定 ----------
function getAiChatEnabled(gid) {
    return parseSettingBoolean(getSetting(gid, settings_1.SETTING_KEYS.aiChatEnabled), true);
}
function setAiChatEnabled(gid, enabled) {
    setSetting(gid, settings_1.SETTING_KEYS.aiChatEnabled, enabled ? "true" : "false");
}
function setSbkRange(gid, min, max) {
    const context = getGuildDbContext(gid);
    const normalizedMin = Number.isFinite(min) && min >= 1 ? Math.floor(min) : SBK_MIN_DEFAULT;
    const normalizedMaxCandidate = Number.isFinite(max) ? Math.floor(max) : normalizedMin;
    const normalizedMax = Math.max(normalizedMin, normalizedMaxCandidate);
    context.db.transaction(() => {
        context.statements.upsertSetting.run(settings_1.SETTING_KEYS.sbkMin, String(normalizedMin));
        context.statements.upsertSetting.run(settings_1.SETTING_KEYS.sbkMax, String(normalizedMax));
    })();
    context.settingsCache.set(settings_1.SETTING_KEYS.sbkMin, String(normalizedMin));
    context.settingsCache.set(settings_1.SETTING_KEYS.sbkMax, String(normalizedMax));
    return { min: normalizedMin, max: normalizedMax };
}
// ---------- AI 会話 ----------
function getAiConversationHistory(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    const rows = context.statements.selectAiMessages.all(conversationKey);
    const messages = [];
    for (const row of rows) {
        const role = normalizeAiRole(row.role);
        if (!role) {
            continue;
        }
        messages.push({
            role,
            content: row.content,
        });
    }
    return messages;
}
function appendAiConversationTurn(gid, conversationKey, userMessage, assistantMessage, maxMessages) {
    const context = getGuildDbContext(gid);
    const safeMaxMessages = Math.max(2, Math.floor(maxMessages));
    context.db.transaction(() => {
        const now = Date.now();
        context.statements.insertAiMessage.run(conversationKey, "user", userMessage, now);
        context.statements.insertAiMessage.run(conversationKey, "assistant", assistantMessage, now);
        const overflow = getAiMessageCount(context, conversationKey) - safeMaxMessages;
        if (overflow > 0) {
            context.statements.deleteOldestAiMessages.run(conversationKey, overflow);
        }
    })();
}
function getAiConversationLastTurn(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    const rows = context.statements.selectAiMessagesDescLimited.all(conversationKey, 2);
    if (rows.length < 2) {
        return undefined;
    }
    const [assistant, user] = rows;
    if (assistant.role !== "assistant" || user.role !== "user") {
        return undefined;
    }
    return {
        userMessage: user.content,
        assistantMessage: assistant.content,
    };
}
function removeAiConversationLastTurn(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    return context.db.transaction(() => {
        const rows = context.statements.selectAiMessagesDescLimited.all(conversationKey, 2);
        if (rows.length < 2) {
            return undefined;
        }
        const [assistant, user] = rows;
        if (assistant.role !== "assistant" || user.role !== "user") {
            return undefined;
        }
        context.statements.deleteAiMessageById.run(assistant.id);
        context.statements.deleteAiMessageById.run(user.id);
        return {
            userMessage: user.content,
            assistantMessage: assistant.content,
        };
    })();
}
function resetAiConversation(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    context.statements.deleteAiMessagesByConversation.run(conversationKey);
}
function getAiCustomPrompt(gid, conversationKey) {
    return getAiSessionRow(getGuildDbContext(gid), conversationKey)?.customPrompt ?? null;
}
function setAiCustomPrompt(gid, conversationKey, prompt) {
    const context = getGuildDbContext(gid);
    const current = getAiSessionRow(context, conversationKey);
    saveAiSessionRow(context, conversationKey, prompt, current?.characterId ?? null);
}
function getAiCharacter(gid, conversationKey) {
    return getAiSessionRow(getGuildDbContext(gid), conversationKey)?.characterId ?? null;
}
function setAiCharacter(gid, conversationKey, characterId) {
    const context = getGuildDbContext(gid);
    const current = getAiSessionRow(context, conversationKey);
    saveAiSessionRow(context, conversationKey, current?.customPrompt ?? null, characterId);
}
function getAiReplyState(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    const row = context.statements.selectAiReplyState.get(conversationKey);
    if (!row) {
        return undefined;
    }
    return {
        targetMessageId: row.targetMessageId,
        userMessage: row.userMessage,
        quickReplyInput: row.quickReplyInput,
        lastAssistantMessage: row.lastAssistantMessage,
        isPrivate: row.isPrivate !== 0,
    };
}
function setAiReplyState(gid, conversationKey, state) {
    const context = getGuildDbContext(gid);
    context.statements.upsertAiReplyState.run(conversationKey, state.targetMessageId, state.userMessage, state.quickReplyInput, state.lastAssistantMessage, state.isPrivate ? 1 : 0, Date.now());
}
function clearAiReplyState(gid, conversationKey) {
    const context = getGuildDbContext(gid);
    context.statements.deleteAiReplyState.run(conversationKey);
}
function getAiGuildMemory(gid) {
    const raw = getSetting(gid, settings_1.SETTING_KEYS.aiGuildMemory);
    if (!raw) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.summary !== "string" ||
            typeof parsed.updatedAt !== "number" ||
            !Number.isFinite(parsed.updatedAt)) {
            return undefined;
        }
        return {
            summary: parsed.summary,
            updatedAt: parsed.updatedAt,
            sampledChannels: typeof parsed.sampledChannels === "number" && Number.isFinite(parsed.sampledChannels)
                ? Math.max(0, Math.floor(parsed.sampledChannels))
                : 0,
            sampledMessages: typeof parsed.sampledMessages === "number" && Number.isFinite(parsed.sampledMessages)
                ? Math.max(0, Math.floor(parsed.sampledMessages))
                : 0,
        };
    }
    catch {
        return undefined;
    }
}
function setAiGuildMemory(gid, memory) {
    setSetting(gid, settings_1.SETTING_KEYS.aiGuildMemory, JSON.stringify(memory));
}
function clearAiGuildMemory(gid) {
    setSetting(gid, settings_1.SETTING_KEYS.aiGuildMemory, null);
}
// ---------- 保守用 ----------
function getGuildDbInfo(gid) {
    return runGuildMaintenance(gid, (db) => {
        const countRow = db
            .prepare(`SELECT COUNT(*) AS count FROM counts`)
            .get();
        const immuneRow = db
            .prepare(`SELECT COUNT(*) AS count FROM immune`)
            .get();
        const logRow = db
            .prepare(`SELECT COUNT(*) AS count FROM logs`)
            .get();
        const settingsRow = db
            .prepare(`SELECT COUNT(*) AS count FROM settings`)
            .get();
        const fullPath = dbPath(gid);
        return {
            counts: countRow?.count ?? 0,
            immune: immuneRow?.count ?? 0,
            logs: logRow?.count ?? 0,
            settings: settingsRow?.count ?? 0,
            sizeBytes: node_fs_1.default.existsSync(fullPath) ? node_fs_1.default.statSync(fullPath).size : 0,
        };
    });
}
function checkpointGuildDb(gid) {
    runGuildMaintenance(gid, (db) => {
        db.pragma("wal_checkpoint(TRUNCATE)");
    });
}
function vacuumGuildDb(gid) {
    runGuildMaintenance(gid, (db) => {
        db.exec("VACUUM");
    });
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
