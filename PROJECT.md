# Shibakubot プロジェクト概要

## 1. プロジェクト名
**shibakubot** — Discord ボット

## 2. 言語・フレームワーク
| 項目 | 値 |
|------|------|
| 言語 | TypeScript |
| ルーティング | Eris (Discord.js ではなく Eris) |
| データストア | SQLite (better-sqlite3) |
| 音楽再生 | Lavalink (外部音声サーバー連携) |
| AI | OpenAI互換エンドポイント + Google Search |
| 画像生成 | OpenAI互換 / Stable Diffusion 互換エンドポイント |
| ビルド | tsc (tsconfig.json あり) |
| パッケージ管理 | npm (package.json / package-lock.json) |

## 3. ディレクトリ構成

```
shibakubot/
├── src/
│   ├── index.ts            # エントリーポイント
│   ├── config/
│   │   ├── runtime.ts      # 環境変数ベースのランタイム設定ビルダー
│   │   └── ...
│   ├── data/
│   │   └── store.ts        # SQLite データアクセスレイヤー（全 DB 操作）
│   ├── music/
│   │   ├── player.ts       # プレイヤーロジック
│   │   ├── queue.ts         # キュー管理
│   │   ├── lavalink.ts     # Lavalink 接続
│   │   └── ...
│   ├── commands/
│   │   ├── sbk/            # sbk コマンド群（カウント・免疫・ログなど）
│   │   ├── ai/             # AI コマンド群
│   │   ├── music/          # 音楽コマンド群
│   │   ├── system/         # システムコマンド群
│   │   └── ...
│   ├── ai/
│   │   ├── chat/           # AI チャット機能
│   │   ├── image/          # AI 画像生成
│   │   └── memory/         # AI メモリ（サーバー履歴要約）
│   ├── utils/
│   │   └── ...             # ユーティリティ関数
│   └── ...
├── package.json
├── tsconfig.json
└── ...
```

## 4. 主要機能

### 4.1 sbk コマンド（カウントシステム）
- **カウント増加**: メッセージ投稿時に自動的にカウントがインクリメント
- **カウントリセット**: 全カウントの初期化
- **免疫機能**: 特定ユーザーのカウント除外
- **ログ機能**: カウント変更の履歴記録（logs テーブル）
- **ランク付け**: カウント順のランキング表示
- **無視ユーザー**: 特定ユーザーのメッセージをカウント対象から除外

### 4.2 AI チャット機能
- **会話セッション**: AI との継続的な会話（ai_sessions テーブル）
- **メッセージ履歴**: 会話履歴の保存（ai_messages テーブル）
- **返信状態管理**: quick reply の状態管理（ai_reply_states テーブル）
- **カスタムプロンプト**: ユーザー別のカスタムプロンプト設定
- **キャラクター**: キャラクターごとのプロンプト切り替え
- **Google 検索**: 必要に応じて Google 検索を統合
- **履歴要約**: 長い会話を自動的に要約（maxHistoryTurns で制御）
- **応答文字数制限**: maxResponseChars で応答長を制限

### 4.3 AI 画像生成
- **画像エンドポイント**: OpenAI 互換 / Stable Diffusion 互換
- **モデル指定**: imageModel で生成モデルを指定
- **API キー管理**: グuild ごとの API キー切り替え（imageApiKeysByGuild）
- **パラメータ設定**: サイズ、ステップ数、CFG スケール、サンプラー名、ネガティブプロンプト
- **タイムアウト**: imageTimeoutMs で応答タイムアウトを制御

### 4.4 AI メモリ（サーバー履歴要約）
- **チャンネル制限**: guildMemoryChannelLimit で対象チャンネル数を制限
- **メッセージ数制限**: guildMemoryMessagesPerChannel でチャンネルあたりのメッセージ数を制限
- **入力文字数制限**: guildMemoryMaxInputChars で最大入力文字数を制限
- **要約文字数制限**: guildMemoryMaxSummaryChars で要約の最大文字数を制限
- **リフレッシュ間隔**: guildMemoryRefreshHours で要約更新頻度を設定
- **ライブ更新**: guildMemoryLiveEnabled でリアルタイム更新を有効化
- **メッセージ閾値**: guildMemoryLiveMessageThreshold でライブ更新の閾値を設定
- **デバウンス**: guildMemoryLiveDebounceMs で更新デバウンスを設定
- **最小間隔**: guildMemoryLiveMinIntervalMinutes でライブ更新の最小間隔を設定

