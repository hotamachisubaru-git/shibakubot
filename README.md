# しばくbot / ShibakuBot

Discordサーバー向けの多機能Botです。  
しばきカウント、メニューUI、VC操作、音楽再生（Lavalink）、AIチャット/画像生成に対応しています。

## 主な機能
- しばき回数の記録・ランキング・統計
- `/menu` からの管理操作（回数設定、免除管理、ログ/バックアップ等）
- VC操作（移動/切断/ミュート/解除）
- 音楽再生（`s!` プレフィックス、YouTube Music / YouTube / SoundCloud / Bandcamp 検索、Spotify URL/URI、各種URL再生、アップロード再生、NGワード管理）
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

## VPS運用
Linux VPS に移す場合は、`systemd` と Lavalink 用のテンプレートを同梱しています。

- 手順: [docs/vps.md](docs/vps.md)
- Bot service: [deploy/systemd/shibakubot.service.example](deploy/systemd/shibakubot.service.example)
- Lavalink service: [deploy/systemd/lavalink.service.example](deploy/systemd/lavalink.service.example)
- nginx 例: [deploy/nginx/shibakubot-uploads.conf.example](deploy/nginx/shibakubot-uploads.conf.example)
- Lavalink 設定例: [deploy/lavalink/application.yml.example](deploy/lavalink/application.yml.example)

## .env 設定例
```env
TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_IDS=111111111111111111,222222222222222222
# GUILD_ID=111111111111111111
OWNER_IDS=111111111111111111
IMMUNE_IDS=
LOG_CHANNEL_ID=

# AI chat (Ollama/OpenAI-compatible endpoint / Gemini compatible)
MODEL_ENDPOINT=http://localhost:11434/api/chat
MODEL_NAME=gpt-oss:20b
MODEL_AUTO_DETECT_NAMES=gemma3:27b,gpt-oss:20b
MODEL_GOOGLE_SEARCH_ENABLED=false
MODEL_API_KEY=
# guildId:key をカンマ区切りで指定すると、guild ごとに API キーを上書きできます
MODEL_API_KEY_BY_GUILD=
MODEL_TIMEOUT_MS=120000
# Leave AUX_MODEL_* empty to reuse MODEL_*
AUX_MODEL_ENDPOINT=
AUX_MODEL_NAME=
AUX_MODEL_AUTO_DETECT_NAMES=
AUX_MODEL_API_KEY=
AUX_MODEL_API_KEY_BY_GUILD=
AUX_MODEL_TIMEOUT_MS=120000
SYSTEM_PROMPT=あなたは親切で実用的なAIアシスタントです。回答は日本語で行ってください。
MAX_HISTORY_TURNS=8
MAX_RESPONSE_CHARS=8000
AI_GUILD_MEMORY_ENABLED=true
AI_GUILD_MEMORY_CHANNEL_LIMIT=4
AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL=30
AI_GUILD_MEMORY_MAX_INPUT_CHARS=12000
AI_GUILD_MEMORY_MAX_SUMMARY_CHARS=1200
AI_GUILD_MEMORY_REFRESH_HOURS=12
AI_GUILD_MEMORY_LIVE_ENABLED=true
AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD=12
AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS=60000
AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES=15

# AI image (optional / Stable Diffusion WebUI API)
IMAGE_ENDPOINT=
IMAGE_MODEL=
IMAGE_API_KEY=
IMAGE_API_KEY_BY_GUILD=
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
YT_DLP_ENABLED=true
YT_DLP_PATH=
YT_DLP_AUTO_DOWNLOAD=true
YT_DLP_TIMEOUT_MS=180000
YT_DLP_CACHE_DIR=./data/yt-dlp

# Lavalink
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_TRACE_ENABLED=false

# コマンド登録
CLEAR_GLOBAL=true
```

Gemini を使う場合の設定例:
```env
MODEL_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
MODEL_NAME=gemini-3.1-flash-lite-preview
MODEL_AUTO_DETECT_NAMES=none
MODEL_GOOGLE_SEARCH_ENABLED=true
MODEL_API_KEY=your_gemini_api_key
AUX_MODEL_AUTO_DETECT_NAMES=none
```

