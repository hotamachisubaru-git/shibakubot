// src/data.ts
import fs from 'fs';
import path from 'path';

export type CounterMap = Record<string, number>;
export interface GuildStore {
  counts: CounterMap;
  immune: string[];
}

const DATA_DIR = path.join(process.cwd(), 'data', 'guilds');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function guildFile(gid: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${gid}.json`);
}

/** JSONを読み込んで不足項目を補完する（常に counts={}, immune=[] を保証） */
function normalizeStore(raw: any): GuildStore {
  const counts = raw && typeof raw.counts === 'object' && !Array.isArray(raw.counts)
    ? (raw.counts as CounterMap)
    : {};
  const immune = Array.isArray(raw?.immune) ? raw.immune as string[] : [];
  return { counts, immune };
}

export function loadGuildStore(gid: string): GuildStore {
  const file = guildFile(gid);
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return normalizeStore(parsed);
    } catch {
      // 壊れていたら初期化し直す
    }
  }
  const init: GuildStore = { counts: {}, immune: [] };
  fs.writeFileSync(file, JSON.stringify(init, null, 2));
  return init;
}

export function saveGuildStore(gid: string, store: GuildStore) {
  // 念のため正規化してから保存
  const normalized = normalizeStore(store);
  fs.writeFileSync(guildFile(gid), JSON.stringify(normalized, null, 2));
}

/** by 回まとめて加算（既定1）→ 新しい累計を返す */
export function addCountGuild(gid: string, userId: string, by = 1): number {
  const store = loadGuildStore(gid);
  const next = (store.counts[userId] ?? 0) + by;
  store.counts[userId] = next;
  saveGuildStore(gid, store);
  return next;
}

/** 免除関連 */
export function getImmuneList(guildId: string): string[] {
  if (!guildId) return [];
  const store = loadGuildStore(guildId);         // ← 修正：loadGuildStore を使用
  return Array.isArray(store.immune) ? store.immune : [];
}

export function addImmuneId(gid: string, userId: string) {
  const s = loadGuildStore(gid);
  if (!Array.isArray(s.immune)) s.immune = [];
  if (s.immune.includes(userId)) return false;
  s.immune.push(userId);
  saveGuildStore(gid, s);
  return true;
}

export function removeImmuneId(gid: string, userId: string) {
  const s = loadGuildStore(gid);
  if (!Array.isArray(s.immune)) s.immune = [];
  const n = s.immune.filter(x => x !== userId);
  const changed = n.length !== s.immune.length;
  if (changed) {
    s.immune = n;
    saveGuildStore(gid, s);
  }
  return changed;
}

/** グローバル免除 + ギルド免除を判定（globalImmuneIds 未定義でもOK） */
export function isImmune(
  guildId: string | undefined,
  userId: string,
  globalImmuneIds?: string[]
): boolean {
  const globals = Array.isArray(globalImmuneIds) ? globalImmuneIds : [];
  if (globals.includes(userId)) return true;
  if (!guildId) return false;
  const locals = getImmuneList(guildId);         // ここは常に配列
  return locals.includes(userId);
}
