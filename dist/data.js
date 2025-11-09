"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isImmune = isImmune;
exports.loadGuildStore = loadGuildStore;
exports.saveGuildStore = saveGuildStore;
exports.addCountGuild = addCountGuild;
exports.getImmuneList = getImmuneList;
exports.addImmuneId = addImmuneId;
exports.removeImmuneId = removeImmuneId;
exports.getSbkRange = getSbkRange;
exports.setSbkRange = setSbkRange;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config/config");
const DATA_DIR = path_1.default.join(process.cwd(), 'data', 'guilds');
function ensureDir(p) {
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
}
function guildFile(gid) {
    ensureDir(DATA_DIR);
    return path_1.default.join(DATA_DIR, `${gid}.json`);
}
// しばき免除に含まれているか（ギルドローカル）
function isImmune(gid, userId) {
    const s = loadGuildStore(gid);
    return Array.isArray(s.immune) && s.immune.includes(userId);
}
function loadGuildStore(gid) {
    const file = guildFile(gid);
    if (fs_1.default.existsSync(file)) {
        try {
            const v = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
            // マイグレーション: 欠けてたら初期化
            v.counts || (v.counts = {});
            v.immune || (v.immune = []);
            v.settings || (v.settings = {});
            return v;
        }
        catch { /* fallthrough */ }
    }
    const init = { counts: {}, immune: [], settings: {} };
    fs_1.default.writeFileSync(file, JSON.stringify(init, null, 2));
    return init;
}
function saveGuildStore(gid, store) {
    fs_1.default.writeFileSync(guildFile(gid), JSON.stringify(store, null, 2));
}
/** しばきカウント加算 */
function addCountGuild(gid, userId, by = 1) {
    const store = loadGuildStore(gid);
    const next = (store.counts[userId] ?? 0) + by;
    store.counts[userId] = next;
    saveGuildStore(gid, store);
    return next;
}
/** 免除周り（既存そのまま） */
function getImmuneList(guildId) {
    if (!guildId)
        return [];
    const s = loadGuildStore(guildId);
    return Array.isArray(s.immune) ? s.immune : [];
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
/* ===================== 追加：SBK 上限・下限 ===================== */
/** 現在の範囲（ギルド設定→無ければ既定）を取得 */
function getSbkRange(gid) {
    const s = loadGuildStore(gid);
    const min = s.settings?.sbkMin ?? config_1.SBK_MIN;
    const max = s.settings?.sbkMax ?? config_1.SBK_MAX;
    // 安全クランプ
    const cmn = Math.max(1, Math.min(min, 25));
    const cmx = Math.max(cmn, Math.min(max, 25));
    return { min: cmn, max: cmx };
}
/** 範囲を更新して保存（値は1..25、かつ min<=max に整形） */
function setSbkRange(gid, min, max) {
    const store = loadGuildStore(gid);
    const cmn = Math.max(1, Math.min(min, 25));
    const cmx = Math.max(cmn, Math.min(max, 25));
    store.settings || (store.settings = {});
    store.settings.sbkMin = cmn;
    store.settings.sbkMax = cmx;
    saveGuildStore(gid, store);
    return { min: cmn, max: cmx };
}
