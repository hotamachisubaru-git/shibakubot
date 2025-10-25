// scripts/migrate-old-data.cjs
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PROJECT = process.cwd();
const DATA_DIR = path.join(PROJECT, 'data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');

const ROOT_JSON = path.join(PROJECT, 'data.json');
const SRC_JSON  = path.join(PROJECT, 'src', 'data.json');
const IMMUNE_OLD = path.join(PROJECT, 'immune.json');

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('❌ .env の GUILD_ID が未設定です。');
  process.exit(1);
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(GUILDS_DIR)) fs.mkdirSync(GUILDS_DIR);
}
function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const t = fs.readFileSync(p, 'utf8').trim();
    if (!t) return null;
    return JSON.parse(t);
  } catch {
    return null;
  }
}
function writeJson(p, v) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}
function guildFile(gid) {
  return path.join(GUILDS_DIR, `${gid}.json`);
}

const oldGlobalCounts =
  readJsonSafe(ROOT_JSON) ??
  readJsonSafe(SRC_JSON) ??
  {};
const oldImmuneStore = readJsonSafe(IMMUNE_OLD) ?? {};

ensureDirs();
const targetPath = guildFile(GUILD_ID);
const existsNew = fs.existsSync(targetPath);
const currentNew = existsNew
  ? (readJsonSafe(targetPath) ?? { counts: {}, immune: [] })
  : { counts: {}, immune: [] };

const mergedCounts = { ...currentNew.counts };
for (const [uid, n] of Object.entries(oldGlobalCounts)) {
  const v = Math.max(0, Math.floor(Number(n)));
  mergedCounts[uid] = (mergedCounts[uid] ?? 0) + v;
}

const mergedImmune = new Set(currentNew.immune || []);
const localImmune = (oldImmuneStore && oldImmuneStore[GUILD_ID]) || [];
for (const uid of localImmune) mergedImmune.add(uid);

const result = { counts: mergedCounts, immune: Array.from(mergedImmune) };
writeJson(targetPath, result);

console.log('✅ 移行完了');
console.log(`  → 書き込み先: ${targetPath}`);
console.log(`  → ユーザー数: ${Object.keys(mergedCounts).length}`);
console.log(`  → 免除数   : ${result.immune.length}`);
