⚙️ ShibakuBot 導入ガイド（完全版）
🧩 ① Discord Bot を作成する

Discord Developer Portal
 にアクセス

「New Application」をクリック

名前を入力（例：しばくbot）→「Create」

▶ Botを有効化

左メニューから「Bot」を選択

「Add Bot」をクリック

確認ダイアログで「Yes, do it!」を選択

名前とアイコンを設定（任意）

下部の “Token” セクションで「Reset Token」を押して
表示されたトークンをコピーしておく（※後で .env に記載）

▶ インテント設定（超重要）

「Privileged Gateway Intents」までスクロールし、
以下の3つをすべてONにしてください：

✅ PRESENCE INTENT

✅ SERVER MEMBERS INTENT（/members で必要）

✅ MESSAGE CONTENT INTENT

保存を押します。

▶ Botをサーバーに招待

左メニューから「OAuth2 → URL Generator」を開く

「bot」と「applications.commands」にチェック

「Bot Permissions」から以下を選択：

Send Messages

Embed Links

Attach Files

Use Slash Commands

Read Message History

Manage Messages（必要なら）

一番下の「Generated URL」をコピーしてブラウザで開き、
招待したいサーバーを選択して「承認」。

💻 ② Node.js と開発環境を準備
Node.js のインストール

推奨バージョン: 20 以上

https://nodejs.org/
 からインストール

インストール後、ターミナルで確認：

node -v
npm -v

📦 ③ Botプロジェクトを作成
mkdir shibakubot
cd shibakubot
npm init -y

TypeScript 環境をセットアップ
npm install discord.js dotenv ts-node typescript
npm install --save-dev @types/node


TypeScript 設定ファイルを生成：

npx tsc --init

🧾 ④ .env を設定

ルートディレクトリに .env ファイルを作成：

TOKEN=ここにDiscordBotトークンを貼り付け
CLIENT_ID=Discord Developer PortalのApplication ID
GUILD_ID=テストサーバーのID
LOG_CHANNEL_ID=ログを送信したいチャンネルID（任意）
OWNER_IDS=878891232309424158,872343576468656208
IMMUNE_IDS=642953927243071519

各項目の説明
項目	説明
TOKEN	Discord Bot の認証トークン
CLIENT_ID	アプリケーションのID（General Informationに表示）
GUILD_ID	コマンド登録するサーバーのID
LOG_CHANNEL_ID	しばきログを送信するチャンネルID（任意）
OWNER_IDS	管理者・開発者のDiscord ID（複数可）
IMMUNE_IDS	永久しばき免除ユーザーID（任意）
📜 ⑤ コマンドを登録

スラッシュコマンドをDiscordに登録します。

npm run register


成功すると：

⏫ コマンド登録中...
✅ 登録完了


と表示されます。

▶ ⑥ Botを起動

開発モードで起動：

npm run dev


成功すると：

✅ ログイン完了: しばくbot#9680


と表示され、Botがオンラインになります。

🧱 ⑦ ビルド（配布・本番用）

TypeScriptをJavaScriptに変換：

npm run build


生成されたファイルは dist/ フォルダに出力されます。

本番起動コマンド：

node dist/index.js

🧠 コマンド一覧
コマンド	内容
/ping	応答速度を測定
/sbk <user> <reason> [count]	ユーザーをしばく（1〜10回）
/check <user>	しばかれ回数を表示
/top	ランキング表示
/members	全メンバーのしばかれ回数一覧＋CSV
/control <user> <count>	管理者専用：回数を手動設定
/immune add/remove/list	管理者専用：免除リストを編集
🚫 しばけない対象

BOT（自分自身を含む）

.env の IMMUNE_IDS

/immune add で登録されたユーザー

🧾 データ保存

データは data.json に自動保存されます。
（サーバーごとではなくグローバル共通）

💡 トラブルシューティング
現象	対応
Used disallowed intents	Bot設定で「Server Members Intent」をONにする
Unknown interaction	コマンド登録後にBotを再起動
コマンドが出ない	/register を再実行して更新
反応が遅い	サーバーリージョンを近い地域（Japan等）に変更
✅ セットアップまとめ
手順	コマンド	内容
1	npm install	パッケージをインストール
2	.env 設定	Botトークンなどを設定
3	npm run register	コマンドを登録
4	npm run dev	Botを起動
5	npm run build	配布用ビルド
🧾 作者

hotamachisubaru (蛍の光)
GitHub: @hotamachisubaru-git

🪪 ライセンス

このプロジェクトは MIT License で公開されています。