### 4.5 音楽機能
- **Lavalink 連携**: 外部音声サーバー（Lavalink）との接続
- **ノード設定**: nodeId, host, port, authorization, secure 等で接続設定
- **検索プラットフォーム**: ytmsearch 等をデフォルト検索プラットフォームとして使用
- **キュー管理**: 再生キューの管理
- **プレイヤー**: 音声再生の制御
- **音量管理**: ユーザー別の音量設定（user_music_settings テーブル）
- **音量減衰**: volumeDecrementer による音量の自動減衰
- **空キュー破棄**: emptyQueueDestroyMs で空のキューを自動的に破棄
- **トラック長制限**: maxTrackMinutes でトラックの最大長を制限
- **Pending 検索 TTL**: pendingSearchTtlMs で保留中の検索結果の有効期限を設定
- **最大選択結果数**: maxSelectionResults で検索結果の最大数（1〜25）
- **許可拡張子**: allowedExtensions で許可されるファイル拡張子
- **コンテンツタイプ→拡張子マッピング**: contentTypeToExtension
- **Spotify デバッグ**: spotifyDebugEnabled で Spotify デバッグを有効化
- **固定音量**: fixedVolume で音量を固定
- **YT-DLP**: YouTube 動画のダウンロード（YT_DLP_ENABLED, YT_DLP_PATH, YT_DLP_AUTO_DOWNLOAD, YT_DLP_TIMEOUT_MS, ytDlpCacheDir）
- **音楽プレフィックス**: MUSIC_PREFIX で音楽コマンドのプレフィックスを指定

### 4.6 ファイルサーバー
- **アップロードディレクトリ**: uploadDir でアップロード先を指定
- **ホスト/ポート**: fileHost, filePort でファイルサーバーの設定

### 4.7 システムコマンド
- **ヘルプ**: ボットのヘルプ表示
- **ping**: ボットの応答速度確認
- **サーバー情報**: サーバーの詳細情報表示
- **ユーザー情報**: ユーザーの詳細情報表示
- **設定**: ボットの設定表示・変更
- **データベース**: データベースのメンテナンス（チェックポイント、VACUUM）

## 5. データベーススキーマ（SQLite）

### counts テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| userId | TEXT (PK) | ユーザー ID |
| count | TEXT | カウント値（TEXT 型で保存） |

### immune テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| userId | TEXT (PK) | 免疫ユーザー ID |

### ignored_users テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| userId | TEXT (PK) | 無視ユーザー ID |

### settings テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| key | TEXT (PK) | 設定キー |
| value | TEXT | 設定値 |

### logs テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER (PK) | ログ ID |
| at | INTEGER | タイムスタンプ |
| actor | TEXT | 操作者 |
| target | TEXT | 対象ユーザー |
| reason | TEXT | 理由 |
| delta | TEXT | 増減値（TEXT 型で保存） |

### user_music_settings テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| userId | TEXT (PK) | ユーザー ID |
| key | TEXT (PK) | 設定キー |
| value | TEXT | 設定値 |

### ai_sessions テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| conversationKey | TEXT (PK) | 会話キー |
| customPrompt | TEXT | カスタムプロンプト |
| characterId | TEXT | キャラクター ID |
| updatedAt | INTEGER | 最終更新時刻 |

### ai_messages テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| id | INTEGER (PK) | メッセージ ID |
| conversationKey | TEXT | 会話キー |
| role | TEXT | メッセージロール |
| content | TEXT | メッセージ内容 |
| createdAt | INTEGER | 作成時刻 |

### ai_reply_states テーブル
| カラム | 型 | 説明 |
|--------|------|------|
| conversationKey | TEXT (PK) | 会話キー |
| targetMessageId | TEXT | 対象メッセージ ID |
| userMessage | TEXT | ユーザーメッセージ |
| quickReplyInput | TEXT | クイック返信入力 |
| lastAssistantMessage | TEXT | 最後の AI 応答 |
| isPrivate | INTEGER | プライベートフラグ |
| updatedAt | INTEGER | 最終更新時刻 |

## 6. 環境変数（主要なもの）

