# しばくbot / ShibakuBot

Discordサーバー向けのBotです。  
しばきカウント、メンテナンス用メニューUI、音楽再生（Lavalink）、データ保存に対応しています。

## 主な機能
- しばき回数の記録・ランキング・統計
- `/menu` からの保守操作（回数設定、免除管理、ログ/バックアップ、メンテナンス切替、Bot権限確認等）
- 音楽再生（`p!` プレフィックス、YouTube Music / YouTube / SoundCloud / Bandcamp 検索、Spotify URL/URI、各種URL再生、アップロード再生、NGワード管理）

## 前提
- Bun `>= 1.4.3`（この `bun` ブランチのBot実行環境）
- `yt-dlp` を使ったYouTube再生には JavaScript challenge 対応ランタイムが別途必要（`Node.js >= 22` を `PATH` に置くか、`Deno` を利用）
- Discord Developer Portal で以下 Intents を有効化
  - `SERVER MEMBERS INTENT`
  - `MESSAGE CONTENT INTENT`
  - `GUILD VOICE STATES INTENT`
- 音楽機能を使う場合は Lavalink を別プロセスで起動

### Lavalink の重要注意（2026年以降）
Discord Voice の仕様変更により、古い音声クライアントは接続拒否されます（close code `4017`）。  
このBotで音楽機能を使う場合は **Lavalink 4.2.0 以上（推奨: 最新）** を使用してください。

