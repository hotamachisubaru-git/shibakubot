// src/data.ts
import fs from 'fs';
import path from 'path';

export type CounterMap = Record<string, number>;

const ROOT_DATA = path.join(process.cwd(), 'data.json');
const LEGACY_DATA = path.join(process.cwd(), 'src', 'data.json');

function safeRead(p: string): CounterMap | null {
  try {
    const txt = fs.readFileSync(p, 'utf8').trim();
    if (!txt) return {};          // 空ファイルは {} とみなす
    return JSON.parse(txt);
  } catch {
    return null;                  // 壊れていたら null
  }
}

export function loadData(): CounterMap {
  // ルート優先
  const root = safeRead(ROOT_DATA);
  if (root) return root;
  // 旧場所があれば移行
  const legacy = safeRead(LEGACY_DATA);
  if (legacy) {
    fs.writeFileSync(ROOT_DATA, JSON.stringify(legacy, null, 2));
    return legacy;
  }
  // どこにも無ければ作成
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