### 主な可変項目（補足）
- `GUILD_IDS` はカンマ区切り（`GUILD_ID` 1件指定も可）
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できるURLを指定
- `IMAGE_ENDPOINT` 未設定時は `/ai image` は利用不可
- `MODEL_AUTO_DETECT_NAMES` を設定すると、Ollama の実行中モデル一覧から先頭一致モデルを自動選択（`none` で無効化）
- 検出に失敗した場合は `MODEL_NAME` に自動フォールバック
- `MODEL_GOOGLE_SEARCH_ENABLED=true` かつ Gemini API 利用時は、Google Search grounding を有効化して最新情報を確認
- Gemini 3.1 系は `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite-preview` などの正式名を推奨（`models/` 接頭辞や `-preview` 省略は bot 側で最低限補正）
- `AUX_MODEL_*` を空欄にすると `MODEL_*` をそのまま再利用
- `MODEL_API_KEY_BY_GUILD` / `AUX_MODEL_API_KEY_BY_GUILD` / `IMAGE_API_KEY_BY_GUILD` は `guildId:key` をカンマ区切りで指定
- guild 別キーが未指定のサーバーは通常の `MODEL_API_KEY` / `AUX_MODEL_API_KEY` / `IMAGE_API_KEY` にフォールバック
- `AUX_MODEL_API_KEY` 未設定時は、guild 別設定を含めて `MODEL_API_KEY` 側へフォールバック
- `AUX_MODEL_*` を設定すると、サーバー特徴メモなどの補助AI処理だけ別モデルに分離可能
- 役割固定で使いたい場合は `MODEL_AUTO_DETECT_NAMES=none` と `AUX_MODEL_AUTO_DETECT_NAMES=none` を推奨
- `AI_GUILD_MEMORY_ENABLED=true` で、起動時に各サーバーの最近ログを少量要約してサーバー特徴メモを更新
- `AI_GUILD_MEMORY_LIVE_ENABLED=true` で、通常会話の増加に応じてもサーバー特徴メモを徐々に再更新
- サーバー特徴メモは `data/guilds/<guildId>.db` に保存され、`/ai chat` などの応答で参照
- `YT_DLP_ENABLED=true` で、Lavalink 未対応URLを `yt-dlp` 取り込みで再生可能
- `YT_DLP_PATH` を指定するとその実行ファイルを優先使用
- `YT_DLP_AUTO_DOWNLOAD=true` かつ `yt-dlp` が未導入なら、初回使用時に `YT_DLP_CACHE_DIR` へ公式バイナリを自動取得
- `CLEAR_GLOBAL=true` で `register` 時にグローバルコマンドを削除
- Lavalinkの高度設定も利用可（任意）
  - `LAVALINK_NODE_ID`
  - `LAVALINK_SECURE`
  - `LAVALINK_TRACE_ENABLED`
  - `LAVALINK_USERNAME`
  - `LAVALINK_DEFAULT_SEARCH_PLATFORM`
  - `LAVALINK_MAX_PREVIOUS_TRACKS`
  - `LAVALINK_EMPTY_QUEUE_DESTROY_MS`
  - `LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL`
  - `LAVALINK_VOLUME_DECREMENTER`
  - `LAVALINK_TRACE_ENABLED=false` で、`lavalink-client` の REST リクエストに付く `trace=true` を無効化

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
- 登録されるトップレベルコマンドは `/ping` `/sbk` `/ignore` `/menu` `/help` `/ai` の6個です
- `/ping` 生存確認
- `/sbk user count? reason?` しばく
- `/ignore add user` bot が自動で無視するユーザーを追加（管理者/開発者）
- `/ignore remove user` bot の ignore 対象を解除（管理者/開発者）
- `/ignore list` bot の ignore 一覧を表示（管理者/開発者）
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

キーワード検索は YouTube Music / YouTube / SoundCloud / Bandcamp の候補を統合して表示します。
`ytm:` / `yt:` / `sc:` / `bc:` を先頭につけると、検索先を固定できます。

Spotify は公開 `track / album / playlist` URL と `spotify:track:...` / `spotify:album:...` / `spotify:playlist:...` を再生対象として扱います。
Bot は Spotify の曲情報を参照して既存の再生ソースへ変換してキューに追加します。
通常の URL 再生は Lavalink の対応ソースに依存します。
Lavalink 側で有効なら、例として `YouTube / ニコニコ / SoundCloud / Bandcamp / Vimeo / Twitch / HTTP直リンク音声` などのURLを直接再生できます。
未対応URLは `yt-dlp` フォールバックで取り込み再生を試みます。
例: `TikTok / Bilibili / X / Instagram / Dailymotion` など。
ただし、非公開・地域制限・要ログイン・ライブ配信・長さ不明・15分超のURLは再生できません。

## データ保存
- ギルドDB: `data/guilds/<guildId>.db`
  - しばき回数、設定、AI会話履歴、AIプロンプト/キャラ状態、返信再生成状態を保存
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
- 外部動画サイトURLが再生できない
  - `YT_DLP_ENABLED=true` か確認
  - `YT_DLP_PATH` を使う場合は実行ファイルの存在確認
  - 自動取得を使う場合は `YT_DLP_AUTO_DOWNLOAD=true` と外部ネットワーク疎通を確認
  - 非公開・地域制限・要ログイン・ライブ配信URLは取り込みできない場合あり

## 開発補助コマンド
- `npm run migrate` 旧データ移行
- `npm run release:bundle` 配布バンドル作成（`release/shibakubot-v<version>` と `release/<version>` を生成）

## リリース
- `main` / `master` に push されたとき、`package.json` の `version` が未リリースなら GitHub Release を自動作成
- リリースしたい変更では先に `package.json` の `version` を更新してから push

## ライセンス
MIT License
