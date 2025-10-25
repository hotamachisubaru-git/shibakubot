# 🪓 しばくbot (ShibakuBot)

Discordサーバーでユーザーを「しばく」ことができるネタ系Botです。  
メンバーのしばかれ回数をカウント・ランキング化し、  
管理者向けの免除機能や回数調整機能も備えています。

---

## 🚀 機能一覧

| コマンド | 説明 |
|-----------|------|
| `/ping` | Bot応答速度を測定します。 |
| `/sbk <user> <reason> [count]` | 指定ユーザーを「しばく」。`count` は省略時1。上限10回。 |
| `/check <user>` | 指定ユーザーのしばかれ回数を確認します。 |
| `/top` | サーバー全体のしばかれランキングを表示します。 |
| `/members` | 全メンバー（BOT除外）のしばかれ回数を一覧表示します。CSVファイル付き。 |
| `/control <user> <count>` | **管理者・開発者のみ** 使用可。指定ユーザーの回数を任意の数に変更します。 |
| `/immune add/remove/list` | **管理者・開発者のみ** 使用可。しばき免除リストを操作します。 |


---

## ⚙️ 導入方法

### ① Node.js の準備
- 推奨バージョン: **Node.js 20 以上**
- インストール:  
[https://nodejs.org/](https://nodejs.org/)

### ② 必要パッケージをインストール
```
npm install
```

正常に起動すると以下のログが表示されます。

✅ ログイン完了: しばくbot#9680

🛠 ビルド（配布用）

TypeScriptをJavaScriptに変換します。

npm run build


出力: dist/ フォルダ

🔐 権限仕様
操作	権限
/ping, /check, /sbk, /top, /members	全員
/control, /immune	サーバー管理者 または .env の OWNER_IDS
🚫 しばけない対象

以下のユーザーは常にしばけません：

BOT（しばくbot含む）

.env に記載された IMMUNE_IDS

/immune リスト登録ユーザー

📁 データ保存場所

データはローカルファイル data.json に保存されます。

サーバーごとではなく全体共通データです。

🪄 作者

hotamachisubaru (蛍の光)
GitHub: @hotamachisubaru-git

