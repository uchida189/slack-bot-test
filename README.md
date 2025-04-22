# 環境構築
### 1. リポジトリをクローン
### 2. ディレクトリに移動
### 3. 環境変数を設定
ルートディレクトリに.envファイルを作成し、以下の環境変数を設定します。
```env
SLACK_BOT_TOKEN=xoxb-
SLACK_SIGNING_SECRET=your-slack-signing-secret
SLACK_APP_TOKEN=xapp-1-
PORT=
```
---
### 初回または設定変更時にビルド
`make build`

### ボットを起動
`make up`

### ログを確認
`make logs`

### ボットを停止
`make down`