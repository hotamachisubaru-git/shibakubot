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
  return normalizeStore({});
}

export function saveGuildStore(gid: string, store: GuildStore) {
  const file = guildFile(gid);
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
}

/** しばかれ回数を増やす */
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

export function isImmune(gid: string, userId: string): boolean {
  return getImmuneList(gid).includes(userId);
}

// 開発者ID（グローバル免除リスト。任意）
export const IMMUNE_IDS = (process.env.IMMUNE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);