| 変数名 | 説明 |
|--------|------|
| TOKEN | Discord ボットトークン |
| CLIENT_ID | Discord クライアント ID |
| GUILD_IDS / GUILD_ID | 対象サーバー ID（カンマ区切り） |
| OWNER_IDS | オーナー ID（カンマ区切り） |
| IMMUNE_IDS | 免疫 ID（カンマ区切り） |
| LOG_CHANNEL_ID | ログチャンネル ID |
| AI_MODEL_ENDPOINT | AI モデルエンドポイント |
| AI_MODEL_NAME | AI モデル名 |
| AI_MODEL_API_KEY | AI API キー |
| AI_MODEL_API_KEYS_BY_GUILD | サーバー別 AI API キー |
| AI_MODEL_TIMEOUT_MS | AI タイムアウト（ms） |
| AI_MAX_HISTORY_TURNS | AI 履歴の最大ターン数 |
| AI_MAX_RESPONSE_CHARS | AI 応答の最大文字数 |
| AI_GUILD_MEMORY_ENABLED | サーバーメモリ有効化 |
| AI_GUILD_MEMORY_CHANNEL_LIMIT | サーバーメモリのチャンネル制限 |
| AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL | チャンネルあたりのメッセージ数 |
| AI_GUILD_MEMORY_MAX_INPUT_CHARS | 最大入力文字数 |
| AI_GUILD_MEMORY_MAX_SUMMARY_CHARS | 最大要約文字数 |
| AI_GUILD_MEMORY_REFRESH_HOURS | 要約リフレッシュ間隔（時間） |
| AI_GUILD_MEMORY_LIVE_ENABLED | ライブ更新有効化 |
| AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD | ライブ更新のメッセージ閾値 |
| AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS | ライブ更新のデバウンス（ms） |
| AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES | ライブ更新の最小間隔（分） |
| AI_IMAGE_ENDPOINT | 画像生成エンドポイント |
| AI_IMAGE_MODEL | 画像生成モデル |
| AI_IMAGE_API_KEY | 画像生成 API キー |
| AI_IMAGE_API_KEYS_BY_GUILD | サーバー別画像 API キー |
| AI_IMAGE_TIMEOUT_MS | 画像生成タイムアウト（ms） |
| AI_IMAGE_DEFAULT_SIZE | デフォルト画像サイズ |
| AI_IMAGE_STEPS | 画像生成ステップ数 |
| AI_IMAGE_CFG_SCALE | CFG スケール |
| AI_IMAGE_SAMPLER_NAME | サンプラー名 |
| AI_IMAGE_NEGATIVE_PROMPT | ネガティブプロンプト |
| MUSIC_PREFIX | 音楽コマンドプレフィックス |
| LAVALINK_NODE_ID | Lavalink ノード ID |
| LAVALINK_HOST | Lavalink ホスト |
| LAVALINK_PORT | Lavalink ポート |
| LAVALINK_PASSWORD | Lavalink 認証 |
| LAVALINK_SECURE | Lavalink 接続のセキュリティ |
| LAVALINK_TRACE_ENABLED | トレース有効化 |
| LAVALINK_USERNAME | Lavalink ユーザー名 |
| LAVALINK_DEFAULT_SEARCH_PLATFORM | デフォルト検索プラットフォーム |
| LAVALINK_MAX_PREVIOUS_TRACKS | 直前のトラックの最大数 |
| LAVALINK_EMPTY_QUEUE_DESTROY_MS | 空キュー破棄までの時間（ms） |
| LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL | クライアント位置更新間隔（ms） |
| LAVALINK_VOLUME_DECREMENTER | 音量減衰係数 |
| YT_DLP_ENABLED | YT-DLP 有効化 |
| YT_DLP_PATH | YT-DLP パス |
| YT_DLP_AUTO_DOWNLOAD | 自動ダウンロード有効化 |
| YT_DLP_TIMEOUT_MS | YT-DLP タイムアウト（ms） |
| UPLOAD_DIR | アップロードディレクトリ |
| FILE_HOST | ファイルサーバーホスト |
| FILE_PORT | ファイルサーバーポート |
| SBK_MAX_REASON_LENGTH | sbk 理由の最大文字数 |
| CLEAR_GLOBAL | グローバルコマンドのクリア |

## 7. データアクセス設計

- **GuildDbContext**: サーバーごとの DB コンテキスト（DB 接続、ステートメント、キャッシュ）
- **countsCache / immuneCache / ignoredCache**: サーバーごとのキャッシュ
- **runGuildMaintenance**: サーバーごとの DB メテナンス操作
- **checkpointGuildDb / vacuumGuildDb**: SQLite のチェックポイントと VACUUM
- **WAL モード**: better-sqlite3 の WAL モード使用
- **スキーママイグレーション**: カラム名の変更（user → userId）や型の変更（INTEGER → TEXT）を自動検出・マイグレーション

## 8. 主要なエクスポート関数（data/store.ts）

