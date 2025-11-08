"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMMUNE_IDS = void 0;
exports.loadGuildStore = loadGuildStore;
exports.saveGuildStore = saveGuildStore;
exports.addCountGuild = addCountGuild;
exports.getImmuneList = getImmuneList;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
exports.isImmune = isImmune;
// src/data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data', 'guilds');
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
function guildFile(gid) {
    ensureDir(DATA_DIR);
    return path_1.default.join(DATA_DIR, `${gid}.json`);
}
/** JSONを読み込んで不足項目を補完する（常に counts={}, immune=[] を保証） */
function normalizeStore(raw) {
    const counts = raw && typeof raw.counts === 'object' && !Array.isArray(raw.counts)
        ? raw.counts
        : {};
    const immune = Array.isArray(raw?.immune) ? raw.immune : [];
    return { counts, immune };
}
function loadGuildStore(gid) {
    const file = guildFile(gid);
    if (fs_1.default.existsSync(file)) {
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
            return normalizeStore(parsed);
        }
        catch {
            // 壊れていたら初期化し直す
        }
    }
    return normalizeStore({});
}
function saveGuildStore(gid, store) {
    const file = guildFile(gid);
    fs_1.default.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
}
/** しばかれ回数を増やす */
function addCountGuild(gid, userId, by = 1) {
    const store = loadGuildStore(gid);
    const next = (store.counts[userId] ?? 0) + by;
    store.counts[userId] = next;
    saveGuildStore(gid, store);
    return next;
}
/** 免除関連 */
function getImmuneList(guildId) {
    if (!guildId)
        return [];
    const store = loadGuildStore(guildId); // ← 修正：loadGuildStore を使用
    return Array.isArray(store.immune) ? store.immune : [];
}
function addImmuneId(gid, userId) {
    const s = loadGuildStore(gid);
    if (!Array.isArray(s.immune))
        s.immune = [];
    if (s.immune.includes(userId))
        return false;
    s.immune.push(userId);
    saveGuildStore(gid, s);
    return true;
}
function removeImmuneId(gid, userId) {
    const s = loadGuildStore(gid);
    if (!Array.isArray(s.immune))
        s.immune = [];
    const n = s.immune.filter(x => x !== userId);
    const changed = n.length !== s.immune.length;
    if (changed) {
        s.immune = n;
        saveGuildStore(gid, s);
    }
    return changed;
}
function isImmune(gid, userId) {
    return getImmuneList(gid).includes(userId);
}
// 開発者ID（グローバル免除リスト。任意）
exports.IMMUNE_IDS = (process.env.IMMUNE_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
