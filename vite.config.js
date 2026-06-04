# ScoreAI - 野球スコアシート解析アプリ

手書きの野球スコアシートをAIが自動読み取りして成績を集計するWebアプリです。

## Vercelへのデプロイ手順

### 1. GitHubにリポジトリを作成してこのフォルダをアップロード

### 2. Vercelでインポート
1. [vercel.com](https://vercel.com) にログイン
2. 「Add New Project」→ GitHubリポジトリを選択
3. **Framework Preset**: Vite を選択
4. 「Deploy」をクリック

### 3. 環境変数を設定（重要）
デプロイ完了後、Settings → Environment Variables に追加：
```
ANTHROPIC_API_KEY = sk-ant-xxxxxxxx
```
追加後、Deployments → 最新のデプロイ → 「Redeploy」を実行

## ローカル開発
```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-xxx" > .env.local
npm run dev
```
