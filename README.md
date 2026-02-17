# しばくbot / ShibakuBot

Discordサーバー向けの「しばくカウント」Bot。  
`/menu` からランキング・免除管理・VC操作・監査ログなどを一通り操作でき、  
音楽再生（Lavalink）も搭載しています。

## 主な機能
- しばき回数の加算・ランキング・統計・監査ログ
- 免除リスト・回数レンジの変更・回数の直接編集
- VC操作（移動/切断/ミュート/解除）
- 音楽再生（`s!` プレフィックス、アップロード再生対応）
- AIチャット（`gpt-oss:20b` など Ollama/OpenAI互換API）
- 管理者ツール（ログチャンネル設定、システム統計、バックアップ）

## 前提
- Node.js >= 20
- Discord Bot の Privileged Intents: **Server Members / Message Content**
- Voice States Intent（音楽/VC操作用）
- 音楽機能を使う場合: Lavalink を別プロセスで起動  
  - 接続先は `.env` の `LAVALINK_*` 設定に合わせてください  
    （デフォルト: `127.0.0.1:2333`, password `youshallnotpass`）

## Discordアプリ/Bot の作成手順
1. [Discord Developer Portal](https://discord.com/developers/applications) で `New Application` を作成
2. `Bot` タブで Bot を作成し、`Reset Token` でトークンを発行
3. `General Information` から `Application ID`（=`CLIENT_ID`）を控える
4. `Bot` タブで下記 Intents を有効化
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
5. `OAuth2 -> URL Generator` で以下を選択して招待URLを作成
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: 下記「必要な Bot 権限」を付与
6. 生成した URL で対象サーバーに招待

## 必要な権限
### Gateway Intents（Developer Portal）
- 必須: `SERVER MEMBERS INTENT`
- 必須: `MESSAGE CONTENT INTENT`

### 必要な Bot 権限（サーバー招待時）
- `View Channels`
- `Send Messages`
- `Embed Links`
- `Attach Files`（`/members` のCSV出力で使用）
- `Read Message History`
- `Connect`（音楽機能）
- `Speak`（音楽機能）
- `Move Members`（VC移動/切断）
- `Mute Members`（VCミュート/解除）

権限設計を簡単にする場合は `Administrator` 付与でも動作します。

### 実行ユーザー側に必要な権限
- `/menu` の管理系操作は、Bot側とは別に「実行したユーザー本人」の権限チェックがあります。
- 例: VC移動/切断は `Move Members`、VCミュート系は `Mute Members`、その他管理系は `Administrator` または開発者ID。

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
npm run register:prod
npm run start
```

## 配布 / リリース（v1.2以降）
### ローカルで配布用バンドルを作成
```bash
npm ci
npm run release:bundle
```

生成物:
- `release/shibakubot-v<version>/`
- 中身: `dist/`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `CHANGELOG.md`, `LICENSE`, `RELEASE.md`

### GitHub Release を作る手順
1. `package.json` の `version` と `CHANGELOG.md` を更新
2. 変更を push したあと、タグを作成して push
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
3. GitHub Actions (`.github/workflows/release.yml`) が実行され、zip付き Release が自動作成される

## .env 設定
```env
TOKEN=...
CLIENT_ID=...
GUILD_IDS=111111111111111111,222222222222222222
# 1つだけなら GUILD_ID でも可
OWNER_IDS=111111111111111111,222222222222222222
IMMUNE_IDS=...            # 任意：グローバル免除
LOG_CHANNEL_ID=...        # 任意：ログチャンネル（未設定なら /menu で設定可）

# AIチャット（任意、未設定時は既定値）
MODEL_ENDPOINT=http://localhost:11434/api/chat
MODEL_NAME=gpt-oss:20b
MODEL_API_KEY=
MODEL_TIMEOUT_MS=120000
SYSTEM_PROMPT=あなたは親切で実用的なAIアシスタントです。回答は日本語で行ってください。
MAX_HISTORY_TURNS=8
MAX_RESPONSE_CHARS=8000

# AI画像生成（任意: Stable Diffusion WebUI API）
IMAGE_ENDPOINT=
IMAGE_MODEL=
IMAGE_API_KEY=
IMAGE_TIMEOUT_MS=120000
IMAGE_DEFAULT_SIZE=1024x1024
IMAGE_STEPS=25
IMAGE_CFG_SCALE=6.5
IMAGE_SAMPLER_NAME=DPM++ 2M Karras
IMAGE_NEGATIVE_PROMPT=

# 音楽/アップロード
FILE_DIR=./files          # 任意：アップロード保存先
FILE_HOST=0.0.0.0         # 任意：ファイルサーバーのバインド先
FILE_PORT=3001            # 任意：ファイルサーバーのポート
UPLOAD_INTERNAL_URL=http://127.0.0.1:3001/uploads
UPLOAD_BASE_URL=http://your.domain:3001/uploads
MUSIC_MAX_MINUTES=15      # 任意：1曲の上限(分)

# Lavalink（任意、未設定時は下記デフォルト）
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass

# コマンド登録時の挙動
CLEAR_GLOBAL=true         # 任意：register 時にグローバルコマンドを削除
```

### 変数メモ
- `GUILD_IDS` はカンマ区切り。`npm run register` はギルド単位で登録します。
- `OWNER_IDS` は管理者権限に加えて「開発者扱い」のユーザーIDです。
- `LOG_CHANNEL_ID` はログ送信のデフォルト。/menu → サーバー設定で上書き可能です。
- `MODEL_ENDPOINT`/`MODEL_NAME` は AI チャットの接続先です。既定値は Ollama (`gpt-oss:20b`) を想定しています。
- `SYSTEM_PROMPT` は `\\n` で改行を埋め込めます。
- `IMAGE_ENDPOINT` を設定した場合のみ `/image` が有効になります。
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できる URL を指定してください。
- `UPLOAD_INTERNAL_URL` / `UPLOAD_BASE_URL` 未設定時は、`FILE_HOST` / `FILE_PORT` から自動で既定URLが組み立てられます。
- ファイルサーバーのホストは `FILE_HOST`（未設定時 `0.0.0.0`）で変更できます。

## コマンド
### スラッシュコマンド（`npm run register` で登録）
- `/sbk user count? reason?` しばく（未指定はランダム）
- `/menu` メニューを開く
- `/suimin user channel` VC移動
- `/ping` 生存確認
- `/help` ヘルプ
- `/maintenance mode:on|off` (/`/mt mode:on|off`) メンテナンス切替（管理者）
- `/chat message:<text> [new_session] [private]` AIと会話
- `/reply message_id:<id> [instruction] [new_session] [private]` 指定メッセージ返信を生成
- `/regen [private]` 直前 `/reply` を再生成
- `/history [turns] [private]` 会話履歴表示
- `/setprompt content:<text> [private] [reset_history]` AIプロンプト更新
- `/chatreset` AI会話履歴とプロンプトをリセット

### `/menu` に統合されている機能
- `しばき確認`: `/check user`
- `ランキング`: `/top`
- `メンバー一覧 + CSV`: `/members`
- `統計`: `/stats`（管理者）
- `しばき回数リセット`: `/reset`（管理者）
- `回数直接設定`: `/control user count`（管理者）
- `免除管理`: `/immune add|remove|list`（管理者）

### /menu から使える機能
- 基本: ランキング / メンバー一覧 / 統計
- しばき管理: 上限回数変更 / 免除管理 / 回数直接設定
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
