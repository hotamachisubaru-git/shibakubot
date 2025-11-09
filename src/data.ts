import fs from 'fs';
import path from 'path';
import { SBK_MIN, SBK_MAX } from './config/config';

export type CounterMap = Record<string, number>;

export interface GuildStore {
  counts: CounterMap;
  immune: string[];
  settings?: {
    sbkMin?: number;
    sbkMax?: number;
  };
}

const DATA_DIR = path.join(process.cwd(), 'data', 'guilds');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function guildFile(gid: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${gid}.json`);
}

// しばき免除に含まれているか（ギルドローカル）
export function isImmune(gid: string, userId: string): boolean {
  const s = loadGuildStore(gid);
  return Array.isArray(s.immune) && s.immune.includes(userId);
}

export function loadGuildStore(gid: string): GuildStore {
  const file = guildFile(gid);
  if (fs.existsSync(file)) {
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8')) as GuildStore;
      // マイグレーション: 欠けてたら初期化
      v.counts ||= {};
      v.immune ||= [];
      v.settings ||= {};
      return v;
    } catch { /* fallthrough */ }
  }
  const init: GuildStore = { counts: {}, immune: [], settings: {} };
  fs.writeFileSync(file, JSON.stringify(init, null, 2));
  return init;
}

export function saveGuildStore(gid: string, store: GuildStore) {
  fs.writeFileSync(guildFile(gid), JSON.stringify(store, null, 2));
}

/** しばきカウント加算 */
export function addCountGuild(gid: string, userId: string, by = 1): number {
  const store = loadGuildStore(gid);
  const next = (store.counts[userId] ?? 0) + by;
  store.counts[userId] = next;
  saveGuildStore(gid, store);
  return next;
}

/** 免除周り（既存そのまま） */
export function getImmuneList(guildId: string): string[] {
  if (!guildId) return [];
  const s = loadGuildStore(guildId);
  return Array.isArray(s.immune) ? s.immune : [];
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

/* ===================== 追加：SBK 上限・下限 ===================== */

/** 現在の範囲（ギルド設定→無ければ既定）を取得 */
export function getSbkRange(gid: string): { min: number; max: number } {
  const s = loadGuildStore(gid);
  const min = s.settings?.sbkMin ?? SBK_MIN;
  const max = s.settings?.sbkMax ?? SBK_MAX;
  // 安全クランプ
  const cmn = Math.max(1, Math.min(min, 25));
  const cmx = Math.max(cmn, Math.min(max, 25));
  return { min: cmn, max: cmx };
}

/** 範囲を更新して保存（値は1..25、かつ min<=max に整形） */
export function setSbkRange(gid: string, min: number, max: number) {
  const store = loadGuildStore(gid);
  const cmn = Math.max(1, Math.min(min, 25));
  const cmx = Math.max(cmn, Math.min(max, 25));
  store.settings ||= {};
  store.settings.sbkMin = cmn;
  store.settings.sbkMax = cmx;
  saveGuildStore(gid, store);
  return { min: cmn, max: cmx };
}
