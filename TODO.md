# 実装TODO

レビュー内容をもとにした実装TODOです。優先度順に並べています。

## P0：まず対応

### TODO 1：Lavalink停止時でもBot本体を起動できるようにする【完了】【注意】

- 目的
  - 音楽機能を使わない場合でも、スラッシュコマンドや管理機能を利用可能にする。
- 変更対象ファイル
  - `src/index.ts`
  - `src/lavalink/lavalink.ts`
- 具体的な変更内容
  - `setupAppEventHandlers(client)` をLavalinkの待機処理より前に実行する。
  - スラッシュコマンド登録をLavalinkの接続テストより前に実行する。
  - Lavalinkの接続待機でBot全体を停止させない。
  - 音楽コマンド側でLavalink未接続時のエラーを返す。
  - 起動ログにLavalink未接続で起動したことを表示する。
- 影響範囲
  - Bot起動順序、スラッシュコマンド、音楽コマンド。
- 確認コマンド
  - `npm run build`
  - Lavalinkを停止した状態で起動し、管理系コマンドが応答することを確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 2：イベントハンドラの最上位エラー処理を追加する【完了】

- 目的
  - Discordイベント内の未処理Promise rejectionを防止する。
- 変更対象ファイル
  - `src/events/appEvents.ts`
  - `src/events/lavalinkHandlers.ts`
  - `src/index.ts`
- 具体的な変更内容
  - `interactionCreate` と `messageCreate` の非同期処理を共通エラーハンドラで囲む。
  - Lavalinkの復旧処理にも `.catch()` を追加する。
  - エラー内容にイベント名とguild IDを含めてログ出力する。
- 影響範囲
  - Discordイベント処理、音楽再生復旧処理。
- 確認コマンド
  - `npm run build`
  - Discord APIやLavalinkの処理を失敗させ、プロセスが終了しないことを確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

## P1：運用上の重要課題

### TODO 3：添付ファイルの最大サイズ制限を追加する【完了】【注意】

- 目的
  - 大容量ファイルによるディスク枯渇を防ぐ。
- 変更対象ファイル
  - `src/config/constants.ts`
  - `src/config/types.ts`
  - `src/config/runtime.ts`
  - `src/music/misc/upload-handler.ts`
  - `.env.example`
  - `README.md`
- 具体的な変更内容
  - `MUSIC_UPLOAD_MAX_MB` を追加する。
  - `Content-Length` が上限を超えた時点で拒否する。
  - ストリーム読み込み中も実測サイズを確認する。
  - 上限超過時は保存途中のファイルを削除する。
- 影響範囲
  - `p!upload`、ディスク使用量、アップロード設定。
- 確認コマンド
  - `npm run build`
  - 上限未満と上限超過の音声ファイルをアップロードして確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 4：yt-dlpのダウンロードサイズ制限を追加する【完了】【注意】

- 目的
  - 外部URLから巨大な音声ファイルを取得されることを防ぐ。
- 変更対象ファイル
  - `src/config/constants.ts`
  - `src/config/types.ts`
  - `src/config/runtime.ts`
  - `src/music/ytDlp/ytDlpUtils.ts`
  - `.env.example`
- 具体的な変更内容
  - `YT_DLP_MAX_FILESIZE_MB` を追加する。
  - yt-dlpに `--max-filesize` を渡す。
  - ダウンロード後にも実ファイルサイズを確認する。
  - 超過時はファイルを削除してエラーにする。
- 影響範囲
  - 外部URL再生、yt-dlpフォールバック、自動復旧。
- 確認コマンド
  - `npm run build`
  - サイズ超過・サイズ未満の外部URLで確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 5：一時ダウンロードファイルの定期削除を追加する【完了】

- 目的
  - yt-dlp成功後に残り続ける `remote-*` ファイルの蓄積を防ぐ。
- 変更対象ファイル
  - `src/music/ytDlp/ytDlpUtils.ts`
  - `src/index.ts`
  - `.env.example`
- 具体的な変更内容
  - `remote-*` のうち一定時間以上経過したファイルを削除する関数を追加する。
  - Bot起動時に一度実行する。
  - 必要であれば定期タイマーでも実行する。
  - 明示的にアップロードされたUUIDファイルは対象外にする。
- 影響範囲
  - `files/` の一時ファイル、外部URL再生。
- 確認コマンド
  - `npm run build`
  - 古い `remote-*` ファイルを作成し、起動後に削除されることを確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 6：ファイルサーバーのデフォルト公開範囲を見直す【完了】【注意】

- 目的
  - `/uploads` の意図しない外部公開を防ぐ。
