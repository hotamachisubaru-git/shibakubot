# Copilot / AI エージェント向け指示（ShibakuBot）

## ランタイムと確認コマンド

- Node.js 20以上を使用する。
- 開発起動: `npm run dev`
- ビルド: `npm run build`
- ユニットテスト: `npm test`
- 本番起動: `npm run build && npm run start`
- スラッシュコマンドはBot起動時に登録される。登録だけ行う場合は `npm run register` を使用する。

## 主要な環境変数

- Discord: `TOKEN`, `CLIENT_ID`, `GUILD_IDS`, `OWNER_IDS`, `IMMUNE_IDS`
- ファイル配信: `FILE_DIR`, `FILE_HOST`, `FILE_PORT`, `UPLOAD_INTERNAL_URL`, `UPLOAD_BASE_URL`
- 音楽: `MUSIC_PREFIX`, `MUSIC_FIXED_VOLUME`, `MUSIC_MAX_MINUTES`, `MUSIC_UPLOAD_MAX_MB`
- yt-dlp: `YT_DLP_ENABLED`, `YT_DLP_VERSION`, `YT_DLP_SHA256`, `YT_DLP_MAX_FILESIZE_MB`
- Lavalink: `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD`, `LAVALINK_SECURE`

`MUSIC_FIXED_VOLUME` は新規プレイヤーの初期音量として扱う。`FILE_HOST` のデフォルトは `127.0.0.1` であり、`/uploads` を外部公開する場合は認証なしであることに注意する。

## 現在の構成

- `src/index.ts`: Bot起動、コマンド登録、イベントハンドラ設定、Lavalink初期化
- `src/discord/`: スラッシュコマンド定義・登録・ルーティング
- `src/commands/`: スラッシュコマンド実装
- `src/events/`: DiscordイベントとLavalink再生イベント
- `src/lavalink/`: Lavalinkクライアント設定、接続確認、Discord音声イベント転送
- `src/music/`: 音楽コマンド、検索、再生、アップロード、yt-dlpフォールバック
- `src/config/`: 環境変数からの実行時設定生成
- `src/data/`: guild単位のSQLite永続化
- `test/`: Node.js test runnerとtsxを使用したユニットテスト

## 実装上の規約

- guildやユーザーは表示名ではなくDiscord ID文字列で識別する。
- guild単位の永続化は `src/data.ts` が公開する関数を利用する。
- 非同期イベント処理は最上位で例外を捕捉し、イベント名とguild IDをログに含める。
- 設定生成ロジックは `src/config/builders.ts` に置き、`src/config/runtime.ts` は組み立てに専念させる。
- yt-dlpの取得バージョンを変更する場合は、対象OS向け資産のSHA-256も更新する。
- 変更後は最低限 `npm test` と `npm run build` を実行する。
