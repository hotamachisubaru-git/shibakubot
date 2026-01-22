"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/migrate-old-data.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
require("dotenv/config");
const PROJECT = process.cwd();
const DATA_DIR = path_1.default.join(PROJECT, "data");
const GUILDS_DIR = path_1.default.join(DATA_DIR, "guilds");
const ROOT_JSON = path_1.default.join(PROJECT, "data.json"); // 旧: ルートの data.json
const SRC_JSON = path_1.default.join(PROJECT, "src", "data.json"); // 旧: src/data.json（あれば）
const IMMUNE_OLD = path_1.default.join(PROJECT, "immune.json"); // 旧: 免除リスト（任意）
const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
    console.error("❌ .env の GUILD_ID が未設定です。移行先のギルドIDを指定してください。");
    process.exit(1);
}
function ensureDirs() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR);
    if (!fs_1.default.existsSync(GUILDS_DIR))
        fs_1.default.mkdirSync(GUILDS_DIR);
}
function readJsonSafe(p) {
    try {
        if (!fs_1.default.existsSync(p))
            return null;
        const t = fs_1.default.readFileSync(p, "utf8").trim();
        if (!t)
            return null;
        return JSON.parse(t);
    }
    catch {
        return null;
    }
}
function writeJson(p, v) {
    fs_1.default.writeFileSync(p, JSON.stringify(v, null, 2));
}
function guildFile(gid) {
    return path_1.default.join(GUILDS_DIR, `${gid}.json`);
}
// 旧データ読み込み
const oldGlobalCounts = readJsonSafe(ROOT_JSON) ??
    readJsonSafe(SRC_JSON) ??
    {};
const oldImmuneStore = readJsonSafe(IMMUNE_OLD) ?? {};
// 新ファイルの既存データ（あれば）を読み込み
ensureDirs();
const targetPath = guildFile(GUILD_ID);
const existsNew = fs_1.default.existsSync(targetPath);
const currentNew = existsNew
    ? (readJsonSafe(targetPath) ?? { counts: {}, immune: [] })
    : { counts: {}, immune: [] };
// マージ: counts は加算、immune は和集合
const mergedCounts = { ...currentNew.counts };
for (const [uid, n] of Object.entries(oldGlobalCounts)) {
    const v = Math.max(0, Math.floor(n));
    mergedCounts[uid] = (mergedCounts[uid] ?? 0) + v;
}
const mergedImmune = new Set(currentNew.immune);
const localImmune = oldImmuneStore[GUILD_ID] ?? [];
for (const uid of localImmune)
    mergedImmune.add(uid);
// 書き出し
const result = {
    counts: mergedCounts,
    immune: Array.from(mergedImmune),
};
writeJson(targetPath, result);
// レポート
const users = Object.keys(mergedCounts).length;
console.log("✅ 移行完了");
console.log(`  → 書き込み先: ${targetPath}`);
console.log(`  → ユーザー数: ${users}`);
console.log(`  → 免除数   : ${result.immune.length}`);
// 元ファイルは残す（安全のため）
// 削除/リネームしたい場合は下を有効化:
// fs.renameSync(ROOT_JSON, ROOT_JSON + '.migrated');
// fs.renameSync(SRC_JSON,  SRC_JSON + '.migrated');
// fs.renameSync(IMMUNE_OLD, IMMUNE_OLD + '.migrated');
