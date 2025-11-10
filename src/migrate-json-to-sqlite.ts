// src/migrate-json-to-sqlite.ts
import fs from 'fs';
import path from 'path';
import { openGuildDB } from './db';

type OldStore = {
  counts: Record<string, number>;
  immune?: string[];
  settings?: { sbkMin?: number; sbkMax?: number };
};

const ROOT = path.join(process.cwd(), 'data', 'guilds');

function listOldJson(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(ROOT, f));
}

(async () => {
  const files = listOldJson();
  if (files.length === 0) {
    console.log('旧JSONファイルは見つかりませんでした。');
    return;
  }

  for (const file of files) {
    const gid = path.basename(file, '.json');
    const dbPath = path.join(ROOT, `${gid}.db`);
    if (fs.existsSync(dbPath)) {
      console.log(`スキップ: ${gid}.db が既に存在します`);
      continue;
    }

    console.log(`移行: ${file} → ${gid}.db`);
    const raw = fs.readFileSync(file, 'utf8');
    const oldData = JSON.parse(raw) as OldStore;

    const db = openGuildDB(gid);
    const trx = db.transaction(() => {
      // counts
      const ins = db.prepare(`
        INSERT INTO counts(user_id, username, reason, count)
        VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET count=excluded.count
      `);
      for (const [uid, c] of Object.entries(oldData.counts ?? {})) {
        // username はひとまず uid を格納（次回 /sbk 実行時に最新名へ更新される）
        ins.run(uid, uid, '', Number(c) || 0);
      }

      // immune
      const insImm = db.prepare(`INSERT INTO immune(user_id) VALUES(?) ON CONFLICT DO NOTHING`);
      for (const uid of oldData.immune ?? []) insImm.run(uid);

      // settings
      if (oldData.settings?.sbkMin != null)
        db.prepare(`INSERT INTO settings(key,value) VALUES('sbkMin', ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
          .run(String(oldData.settings.sbkMin));
      if (oldData.settings?.sbkMax != null)
        db.prepare(`INSERT INTO settings(key,value) VALUES('sbkMax', ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
          .run(String(oldData.settings.sbkMax));
    });
    trx();

    console.log(`完了: ${gid}.db`);
  }

  console.log('✅ すべての移行処理が完了しました。');
})();