| 関数 | 説明 |
|------|------|
| openDb(gid) | サーバーごとの DB 接続を開く |
| getGuildDbContext(gid) | サーバーごとの DB コンテキストを取得 |
| getAllCounts(gid) | 全カウントを取得 |
| getUserCount(gid, userId) | 特定ユーザーのカウントを取得 |
| getTrackedUserCount(gid) | 追跡中のユーザー数を取得 |
| getCountRankingPage(gid, offset, limit) | ランキングページを取得 |
| getTopCountEntries(gid, limit) | 上位カウントエントリを取得 |
| getImmuneList(gid) | 免疫リストを取得 |
| getIgnoredUserList(gid) | 無視ユーザーリストを取得 |
| getGuildStatsSnapshot(gid) | サーバー統計スナップショットを取得 |
| getRecentLogs(gid, limit) | 最近のログを取得 |
| getLogCount(gid) | ログ数を取得 |
| addCountGuild(gid, userId, by, actor, reason) | カウントを増やす |
| setCountGuild(gid, userId, value) | カウントを設定 |
| resetAllCounts(gid) | 全カウントをリセット |
| addImmuneId(gid, userId) | 免疫 ID を追加 |
| removeImmuneId(gid, userId) | 免疫 ID を削除 |
| isImmune(gid, userId) | 免疫かどうかをチェック |
| addIgnoredUserId(gid, userId) | 無視ユーザーを追加 |
| removeIgnoredUserId(gid, userId) | 無視ユーザーを削除 |
| isIgnoredUser(gid, userId) | 無視ユーザーかどうかをチェック |
| getGuildDbInfo(gid) | DB 情報を取得 |
| checkpointGuildDb(gid) | DB チェックポイント |
| vacuumGuildDb(gid) | DB VACUUM |
| runGuildMaintenance(gid, task) | DB メテナンス実行 |

## 9. AI システムプロンプト
- `src/ai/systemPrompt.ts` にシステムプロンプトが定義されている
- 環境変数 `SYSTEM_PROMPT` で上書き可能
- セキュリティセクションが含まれている（編集不可）

## 10. 設定ファイル
- `src/config/runtime.ts`: 環境変数からランタイム設定をビルド
- `src/config/settings.ts`: サーバーごとの設定管理
- `src/config/commands.ts`: コマンド設定

## 11. 特記事項
- カウント値は `bigint` で管理（巨大な数値への対応）
- カウント値は SQLite で TEXT 型として保存（bigint の互換性確保）
- サーバーごとに独立した SQLite データベース（`{gid}.db`）
- キャッシュ戦略：countsCache, immuneCache, ignoredCache をサーバーごとに保持
- スキーママイグレーション：カラム名の変更や型の変更を自動検出・適用
- AI の補助モデル（auxModel）のサポート：メインモデルとは別の API キー・エンドポイントをサーバーごとに設定可能
- AI メモリ：サーバーのメッセージ履歴を要約して文脈を保持

## 12. 明日（2026-06-04）の作業メモ

以下はリファクタリングするファイル。分割・責務整理・テストしやすい単位への整理を進める。
| ステータス | ファイル数 | 合計行数 |
|---|---|---|
| 完了 | 19 | 10,968行 |
| 次 | 0 | 0行 |
| 未着手 | 0 | 0行 |
| 合計 | 19 | 10,968行 |

| 状態 | 行数 | ファイルパス |
|------|------|-------------|
| ✅完了 | **1127** | `src\music\commandHandlers.ts` |
| ✅完了 | **1009** | `src\music\search.ts` |
| ✅完了 | **783** | `src\commands\menu\managementActions.ts` |
| ✅完了 | **771** | `src\medals.ts` |
| ✅完了 | **725** | `src\commands\menu\common.ts` |
| ✅完了 | **706** | `src\ai\handlers.ts` |
| ✅完了 | **650** | `src\config\runtime.ts` |
| ✅完了 | **595** | `src\consoleCommands.ts` |
| ✅完了 | **583** | `src\ai\model-client.ts` |
| ✅完了 | **554** | `src\commands\menu\adminActions.ts` |
| ✅完了 | **490** | `src\commands\menu\voiceActions.ts` |
| ✅完了 | **473** | `src\music\ytDlpUtils.ts` |
| ✅完了 | **416** | `src\lavalink.ts` |
| ✅完了 | **404** | `src\index.ts` |
| ✅完了 | **365** | `src\ai\guild-memory.ts` |
| ✅完了 | **345** | `src\commands\menu\medals.ts` |
| ✅完了 | **338** | `src\music\spotifyUtils.ts` |
| ✅完了 | **319** | `src\discord\commandCatalog.ts` |
| ✅完了 | **315** | `src\music\state.ts` |
