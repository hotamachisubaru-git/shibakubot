"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGuildStore = loadGuildStore;
exports.saveGuildStore = saveGuildStore;
exports.addCountGuild = addCountGuild;
exports.isImmune = isImmune;
exports.getImmuneList = getImmuneList;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
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
function loadGuildStore(gid) {
    const file = guildFile(gid);
    if (fs_1.default.existsSync(file)) {
        try {
            return JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
        }
        catch {
            /* 壊れていたら初期化 */
        }
    }
    const init = { counts: {}, immune: [] };
    fs_1.default.writeFileSync(file, JSON.stringify(init, null, 2));
    return init;
}
function saveGuildStore(gid, store) {
    fs_1.default.writeFileSync(guildFile(gid), JSON.stringify(store, null, 2));
}
/** by 回まとめて加算（既定1）→ 新しい累計を返す */
function addCountGuild(gid, userId, by = 1) {
    const store = loadGuildStore(gid);
    const next = (store.counts[userId] ?? 0) + by;
    store.counts[userId] = next;
    saveGuildStore(gid, store);
    return next;
}
/** 免除系 */
function isImmune(gid, userId, globalImmune = []) {
    const store = loadGuildStore(gid);
    return store.immune.includes(userId) || globalImmune.includes(userId);
}
function getImmuneList(gid) {
    return loadGuildStore(gid).immune;
}
function addImmuneId(gid, userId) {
    const s = loadGuildStore(gid);
    if (s.immune.includes(userId))
        return false;
    s.immune.push(userId);
    saveGuildStore(gid, s);
    return true;
}
function removeImmuneId(gid, userId) {
    const s = loadGuildStore(gid);
    const n = s.immune.filter(x => x !== userId);
    const changed = n.length !== s.immune.length;
    if (changed) {
        s.immune = n;
        saveGuildStore(gid, s);
    }
    return changed;
}