- 変更対象ファイル
  - `src/config/constants.ts`
  - `src/fileserver/fileServer.ts`
  - `.env.example`
  - `README.md`
  - `deploy/nginx/shibakubot-uploads.conf.example`
- 具体的な変更内容
  - デフォルトの `FILE_HOST` を `127.0.0.1` にする。
  - 外部Lavalinkを使う場合は、明示的に `0.0.0.0` とURLを設定する手順を追加する。
  - nginx経由で公開する構成を推奨する。
  - `/uploads` が認証なし公開であることを明記する。
- 影響範囲
  - アップロード再生、外部Lavalink、VPS構成。
- 確認コマンド
  - `npm run build`
  - `FILE_HOST=127.0.0.1` と `FILE_HOST=0.0.0.0` の両方で接続確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 7：音量仕様を一本化する【完了】【注意】

- 目的
  - `p!vol <1-100>` と固定音量処理の矛盾を解消する。
- 変更対象ファイル
  - `src/music/misc/volume.ts`
  - `src/music/playback/player-connection.ts`
  - `src/events/lavalinkHandlers.ts`
  - `src/music/misc/constants.ts`
  - `README.md`
- 具体的な変更内容
  - `MUSIC_FIXED_VOLUME` を固定音量ではなく初期音量として扱う。
  - `p!vol` 実行後に、次のトラック開始時に値を上書きしない。
  - ヘルプと環境変数説明を実際の挙動に合わせる。
  - 未使用のユーザー別音量保存処理を残すか削除するか決める。
- 影響範囲
  - 音楽再生、音量コマンド、設定値、ユーザー体験。
- 確認コマンド
  - `npm run build`
  - `p!vol 50` 実行後に次の曲へ移動しても音量が維持されることを確認する。
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 8：PRごとのビルドCIを追加する【完了】

- 目的
  - mainへのマージ前に型エラーやビルドエラーを検出する。
- 変更対象ファイル
  - `.github/workflows/ci.yml`
  - `package.json`
- 具体的な変更内容
  - pull requestで実行されるCIを追加する。
  - Node.js 20を使用する。
  - `npm ci` と `npm run build` を実行する。
  - main/masterへのpushでも実行する。
- 影響範囲
  - GitHub Actions、PR運用。
- 確認コマンド
  - `npm run build`
  - GitHub上でテスト用PRを作成し、CIが実行されることを確認する。
- ロールバック方法
  - CI追加コミットを `git revert` する。

### TODO 9：最低限のユニットテスト基盤を追加する【完了】

- 目的
  - 環境変数パーサー、検索パーサー、曲長判定などの退行を防ぐ。
- 変更対象ファイル
  - `package.json`
  - `test/`
  - `.github/workflows/ci.yml`
- 具体的な変更内容
  - TypeScriptで実行できるテストランナーを追加する。
  - `npm test` スクリプトを追加する。
  - 以下の純粋関数からテストを始める。
    - `src/utils/env.ts`
    - `src/music/search/searchQuery.ts`
    - `src/music/misc/trackValidation.ts`
  - CIで `npm test` を実行する。
- 影響範囲
  - 開発環境、依存関係、CI。
- 確認コマンド
  - `npm test`
  - `npm run build`
- ロールバック方法
  - テスト関連コミットを `git revert` する。

## P2：保守性・安全性の改善

### TODO 10：yt-dlp自動取得を固定バージョン化する【完了】【注意】

- 目的
  - `latest` の内容が変わることによる再現性低下と供給元リスクを減らす。
- 変更対象ファイル
  - `src/music/ytDlp/ytDlpBinary.ts`
  - `src/config/runtime.ts`
  - `src/config/types.ts`
  - `.env.example`
  - `README.md`
- 具体的な変更内容
  - `YT_DLP_VERSION` を追加する。
  - `releases/latest` ではなく固定バージョンURLを使う。
  - 可能であればSHA-256検証を追加する。
  - 更新時はバージョン変更を明示する。
- 影響範囲
  - yt-dlp自動取得、初回起動、外部URL再生。
- 確認コマンド
  - `npm run build`
  - キャッシュを削除した状態で固定バージョンが取得されることを確認する。
- ロールバック方法
  - 直前のyt-dlp取得処理へ戻すコミットを `git revert` する。

### TODO 11：依存パッケージの脆弱性を段階的に解消する【完了】【注意】

- 目的
  - `npm audit` で検出されたhigh脆弱性を減らす。
- 変更対象ファイル
  - `package.json`
  - `package-lock.json`
