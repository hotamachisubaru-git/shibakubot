// scripts/migrate-old-data.ts
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

type CounterMap = Record<string, number>;
type GuildData = { counts: CounterMap; immune: string[] };

const PROJECT = process.cwd();
const DATA_DIR = path.join(PROJECT, 'data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');

const ROOT_JSON = path.join(PROJECT, 'data.json');          // 旧：グローバルカウント
const SRC_JSON  = path.join(PROJECT, 'src', 'data.json');   // 旧：src配下にあった場合
const IMMUNE_OLD = path.join(PROJECT, 'immune.json');       // 旧：ギルドごとの免除ストア（任意）

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

// 1) 旧データ読み込み
const oldGlobalCounts: CounterMap =
  readJsonSafe<CounterMap>(ROOT_JSON) ??
  readJsonSafe<CounterMap>(SRC_JSON) ??
  {};

type OldImmuneStore = Record<string, string[]>;
const oldImmuneStore: OldImmuneStore = readJsonSafe<OldImmuneStore>(IMMUNE_OLD) ?? {};

// 2) 既存の新ファイルを読み込み（あればマージ）
ensureDirs();
const targetPath = guildFile(GUILD_ID);
const existsNew = fs.existsSync(targetPath);
const currentNew: GuildData = existsNew
  ? (readJsonSafe<GuildData>(targetPath) ?? { counts: {}, immune: [] })
  : { counts: {}, immune: [] };

// 3) マージ方針
// - counts: 加算（同一ユーザーIDは合計）
// - immune: 和集合（重複を排除）
// - 旧免除が guildId をキーに持つ場合はその配列を採用
const mergedCounts: CounterMap = { ...currentNew.counts };
for (const [uid, n] of Object.entries(oldGlobalCounts)) {
  const v = Math.max(0, Math.floor(n as number));
  mergedCounts[uid] = (mergedCounts[uid] ?? 0) + v;
}

const mergedImmune = new Set<string>(currentNew.immune);
const localImmune = oldImmuneStore[GUILD_ID] ?? [];
for (const uid of localImmune) mergedImmune.add(uid);

// 4) 書き出し
const result: GuildData = {
  counts: mergedCounts,
  immune: Array.from(mergedImmune),
};
writeJson(targetPath, result);

// 5) レポート
const users = Object.keys(mergedCounts).length;
console.log('✅ 移行完了');
console.log(`  → 書き込み先: ${targetPath}`);
console.log(`  → ユーザー数: ${users}`);
console.log(`  → 免除数   : ${result.immune.length}`);

// 6) オプション：元ファイルは残す（安全第一）。消したい場合はコメントアウト解除。
// try { fs.renameSync(ROOT_JSON, ROOT_JSON + '.migrated'); } catch {}
// try { fs.renameSync(SRC_JSON,  SRC_JSON + '.migrated');  } catch {}
// try { fs.renameSync(IMMUNE_OLD, IMMUNE_OLD + '.migrated'); } catch {}
