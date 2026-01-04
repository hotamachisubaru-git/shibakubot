# Copilot / AI エージェント向け指示（ShibakuBot）

このリポジトリで素早く開発・修正を行うための「実務的に必要な前提知識」と具体的パターンをまとめます。

- **ランタイム & 開発コマンド**:
  - Node.js >= 20
  - 開発: `npm install` → `npm run dev`（`ts-node src/index.ts`）
  - コマンド登録: `npm run register`（`src/deploy-commands.ts` を実行）
  - ビルド: `npm run build` → 出力は `dist/` → 本番起動 `node dist/index.js`

- **重要な環境変数 (.env)** (必須/挙動に直結)
  - `TOKEN`, `CLIENT_ID`, `GUILD_ID` — Discord 連携
  - `LOG_CHANNEL_ID`, `OWNER_IDS`, `IMMUNE_IDS` — ログ・権限・免除リスト
  - `SBK_MIN`, `SBK_MAX` — デフォルト射程（`src/config.ts`）

- **アーキテクチャ概観**:
  - コマンドエントリ: `src/index.ts` — Discord クライアント初期化、Interaction ハンドラ、コンソールコマンド。
  - コマンド実装: `src/commands/*.ts`（例: `help.ts`, `top.ts`, `members.ts`）。新しいコマンドはここに実装して `deploy-commands.ts` に反映。
  - 永続化: per-guild SQLite を `data/guilds/{guildId}.db` に保存（`src/data.ts` の `openDb(gid)` を使用）。
  - メダル管理: 別 DB `data/medalbank.db`（非同期 `sqlite` を利用）
  - 音楽: Lavalink を利用（`lavalink-client`）。`src/index.ts` にノード設定があり、実際の Lavalink サーバーが必要。

- **コードベースで守るべきローカル規約・パターン**:
  - ギルドごとのストアは必ず `src/data.ts` の `openDb(gid)` / `loadGuildStore(gid)` を通す。
  - ユーザー識別は常に ID（文字列）で扱う。表示名ではなく `user.id` を使う（例: `src/triggers.ts` の `targetUserId`）。
  - 即時実行/同期 DB 操作は `better-sqlite3`（同期）: 多くの関数は同期 API を返すことに注意する。
  - メダル周りは例外的に非同期 API を使用する（`getMedalBalance` 等）。混在に注意。

- **実装上の小さな注意点（既存コード参照）**:
  - `src/db.ts` と `src/data.ts` に似たスキーマ処理があるが、実際のランタイムは `src/data.ts` を参照している箇所が多い。変更時はどちらが影響するか確認すること。
  - Lavalink のノード設定では `authorization` が `youshallnotpass`（デフォルト）になっている。実運用では Lavalink 側の `application.yml` と合わせる必要あり（`src/index.ts`）。
  - コンソールコマンド（stdin）を `src/index.ts` が受け付ける：`move`, `timeout`, `muteAll` 等がある。修正時は入出力フォーマットに注意。

- **よくある小タスクの例（テンプレ）**:
  - 新しい slash コマンドを追加する：`src/commands/<name>.ts` にハンドラ追加 → `src/deploy-commands.ts` を実行して `npm run register`。
  - ギルドの設定（sbk 範囲）を保存する：`src/data.ts` の `setSbkRange(gid, min, max)` を使用。
  - トリガー追加（メッセージ→行動）: `src/triggers.ts` に `TRIGGERS['キーワード'] = { type:'sbk', targetUserId: 'ID' }` のように追加。

- **デバッグ / ローカル手順の要点**:
  - ログや実行状態は標準出力に出る（`console.log` 多用）。まず `npm run dev` で起動し、`README.md` にある `.env` を確認。
  - Lavalink が必要な機能（音楽再生）をテストする場合は Lavalink サーバーを立て、`src/index.ts` の `nodes` 設定と `authorization` を合わせる。

- **参照すべきファイル一覧（最優先）**:
  - `src/index.ts` — エントリ / Interaction ハンドラ / コンソールコマンド
  - `src/data.ts`  — 永続化ロジック（counts, immune, logs, settings, music settings）
  - `src/commands/` — 個別コマンド実装
  - `src/triggers.ts` — メッセージ→アクションの定義
  - `src/deploy-commands.ts` — コマンド登録スクリプト
  - `package.json` — 主要 npm スクリプト

もしこの内容で不足や誤認があれば、どの部分を深掘りすべきか教えてください。内容を反映して改善します。
