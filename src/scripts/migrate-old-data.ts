// scripts/migrate-old-data.ts
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

type CounterMap = Record<string, number>;
type GuildData = { counts: CounterMap; immune: string[] };

const PROJECT = process.cwd();
const DATA_DIR = path.join(PROJECT, 'data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');

const ROOT_JSON = path.join(PROJECT, 'data.json');          // 旧: ルートの data.json
const SRC_JSON  = path.join(PROJECT, 'src', 'data.json');   // 旧: src/data.json（あれば）
const IMMUNE_OLD = path.join(PROJECT, 'immune.json');       // 旧: 免除リスト（任意）

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('❌ .env の GUILD_ID が未設定です。移行先のギルドIDを指定してください。');
  process.exit(1);
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(GUILDS_DIR)) fs.mkdirSync(GUILDS_DIR);
}
function readJsonSafe<T = any>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    const t = fs.readFileSync(p, 'utf8').trim();
    if (!t) return null;
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}
function writeJson(p: string, v: any) {
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
}
function guildFile(gid: string) {
  return path.join(GUILDS_DIR, `${gid}.json`);
}

// 旧データ読み込み
const oldGlobalCounts: CounterMap =
  readJsonSafe<CounterMap>(ROOT_JSON) ??
  readJsonSafe<CounterMap>(SRC_JSON) ??
  {};

type OldImmuneStore = Record<string, string[]>;
const oldImmuneStore: OldImmuneStore = readJsonSafe<OldImmuneStore>(IMMUNE_OLD) ?? {};

// 新ファイルの既存データ（あれば）を読み込み
ensureDirs();
const targetPath = guildFile(GUILD_ID);
const existsNew = fs.existsSync(targetPath);
const currentNew: GuildData = existsNew
  ? (readJsonSafe<GuildData>(targetPath) ?? { counts: {}, immune: [] })
  : { counts: {}, immune: [] };

// マージ: counts は加算、immune は和集合
const mergedCounts: CounterMap = { ...currentNew.counts };
for (const [uid, n] of Object.entries(oldGlobalCounts)) {
  const v = Math.max(0, Math.floor(n as number));
  mergedCounts[uid] = (mergedCounts[uid] ?? 0) + v;
}

const mergedImmune = new Set<string>(currentNew.immune);
const localImmune = oldImmuneStore[GUILD_ID] ?? [];
for (const uid of localImmune) mergedImmune.add(uid);

// 書き出し
const result: GuildData = {
  counts: mergedCounts,
  immune: Array.from(mergedImmune),
};
writeJson(targetPath, result);

// レポート
const users = Object.keys(mergedCounts).length;
console.log('✅ 移行完了');
console.log(`  → 書き込み先: ${targetPath}`);
console.log(`  → ユーザー数: ${users}`);
console.log(`  → 免除数   : ${result.immune.length}`);

// 元ファイルは残す（安全のため）
// 削除/リネームしたい場合は下を有効化:
// fs.renameSync(ROOT_JSON, ROOT_JSON + '.migrated');
// fs.renameSync(SRC_JSON,  SRC_JSON + '.migrated');
// fs.renameSync(IMMUNE_OLD, IMMUNE_OLD + '.migrated');
