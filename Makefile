# Slack Auto Reaction Bot用のMakefile

.PHONY: build up down logs restart clean help

# デフォルトのターゲット
.DEFAULT_GOAL := help

# 環境変数ファイルの読み込み
-include .env

# コンテナをビルド
build:
	@echo "🔨 コンテナをビルドしています..."
	docker-compose build

# コンテナを起動
up:
	@echo "🚀 コンテナを起動しています..."
	docker-compose up -d
	@echo "✅ サーバーが起動しました！"
	@echo "📊 ログを確認するには 'make logs' を実行してください"

# コンテナを停止
down:
	@echo "🛑 コンテナを停止しています..."
	docker-compose down

# コンテナのログを表示
logs:
	@echo "📋 ログを表示しています..."
	docker-compose logs -f

# コンテナを再起動
restart: down up

# コンテナとイメージをクリーンアップ
clean:
	@echo "🧹 クリーンアップしています..."
	docker-compose down -v
	docker system prune -f

# ヘルプを表示
help:
	@echo "🤖 Slack Auto Reaction Bot"
	@echo ""
	@echo "使用可能なコマンド:"
	@echo "  make build    - Dockerイメージをビルドします"
	@echo "  make up       - コンテナを起動します"
	@echo "  make down     - コンテナを停止します"
	@echo "  make logs     - コンテナのログを表示します"
	@echo "  make restart  - コンテナを再起動します"
	@echo "  make clean    - コンテナとイメージをクリーンアップします"
	@echo ""