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

export function loadGuildStore(gid: string): GuildStore {
  const file = guildFile(gid);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as GuildStore;
    } catch {
      /* 壊れていたら初期化 */
    }
  }
  const init: GuildStore = { counts: {}, immune: [] };
  fs.writeFileSync(file, JSON.stringify(init, null, 2));
  return init;
}

export function saveGuildStore(gid: string, store: GuildStore) {
  fs.writeFileSync(guildFile(gid), JSON.stringify(store, null, 2));
}

/** by 回まとめて加算（既定1）→ 新しい累計を返す */
export function addCountGuild(gid: string, userId: string, by = 1): number {
  const store = loadGuildStore(gid);
  const next = (store.counts[userId] ?? 0) + by;
  store.counts[userId] = next;
  saveGuildStore(gid, store);
  return next;
}

/** 免除系 */
export function isImmune(gid: string, userId: string, globalImmune: string[] = []) {
  const store = loadGuildStore(gid);
  return store.immune.includes(userId) || globalImmune.includes(userId);
}
export function getImmuneList(gid: string) {
  return loadGuildStore(gid).immune;
}
export function addImmuneId(gid: string, userId: string) {
  const s = loadGuildStore(gid);
  if (s.immune.includes(userId)) return false;
  s.immune.push(userId);
  saveGuildStore(gid, s);
  return true;
}
export function removeImmuneId(gid: string, userId: string) {
  const s = loadGuildStore(gid);
  const n = s.immune.filter(x => x !== userId);
  const changed = n.length !== s.immune.length;
  if (changed) {
    s.immune = n;
    saveGuildStore(gid, s);
  }
  return changed;
}
