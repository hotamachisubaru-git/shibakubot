"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    const init = { counts: {}, immune: [] };
    fs_1.default.writeFileSync(file, JSON.stringify(init, null, 2));
    return init;
}
function saveGuildStore(gid, store) {
    // 念のため正規化してから保存
    const normalized = normalizeStore(store);
    fs_1.default.writeFileSync(guildFile(gid), JSON.stringify(normalized, null, 2));
}
/** by 回まとめて加算（既定1）→ 新しい累計を返す */
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
/** グローバル免除 + ギルド免除を判定（globalImmuneIds 未定義でもOK） */
function isImmune(guildId, userId, globalImmuneIds) {
    const globals = Array.isArray(globalImmuneIds) ? globalImmuneIds : [];
    if (globals.includes(userId))
        return true;
    if (!guildId)
        return false;
    const locals = getImmuneList(guildId); // ここは常に配列
    return locals.includes(userId);
}
