# しばくbot / ShibakuBot

Discordサーバー向けの「しばくカウント」Bot。  
`/menu` からランキング・免除管理・VC操作・監査ログなどを一通り操作でき、  
音楽再生（Lavalink）も搭載しています。

## 主な機能
- しばき回数の加算・ランキング・統計・監査ログ
- 免除リスト・回数レンジの変更・回数の直接編集
- VC操作（移動/切断/ミュート/解除）
- 音楽再生（`s!` プレフィックス、アップロード再生対応）
- 管理者ツール（ログチャンネル設定、システム統計、バックアップ）

## 前提
- Node.js >= 20
- Discord Bot の Privileged Intents: **Server Members / Message Content**
- Voice States Intent（音楽/VC操作用）
- 音楽機能を使う場合: Lavalink を別プロセスで起動  
  - 接続先は `src/index.ts` の `LavalinkManager` 設定に合わせてください  
    （デフォルト: `127.0.0.1:2333`, password `youshallnotpass`）

## セットアップ
1. Discord Developer Portal でアプリ作成 → Bot 作成
2. トークン取得、Intents を有効化
3. サーバーに招待（`bot` + `applications.commands`）
4. 依存関係インストール
   ```bash
   npm install
   ```
5. `.env` を作成（下記参照）
6. スラッシュコマンド登録
   ```bash
   npm run register
   ```
7. 起動
   ```bash
   npm run dev
   ```

本番用:
```bash
npm run build
npm run start
```

## .env 設定
```env
TOKEN=...
CLIENT_ID=...
GUILD_IDS=111111111111111111,222222222222222222
# 1つだけなら GUILD_ID でも可
OWNER_IDS=111111111111111111,222222222222222222
IMMUNE_IDS=...            # 任意：グローバル免除
LOG_CHANNEL_ID=...        # 任意：ログチャンネル（未設定なら /menu で設定可）

# 音楽/アップロード
FILE_DIR=./files          # 任意：アップロード保存先
FILE_PORT=3001            # 任意：ファイルサーバーのポート
UPLOAD_INTERNAL_URL=http://127.0.0.1:3001/uploads
UPLOAD_BASE_URL=http://your.domain:3001/uploads
MUSIC_MAX_MINUTES=15      # 任意：1曲の上限(分)

# コマンド登録時の挙動
CLEAR_GLOBAL=true         # 任意：register 時にグローバルコマンドを削除
```

### 変数メモ
- `GUILD_IDS` はカンマ区切り。`npm run register` はギルド単位で登録します。
- `OWNER_IDS` は管理者権限に加えて「開発者扱い」のユーザーIDです。
- `LOG_CHANNEL_ID` はログ送信のデフォルト。/menu → サーバー設定で上書き可能です。
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できる URL を指定してください。
- `UPLOAD_INTERNAL_URL` / `UPLOAD_BASE_URL` を未設定の場合、`src/music.ts` 内の既定値が使われます。
- ファイルサーバーのホストは `src/index.ts` の `FILE_HOST` で固定です。必要なら編集してください。

## コマンド
### スラッシュコマンド（`npm run register` で登録）
- `/sbk user count? reason?` しばく（未指定はランダム）
- `/menu` メニューを開く
- `/suimin user channel` VC移動

### 実装済み（必要なら `src/deploy-commands.ts` に追加して登録）
- `/ping` 生存確認
- `/check user` しばかれ回数
- `/top` ランキング
- `/members` メンバー一覧 + CSV
- `/stats` 統計（管理者）
- `/reset` リセット（管理者）
- `/control user count` 回数直接設定（管理者）
- `/immune add|remove|list` 免除管理（管理者）
- `/help` ヘルプ

### /menu から使える機能
- 基本: ランキング / メンバー一覧 / 統計
- しばき管理: 回数レンジ変更 / 免除管理 / 回数直接設定
- VC: 移動 / 切断 / ミュート / 解除
- 管理者: 監査ログ / ログチャンネル設定 / システム統計 / バックアップ / 開発者ツール

### 音楽コマンド（メッセージ, `s!` プレフィックス）
- `s!play <URL or キーワード>`
- `s!skip`
- `s!stop`
- `s!queue`
- `s!upload`（mp3/wav/flac/m4a/aac/ogg）
- `s!remove <番号>`
- `s!ng add|remove|list|clear <word>`（管理者）
- `s!enable` / `s!disable`（管理者）
- `s!help`

## データ保存
- ギルドごとの DB: `data/guilds/<guildId>.db`
- バックアップ: `backup/`
- アップロード保存先: `files/`（`FILE_DIR` で変更可）

## トラブルシューティング
- `Used disallowed intents` → Developer Portal で Intents を ON
- `Unknown interaction` → `npm run register` を再実行
- 音楽が再生されない → Lavalink 起動・ホスト/ポート/パスワード一致を確認

## 作者
hotamachisubaru (蛍の光)

## ライセンス
MIT License