## セットアップ
1. [Bun公式サイト](https://bun.com/docs/installation) の手順で Bun 1.4.3 以上をインストールし、依存関係を固定バージョンで展開
   ```bash
   bun install --frozen-lockfile
   ```
2. `.env.example` を参考に `.env` を作成
3. Lavalink を起動（音楽機能を使う場合。未起動でもBot本体は起動します）
4. 起動（ログイン後、スラッシュコマンドを登録してからLavalink接続を開始します）
   ```bash
   bun run dev
   ```

スラッシュコマンドだけを手動で登録する場合:
```bash
bun run register
```

本番実行:
```bash
bun run build
bun run start
```

`bun run start` はログイン後にスラッシュコマンドを登録します。手動登録する場合は、先に `bun run register:prod` を実行してください。

### WindowsでNode.js版から切り替える際の注意

1. 既存のNode.js版Botを停止する（同じDiscordトークンで二重起動しない）。
2. `.env` と `data/`（必要なら `backup/`・`files/` も）をバックアップする。これらはGitの追跡対象外です。
3. `git switch bun` → `bun install --frozen-lockfile` → `bun test` → `bun run build` の順で確認する。
4. 問題なければ `bun run start` を実行する。問題が起きたら旧プロセスを停止した状態で、バックアップと元のNode.js版に戻す。

SQLiteドライバーはBun対応を確認した `better-sqlite3` v13系へ更新しています。
本体の実行はBunに移行しますが、`yt-dlp` のJavaScript challenge処理は互換性上、Node.js 22以上（または対応するDeno）を使います。

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
OWNER_IDS=111111111111111111
IMMUNE_IDS=
LOG_CHANNEL_ID=

# 音楽/アップロード
FILE_DIR=./files
FILE_HOST=127.0.0.1
FILE_PORT=3001
UPLOAD_INTERNAL_URL=http://127.0.0.1:3001/uploads
UPLOAD_BASE_URL=http://localhost:3001/uploads
MUSIC_PREFIX=p!
MUSIC_FIXED_VOLUME=20
MUSIC_MAX_MINUTES=15
MUSIC_UPLOAD_MAX_MB=25
YT_DLP_ENABLED=true
YT_DLP_PATH=
YT_DLP_AUTO_DOWNLOAD=true
YT_DLP_TIMEOUT_MS=180000
YT_DLP_CACHE_DIR=./data/yt-dlp
YT_DLP_VERSION=2026.08.19
# YT_DLP_SHA256=custom_version_asset_sha256
YT_DLP_MAX_FILESIZE_MB=100
YT_DLP_TEMP_MAX_AGE_HOURS=24
YT_DLP_CLEANUP_INTERVAL_MINUTES=360

# Lavalink
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_TRACE_ENABLED=false

# コマンド登録
CLEAR_GLOBAL=true
```

### 主な可変項目（補足）
- `GUILD_IDS` はカンマ区切りで1件以上指定
- ファイルサーバーはデフォルトで `127.0.0.1` のみに公開されます
- `/uploads` には認証がありません。外部公開する場合は、ファイルサーバーのポートを直接公開せず nginx 経由にすることを推奨します
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できるURLを指定
- Lavalinkが別ホストにある場合は、`FILE_HOST=0.0.0.0` とし、`UPLOAD_INTERNAL_URL` にBotホストの実際のIPアドレスまたはホスト名を明示してください
- `MUSIC_UPLOAD_MAX_MB` は添付ファイルの保存上限です。レスポンスヘッダーとストリームの実測値の両方を検査します
- `MUSIC_FIXED_VOLUME` は新規プレイヤーの初期音量です（1〜100）。`p!vol` で変更した値は次のトラックでも維持されます
- `YT_DLP_ENABLED=true` で、Lavalink 未対応URLを `yt-dlp` 取り込みで再生可能
- `YT_DLP_PATH` を指定するとその実行ファイルを優先使用
- `YT_DLP_AUTO_DOWNLOAD=true` なら、`YT_DLP_VERSION` の公式バイナリを `YT_DLP_CACHE_DIR` へ取得し、SHA-256検証後に使用
- 自動取得が有効な場合は、OSの `PATH` にある古い `yt-dlp` より、バージョン管理された検証済みバイナリを優先
- Bun実行時は`yt-dlp`に`--js-runtimes node`を渡してOSの`PATH`上のNode.js 22以上を利用します。Node.jsがない場合は対応するDenoを導入してください（Bun自身はyt-dlpのランタイムとして指定しません）
- デフォルト以外の `YT_DLP_VERSION` に変更する場合は、そのOS向けリリース資産の `YT_DLP_SHA256` も指定してください
- `YT_DLP_MAX_FILESIZE_MB` は外部URLから取得するファイルの上限です。yt-dlp実行時とダウンロード後の両方で検査します
- `YT_DLP_TEMP_MAX_AGE_HOURS` を超えた `remote-*` ファイルは、起動時および `YT_DLP_CLEANUP_INTERVAL_MINUTES` 間隔で削除されます
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
  - `LAVALINK_TRACE_ENABLED=false` で、`lavalink-client` の REST リクエストに付く `trace=true` を無効化

## 必要なBot権限
- `View Channels`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Connect`
- `Speak`

## スラッシュコマンド
- 登録されるトップレベルコマンドは `/sbk` `/check` `/immune` `/ignore` `/reset` `/menu` の6個です
- `/sbk user count? reason?` しばく
- `/check user` しばかれ回数を確認
- `/immune add user` しばき免除ユーザーを追加（管理者/開発者）
- `/immune remove user` しばき免除ユーザーを解除（管理者/開発者）
- `/immune list` しばき免除一覧を表示（管理者/開発者）
- `/ignore add user` bot が自動で無視するユーザーを追加（管理者/開発者）
- `/ignore remove user` bot の ignore 対象を解除（管理者/開発者）
- `/ignore list` bot の ignore 一覧を表示（管理者/開発者）
- `/reset user? all?` しばき回数をリセット（管理者/開発者）
- `/menu` メニュー表示
- ランキング、ログ設定、免除管理、DB保守、バックアップ、メンテナンス切替、Bot権限確認は `/menu` から利用

## 音楽コマンド（メッセージ）
プレフィックスは既定で `p!` です。

- `p!play <URL / Spotify URI / キーワード>` 再生/キュー追加
- `p!play 1` など 検索結果の番号選択
- `p!np` 再生中表示
- `p!skip` / `p!s` スキップ
- `p!pause` 一時停止/再開
- `p!vol <1-100>` 音量設定
- `p!stop` 停止してVC退出
- `p!queue` キュー表示
- `p!upload [表示名]` 音源アップロード再生
- `p!remove <番号>` / `p!delete <番号>` キュー削除
- `p!ng add|remove|list|clear` NGワード管理（管理者）
- `p!manage <username> [内容]` ユーザー別の管理内容を保存/確認（管理者）
- `p!disable` / `p!d` 音楽機能を無効化（管理者）
- `p!enable` / `p!e` 音楽機能を有効化（管理者）
- `p!help` ヘルプ

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
  - しばき回数、免除/ignore、ログ、音楽設定、メンテナンス設定を保存
- バックアップ: `backup/`
- アップロード保存先: `files/`（`FILE_DIR` で変更可）

## トラブルシューティング
- `Used disallowed intents`
  - Developer Portal で Intents を有効化
- `Unknown interaction`
  - `bun run register` を再実行
- Bunの依存関係やSQLiteネイティブモジュールが読み込めない
  - Botを停止し、`bun install --frozen-lockfile` を再実行して、`bun test` で確認
  - `node_modules` を別OSからコピーせず、そのOS上で依存関係をインストールしてください
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
- `bun test` SQLite・設定・yt-dlpランタイム検証
- `bun run migrate` 旧データ移行
- `bun run release:bundle` 配布バンドル作成（`release/shibakubot-v<version>` と `release/<version>` を生成）

Pull Requestおよび `main` / `master` / `bun` へのpushでは、GitHub ActionsがWindowsとUbuntuの両方でBun 1.4.3を使い、依存関係の固定インストール、テスト、ビルド、SQLite動作確認を実行します（この `bun` ブランチのワークフロー）。

## リリース
- `main` / `master` に push されたとき、`package.json` の `version` が未リリースなら GitHub Release を自動作成（ワークフローとREADMEのみの変更では実行しません）
- リリースしたい変更では先に `package.json` の `version` を更新してから push

## ライセンス
MIT License