- 具体的な変更内容
  - まず `npm audit` の依存経路を確認する。
  - breaking changeを伴わない更新を先に適用する。
  - `discord.js` のメジャーバージョン変更を伴う修正は別作業に分ける。
  - 更新ごとにビルドと音楽機能の確認を行う。
- 影響範囲
  - Discord接続、Express、HTTP通信、WebSocket、ビルド。
- 確認コマンド
  - `npm audit --omit=dev --audit-level=high`
  - `npm run build`
- ロールバック方法
  - `package.json` と `package-lock.json` の更新コミットを `git revert` する。

### TODO 12：古い開発者向けドキュメントを現行構成に更新する【完了】

- 目的
  - 存在しないファイルや古い環境変数による開発ミスを防ぐ。
- 変更対象ファイル
  - `.github/copilot-instructions.md`
  - `README.md`
  - `.env.example`
- 具体的な変更内容
  - 存在しない `src/consoleCommands.ts`、`src/triggers.ts` などの記述を削除・修正する。
  - `GUILD_ID` を `GUILD_IDS` に統一する。
  - 現在の実装に合わせて参照ファイル一覧を更新する。
  - 音量、Lavalink、ファイルサーバーの仕様を実装と一致させる。
- 影響範囲
  - 開発者オンボーディング、運用手順、AIエージェント向け指示。
- 確認コマンド
  - `rg -n "consoleCommands|triggers|GUILD_ID|src/config.ts" README.md .github .env.example`
- ロールバック方法
  - ドキュメント更新コミットを `git revert` する。

### TODO 13：設定ビルダーの重複を整理する【完了】

- 目的
  - 同じ設定ロジックを複数箇所で管理する状態を解消する。
- 変更対象ファイル
  - `src/config/runtime.ts`
  - `src/config/builders.ts`
  - `src/config/helpers.ts`
- 具体的な変更内容
  - `buildMusicConfig`、`buildYtdlpConfig`、`buildLavalinkConfig` の実装場所を一つに統一する。
  - 未使用のexportとimportを削除する。
  - 外部から利用する設定生成関数だけを公開する。
- 影響範囲
  - 起動時設定、環境変数解釈、設定関連のimport。
- 確認コマンド
  - `npm run build`
  - 主要な環境変数を設定して起動し、設定値が従来と一致することを確認する。
- ロールバック方法
  - リファクタリング前のコミットを `git revert` する。

## 追加レビューTODO

### TODO 14：音楽操作をBotと同じVCのユーザーに制限する【完了】【注意】

- 目的
  - VC未参加または別VCのユーザーによる再生妨害やBot移動を防ぐ。
- 変更対象ファイル
  - `src/music/misc/music-permissions.ts`
  - `src/music/playback/play.ts`
  - `src/music/playback/player-connection.ts`
  - `src/music/queue/queue-commands.ts`
  - `src/music/misc/volume.ts`
  - `src/music/misc/pause.ts`
  - `src/music/misc/repeat.ts`
- 具体的な変更内容
  - BotがVC接続中の場合、操作ユーザーが同じVCにいることを共通関数で確認する。
  - 別VCからの `p!play` で再生中のBotを移動させない。
  - 管理者・開発者を例外扱いするか仕様を決める。
- 確認方法
  - VC未参加、同じVC、別VCの各ユーザーで再生・停止・スキップ・音量・一時停止を確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 15：音楽無効化時に再生を安全に停止できるようにする【完了】【注意】

- 目的
  - `p!disable` 後も再生が続き、`p!stop` が拒否される状態を解消する。
- 変更対象ファイル
  - `src/music/musicHandler.ts`
  - `src/music/misc/music-toggle.ts`
  - `src/music/queue/queue-commands.ts`
- 具体的な変更内容
  - `p!disable` 実行時に既存プレイヤーを停止・破棄するか仕様を決める。
  - 少なくとも `p!stop` は音楽機能が無効でも実行可能にする。
  - 自動停止・リピート用タイマーも同時に解除する。
- 確認方法
  - 再生中に `p!disable` を実行し、音声とVC接続が残らないことを確認する。
  - 無効状態でも `p!stop` が応答することを確認する。
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 16：メニュー内コレクターの未処理Promise rejectionを防止する【完了】

- 目的
  - ボタン・セレクトメニュー処理の失敗でプロセスが不安定になることを防ぐ。
- 変更対象ファイル
  - `src/commands/system/menu.ts`
  - `src/commands/menu/panel.ts`
  - `src/commands/menu/managementActions.ts`
  - `src/commands/menu/controlHandler.ts`
  - `src/commands/menu/resetHandler.ts`
  - その他 `sub.on("collect", async ...)` を使用するメニューハンドラ。
