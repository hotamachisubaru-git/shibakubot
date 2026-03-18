# しばくbot / ShibakuBot

Discordサーバー向けの多機能Botです。  
しばきカウント、メニューUI、VC操作、音楽再生（Lavalink）、AIチャット/画像生成に対応しています。

## 主な機能
- しばき回数の記録・ランキング・統計
- `/menu` からの管理操作（回数設定、免除管理、ログ/バックアップ等）
- VC操作（移動/切断/ミュート/解除）
- 音楽再生（`s!` プレフィックス、アップロード再生、Spotify URL/URI、NGワード管理）
- AIチャット（Ollama/OpenAI互換API）
- AI画像生成（Stable Diffusion WebUI API）
- 2択投票（`/menu` から作成）

## 前提
- Node.js `>= 20`
- Discord Developer Portal で以下 Intents を有効化
  - `SERVER MEMBERS INTENT`
  - `MESSAGE CONTENT INTENT`
  - `GUILD VOICE STATES INTENT`
- 音楽機能を使う場合は Lavalink を別プロセスで起動

### Lavalink の重要注意（2026年以降）
Discord Voice の仕様変更により、古い音声クライアントは接続拒否されます（close code `4017`）。  
このBotで音楽機能を使う場合は **Lavalink 4.2.0 以上（推奨: 最新）** を使用してください。

## セットアップ
1. 依存インストール
   ```bash
   npm install
   ```
2. `.env.example` を参考に `.env` を作成
3. Lavalink を起動（音楽機能を使う場合）
4. スラッシュコマンド登録
   ```bash
   npm run register
   ```
5. 起動
   ```bash
   npm run dev
   ```

本番実行:
```bash
npm run build
npm run register:prod
npm run start
```

## .env 設定例
```env
TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_IDS=111111111111111111,222222222222222222
# GUILD_ID=111111111111111111
OWNER_IDS=111111111111111111
IMMUNE_IDS=
LOG_CHANNEL_ID=

# AI chat (Ollama/OpenAI-compatible endpoint)
MODEL_ENDPOINT=http://localhost:11434/api/chat
MODEL_NAME=gpt-oss:20b
MODEL_API_KEY=
MODEL_TIMEOUT_MS=120000
SYSTEM_PROMPT=あなたは親切で実用的なAIアシスタントです。回答は日本語で行ってください。
MAX_HISTORY_TURNS=8
MAX_RESPONSE_CHARS=8000

# AI image (optional / Stable Diffusion WebUI API)
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
FILE_DIR=./files
FILE_HOST=0.0.0.0
FILE_PORT=3001
UPLOAD_INTERNAL_URL=http://127.0.0.1:3001/uploads
UPLOAD_BASE_URL=http://localhost:3001/uploads
MUSIC_MAX_MINUTES=15

# Lavalink
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass

# コマンド登録
CLEAR_GLOBAL=true
```

### 主な可変項目（補足）
- `GUILD_IDS` はカンマ区切り（`GUILD_ID` 1件指定も可）
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できるURLを指定
- `IMAGE_ENDPOINT` 未設定時は `/ai image` は利用不可
- `CLEAR_GLOBAL=true` で `register` 時にグローバルコマンドを削除
- Lavalinkの高度設定も利用可（任意）
  - `LAVALINK_NODE_ID`
  - `LAVALINK_SECURE`
  - `LAVALINK_USERNAME`
  - `LAVALINK_DEFAULT_SEARCH_PLATFORM`
  - `LAVALINK_MAX_PREVIOUS_TRACKS`
  - `LAVALINK_EMPTY_QUEUE_DESTROY_MS`
  - `LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL`
  - `LAVALINK_VOLUME_DECREMENTER`

## 必要なBot権限
- `View Channels`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Connect`
- `Speak`
- `Move Members`
- `Mute Members`

## スラッシュコマンド
- 登録されるトップレベルコマンドは `/ping` `/sbk` `/menu` `/help` `/ai` の5個です
- `/ping` 生存確認
- `/sbk user count? reason?` しばく
- `/menu` メニュー表示
- `/help` コマンド一覧
- `/ai chat message new_session? private?` AI会話
- `/ai reply message_id instruction? new_session? private?` 指定メッセージ返信生成
- `/ai regen private?` 直前 `/ai reply` を再生成
- `/ai image prompt size? private?` 画像生成（`IMAGE_ENDPOINT` 設定時）
- `/ai history turns? private?` 会話履歴表示
- `/ai setprompt content private? reset_history?` システムプロンプト更新
- `/ai setcharacter character private? reset_history?` 口調プリセット適用
- `/ai chatreset` AI会話履歴とプロンプトをリセット
- ランキング、VC操作、ログ設定、免除管理、投票などの運用系機能は `/menu` から利用

## 音楽コマンド（メッセージ）
プレフィックスは既定で `s!` です。

- `s!play <URL / Spotify URI / キーワード>` 再生/キュー追加
- `s!play 1` など 検索結果の番号選択
- `s!np` 再生中表示
- `s!skip` / `s!s` スキップ
- `s!stop` 停止してVC退出
- `s!queue` キュー表示
- `s!upload [表示名]` 音源アップロード再生
- `s!remove <番号>` / `s!delete <番号>` キュー削除
- `s!ng add|remove|list|clear` NGワード管理（管理者）
- `s!disable` / `s!d` 音楽機能を無効化（管理者）
- `s!enable` / `s!e` 音楽機能を有効化（管理者）
- `s!help` ヘルプ

対応アップロード形式: `mp3, wav, flac, m4a, aac, ogg`

Spotify は公開 `track / album / playlist` URL と `spotify:track:...` / `spotify:album:...` / `spotify:playlist:...` を再生対象として扱います。
Bot は Spotify の曲情報を参照して既存の再生ソースへ変換してキューに追加します。

## データ保存
- ギルドDB: `data/guilds/<guildId>.db`
- バックアップ: `backup/`
- アップロード保存先: `files/`（`FILE_DIR` で変更可）

## トラブルシューティング
- `Used disallowed intents`
  - Developer Portal で Intents を有効化
- `Unknown interaction`
  - `npm run register` を再実行
- 音楽が無音/再生されない
  - Lavalink のバージョンが `4.2.0+` か確認
  - `LAVALINK_HOST` / `LAVALINK_PORT` / `LAVALINK_PASSWORD` の一致確認
  - Botに `Connect` / `Speak` 権限があるか確認
  - `UPLOAD_INTERNAL_URL` が Lavalink から到達可能か確認

## 開発補助コマンド
- `npm run migrate` 旧データ移行
- `npm run release:bundle` 配布バンドル作成

## リリース
- `main` / `master` に push されたとき、`package.json` の `version` が未リリースなら GitHub Release を自動作成
- リリースしたい変更では先に `package.json` の `version` を更新してから push

## ライセンス
MIT License
