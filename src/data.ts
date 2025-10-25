// src/data.ts
import fs from 'fs';
import path from 'path';

export type CounterMap = Record<string, number>;

// ---- しばかれ回数の保存先 ----
const ROOT_DATA = path.join(process.cwd(), 'data.json');
const LEGACY_DATA = path.join(process.cwd(), 'src', 'data.json');

// ---- 免除リストの保存先（ギルドごと）----
const IMMUNE_PATH = path.join(process.cwd(), 'immune.json');

function safeReadText(p: string): string | null {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function safeReadJson<T>(p: string, fallback: T): T {
  try {
    const t = (safeReadText(p) ?? '').trim();
    return t ? (JSON.parse(t) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ========== 回数データ ==========
export function loadData(): CounterMap {
  const root = safeReadJson<CounterMap>(ROOT_DATA, {} as CounterMap);
  if (Object.keys(root).length) return root;

  const legacy = safeReadJson<CounterMap>(LEGACY_DATA, {} as CounterMap);
  if (Object.keys(legacy).length) {
    fs.writeFileSync(ROOT_DATA, JSON.stringify(legacy, null, 2));
    return legacy;
  }

  fs.writeFileSync(ROOT_DATA, '{}');
  return {};
}

export function saveData(data: CounterMap) {
  fs.writeFileSync(ROOT_DATA, JSON.stringify(data, null, 2));
}

export function addCount(data: CounterMap, userId: string, by = 1): number {
  const next = (data[userId] ?? 0) + by;
  data[userId] = next;
  saveData(data);
  return next;
}

export function getTop(data: CounterMap, limit = 10) {
  return Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ========== 免除リスト（ギルドごと） ==========
type ImmuneStore = Record<string, string[]>; // guildId -> userIds[]

function readImmuneStore(): ImmuneStore {
  return safeReadJson<ImmuneStore>(IMMUNE_PATH, {});
}
function writeImmuneStore(store: ImmuneStore) {
  fs.writeFileSync(IMMUNE_PATH, JSON.stringify(store, null, 2));
}

export function getImmuneList(guildId: string): string[] {
  const store = readImmuneStore();
  return store[guildId] ?? [];
}

export function addImmuneId(guildId: string, userId: string): boolean {
  const store = readImmuneStore();
  const set = new Set<string>(store[guildId] ?? []);
  const before = set.size;
  set.add(userId);
  store[guildId] = Array.from(set);
  writeImmuneStore(store);
  return set.size !== before; // 追加されたら true
}

export function removeImmuneId(guildId: string, userId: string): boolean {
  const store = readImmuneStore();
  const set = new Set<string>(store[guildId] ?? []);
  const existed = set.delete(userId);
  store[guildId] = Array.from(set);
  writeImmuneStore(store);
  return existed; // 削除できたら true
}

/** env のグローバル免除 + ギルド免除、どちらかに含まれていれば true */
export function isImmune(guildId: string | undefined, userId: string, envImmuneIds: string[]): boolean {
  if (envImmuneIds.includes(userId)) return true;
  if (!guildId) return false;
  return getImmuneList(guildId).includes(userId);
}
