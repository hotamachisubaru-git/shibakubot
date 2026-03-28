# VPSデプロイ手順

このBotを Linux VPS 上で常駐させるための最小構成です。  
前提は Ubuntu / Debian 系、`systemd`、同一VPS上に Bot と Lavalink を置く構成です。

## 推奨構成
- OS: Ubuntu 24.04 LTS など
- Node.js: `20+`
- Java: `17+` または `21`
- 常駐: `systemd`
- 公開URL: `nginx` 経由の HTTPS を推奨

## ディレクトリ例
- Bot: `/opt/shibakubot`
- Lavalink: `/opt/lavalink`

## 1. 依存インストール
```bash
sudo apt update
sudo apt install -y curl git build-essential nginx openjdk-21-jre-headless
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. ユーザー作成
```bash
sudo useradd --system --create-home --home /opt/shibakubot --shell /usr/sbin/nologin shibakubot
sudo useradd --system --create-home --home /opt/lavalink --shell /usr/sbin/nologin lavalink
```

## 3. Bot 配置
```bash
sudo -u shibakubot git clone <repo-url> /opt/shibakubot
cd /opt/shibakubot
sudo -u shibakubot npm ci
sudo -u shibakubot npm run build
```

## 4. `.env` 配置
`.env.example` をベースに `/opt/shibakubot/.env` を作成します。  
VPSでは次の値を先に決めると詰まりにくいです。

```env
TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_IDS=111111111111111111
OWNER_IDS=111111111111111111

FILE_DIR=./files
FILE_HOST=127.0.0.1
FILE_PORT=3001
UPLOAD_INTERNAL_URL=http://127.0.0.1:3001/uploads
UPLOAD_BASE_URL=https://bot.example.com/uploads

LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=change-me
LAVALINK_USERNAME=shibakubot
LAVALINK_TRACE_ENABLED=false
```

補足:
- `FILE_HOST=127.0.0.1` にして、外部公開は `nginx` から `/uploads/` を中継するのを推奨
- `UPLOAD_BASE_URL` は Discord 上で見える公開URL
- `UPLOAD_INTERNAL_URL` は Lavalink から到達できる内部URL
- AI を同一VPSで動かすなら `MODEL_ENDPOINT` や `IMAGE_ENDPOINT` も `127.0.0.1` に寄せる

## 5. スラッシュコマンド登録
初回デプロイ時、またはコマンド変更時に実行します。

```bash
cd /opt/shibakubot
sudo -u shibakubot npm run register:prod
```

## 6. Lavalink 配置
`/opt/lavalink` に Lavalink v4 系の `Lavalink.jar` を置き、  
[`../deploy/lavalink/application.yml.example`](../deploy/lavalink/application.yml.example) をベースに
`/opt/lavalink/application.yml` を作成します。

このBotは `ytmsearch:` / `ytsearch:` を使うため、`youtube-source` プラグインを前提にした設定例を同梱しています。  
`VERSION` は `youtube-source` の現行リリース番号に置き換えてください。

## 7. nginx 設定
公開URLを HTTPS 化するなら  
[`../deploy/nginx/shibakubot-uploads.conf.example`](../deploy/nginx/shibakubot-uploads.conf.example) をベースに設定します。

最低限必要なのは `/uploads/` を `127.0.0.1:3001` へプロキシすることです。  
TLS 終端は `certbot` や既存のリバースプロキシ構成に合わせてください。

## 8. systemd 登録
テンプレート:
- [`../deploy/systemd/shibakubot.service.example`](../deploy/systemd/shibakubot.service.example)
- [`../deploy/systemd/lavalink.service.example`](../deploy/systemd/lavalink.service.example)

配置と起動:

```bash
sudo cp /opt/shibakubot/deploy/systemd/lavalink.service.example /etc/systemd/system/lavalink.service
sudo cp /opt/shibakubot/deploy/systemd/shibakubot.service.example /etc/systemd/system/shibakubot.service
sudo systemctl daemon-reload
sudo systemctl enable --now lavalink
sudo systemctl enable --now shibakubot
```

## 9. 動作確認
```bash
systemctl status lavalink --no-pager
systemctl status shibakubot --no-pager
journalctl -u lavalink -n 100 --no-pager
journalctl -u shibakubot -n 100 --no-pager
```

確認ポイント:
- Bot 起動時に `ログイン完了` が出る
- Lavalink 側で `/version` 応答が返る
- `s!play` や `s!upload` を使う場合、`UPLOAD_BASE_URL` が外から開ける

## 10. 更新手順
```bash
cd /opt/shibakubot
sudo -u shibakubot git pull
sudo -u shibakubot npm ci
sudo -u shibakubot npm run build
sudo systemctl restart shibakubot
```

Lavalink 設定や JAR を更新した場合は:

```bash
sudo systemctl restart lavalink
```

## バックアップ対象
- `/opt/shibakubot/.env`
- `/opt/shibakubot/data`
- `/opt/shibakubot/backup`
- `/opt/shibakubot/files`

## 注意点
- 現状の起動フローでは、Bot は起動時に Lavalink 到達待ちを行います
- 音楽機能を使うなら、VPS上でも Lavalink を常駐させる前提で組むのが安全です
- `3001` を直接外へ開けるより、`nginx` で `443` に集約した方が扱いやすいです