- 具体的な変更内容
  - コレクターの非同期コールバックを共通エラーハンドラで囲む。
  - エラーログに操作名、guild ID、user IDを含める。
  - 応答前の失敗ではエフェメラルなエラー応答を試みる。
- 確認方法
  - Discord API失敗を発生させても未処理Promise rejectionにならないことを確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 17：`/sbk` の理由文字数と更新順序を修正する【完了】【注意】

- 目的
  - DB更新後にDiscord返信だけ失敗し、ユーザーには失敗表示なのに回数が増える状態を防ぐ。
- 変更対象ファイル
  - `src/discord/commandCatalog-base.ts`
  - `src/commands/sbk/sbk.ts`
  - `src/config/runtime.ts`
- 具体的な変更内容
  - コマンド登録時に `reason` の最大文字数を設定する。
  - 返信全体がDiscordの2000文字以内になるよう理由の上限を決める。
  - DBへ保存する理由と返信・ログに使う理由を更新前に正規化する。
- 確認方法
  - 上限ぴったり、上限超過、絵文字を含む理由で実行する。
  - 返信失敗時に回数だけ増えないことを確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 18：キュー削除をLavalinkのQueue API経由にする【完了】

- 目的
  - `p!remove` 実行時にキュー保存処理と変更イベントを正しく反映する。
- 変更対象ファイル
  - `src/music/queue/queue-commands.ts`
- 具体的な変更内容
  - `player.queue.tracks.splice()` の直接操作を廃止する。
  - `await player.queue.splice(index, 1)` または公式の削除APIを使用する。
  - 削除結果が空の場合のエラー応答を維持する。
- 確認方法
  - 先頭・中央・末尾の曲を削除し、キュー表示と再生順が一致することを確認する。
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 19：一覧系コマンドにページングと文字数制限を追加する【完了】

- 目的
  - Discordのメッセージ・Embed文字数上限によるコマンド失敗を防ぐ。
- 変更対象ファイル
  - `src/music/queue/queue-commands.ts`
  - `src/music/misc/ng-words.ts`
  - `src/commands/sbk/immune.ts`
  - `src/commands/sbk/ignore.ts`
- 具体的な変更内容
  - `p!queue` を一定件数ごとに分割またはページングする。
  - `p!ng list`、`/immune list`、`/ignore list` をDiscordの上限内に収める。
  - 省略時は残件数を表示する。
- 確認方法
  - 100曲のキューと多数のNGワード・ユーザーIDで一覧表示を確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 20：Lavalink切断時に接続状態を更新する【完了】

- 目的
  - 切断後も `isLavalinkReady()` が `true` を返す状態を解消する。
- 変更対象ファイル
  - `src/lavalink/lavalink.ts`
  - `src/events/lavalinkHandlers.ts`
  - `src/music/musicHandler.ts`
- 具体的な変更内容
  - node接続・切断イベントに合わせて接続状態を更新する。
  - 複数nodeを使う場合は、利用可能nodeが1つ以上あるかで判定する。
  - 再接続後に音楽コマンドを再び利用可能にする。
- 確認方法
  - 再生可能状態からLavalinkを停止・再起動し、案内メッセージと復旧を確認する。
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 21：`p!manage` の曖昧なユーザー選択を廃止する【完了】【注意】

- 目的
  - 入力ミスで別ユーザーの管理内容を変更する事故を防ぐ。
- 変更対象ファイル
  - `src/music/misc/manage.ts`
- 具体的な変更内容
  - 完全一致しない検索結果の先頭ユーザーを自動採用しない。
  - 複数候補がある場合はメンションまたはIDでの再入力を案内する。
  - 空白を含む表示名を扱う方法を決める。
- 確認方法
  - 完全一致、部分一致、同名ユーザー、存在しない名前で確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

### TODO 22：スラッシュコマンド失敗時のユーザー応答を追加する【完了】

- 目的
  - 例外発生時に「アプリケーションが応答しませんでした」だけが表示される状態を減らす。
- 変更対象ファイル
  - `src/events/appEvents.ts`
  - `src/discord/interactionRouter.ts`
- 具体的な変更内容
  - スラッシュコマンド例外時に、未応答ならエフェメラル返信を試みる。
  - defer済み・返信済みの場合は `editReply` または `followUp` を使い分ける。
  - 応答処理自体の失敗はログに残し、再throwしない。
- 確認方法
  - ハンドラを意図的に失敗させ、ユーザー向けエラーとプロセス継続を確認する。
  - `npm test`
  - `npm run build`
- ロールバック方法
  - 実装コミットを `git revert` する。

## 実装状況

- TODO 1〜13：実装完了
- TODO 14〜22：実装完了
