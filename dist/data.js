"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadData = loadData;
exports.saveData = saveData;
exports.addCount = addCount;
exports.getTop = getTop;
exports.getImmuneList = getImmuneList;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
exports.isImmune = isImmune;
// src/data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ---- しばかれ回数の保存先 ----
const ROOT_DATA = path_1.default.join(process.cwd(), 'data.json');
const LEGACY_DATA = path_1.default.join(process.cwd(), 'src', 'data.json');
// ---- 免除リストの保存先（ギルドごと）----
const IMMUNE_PATH = path_1.default.join(process.cwd(), 'immune.json');
function safeReadText(p) {
    try {
        return fs_1.default.readFileSync(p, 'utf8');
    }
    catch {
        return null;
    }
}
function safeReadJson(p, fallback) {
    try {
        const t = (safeReadText(p) ?? '').trim();
        return t ? JSON.parse(t) : fallback;
    }
    catch {
        return fallback;
    }
}
// ========== 回数データ ==========
function loadData() {
    const root = safeReadJson(ROOT_DATA, {});
    if (Object.keys(root).length)
        return root;
    const legacy = safeReadJson(LEGACY_DATA, {});
    if (Object.keys(legacy).length) {
        fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(legacy, null, 2));
        return legacy;
    }
    fs_1.default.writeFileSync(ROOT_DATA, '{}');
    return {};
}
function saveData(data) {
    fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(data, null, 2));
}
function addCount(data, userId, by = 1) {
    const next = (data[userId] ?? 0) + by;
    data[userId] = next;
    saveData(data);
    return next;
}
function getTop(data, limit = 10) {
    return Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
function readImmuneStore() {
    return safeReadJson(IMMUNE_PATH, {});
}
function writeImmuneStore(store) {
    fs_1.default.writeFileSync(IMMUNE_PATH, JSON.stringify(store, null, 2));
}
function getImmuneList(guildId) {
    const store = readImmuneStore();
    return store[guildId] ?? [];
}
function addImmuneId(guildId, userId) {
    const store = readImmuneStore();
    const set = new Set(store[guildId] ?? []);
    const before = set.size;
    set.add(userId);
    store[guildId] = Array.from(set);
    writeImmuneStore(store);
    return set.size !== before; // 追加されたら true
}
function removeImmuneId(guildId, userId) {
    const store = readImmuneStore();
    const set = new Set(store[guildId] ?? []);
    const existed = set.delete(userId);
    store[guildId] = Array.from(set);
    writeImmuneStore(store);
    return existed; // 削除できたら true
}
/** env のグローバル免除 + ギルド免除、どちらかに含まれていれば true */
function isImmune(guildId, userId, envImmuneIds) {
    if (envImmuneIds.includes(userId))
        return true;
    if (!guildId)
        return false;
    return getImmuneList(guildId).includes(userId);
}
