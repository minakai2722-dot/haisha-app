# イベント管理ツール

サークル・チームのイベント運営を支援するWebアプリ。配車・会計・カレンダー・割り勘の4機能を1つにまとめたオールインワンツール。

👉 **アプリURL**: https://haisha-app.vercel.app

---

## 機能

### 🚗 配車（公開中）
- メンバーの名前・最寄り駅・役割（ドライバー/乗客）・定員・人間関係を入力
- NAVITIME API（RapidAPI経由）を使った電車乗車時間の取得
- Google Maps Geocoding API で駅名→座標変換
- Fixstars Amplify を使った最適配車計算（人間関係スコアを考慮）
- CSVインポートによる一括入力
- Googleフォーム・スプレッドシート連携

### 💴 会計（公開中）
- 収入・支出の記録・管理
- カレンダーのイベントごとに紐付けた収支管理
- Adminパスワード（`Admin`）で保護

### 📅 カレンダー（実装済み・非表示）
- 月カレンダーで活動スケジュールを管理
- Googleカレンダーへの自動追加（Googleログイン時）
- イベントごとに会計・割り勘パネルを表示

### 💸 割り勘（実装済み・非表示）
- イベント名・日付・時間帯を指定してセッション作成（カレンダーに自動反映）
- メンバーの追加・管理
- 3ステップで支払い追加（支払人 → 対象者 → 金額）
- 最適な精算方法を自動計算（端数処理：切り上げ/四捨五入/切り捨て）

---

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | Next.js 16 / React 19 / TypeScript |
| スタイリング | Tailwind CSS v4 |
| 認証 | NextAuth.js（Google OAuth） |
| バックエンド | FastAPI（Python） |
| 経路計算 | NAVITIME API（RapidAPI経由） |
| 座標変換 | Google Maps Geocoding API |
| 最適化エンジン | Fixstars Amplify |
| デプロイ | Vercel（フロント） / Render（バックエンド） |
| データ保存 | localStorage |

---

## セットアップ

### バックエンド（FastAPI / Render）

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

`.env` に以下を設定：

```
GOOGLE_MAPS_API_KEY=your_key   # ジオコーディング（座標変換）用
NAVITIME_API_KEY=your_key      # RapidAPI の X-RapidAPI-Key
FIXSTARS_API_KEY=your_key
```

### フロントエンド（Next.js）

```bash
cd frontend
npm install
npm run dev
```

`.env.local` に以下を設定：

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

---

## スマホでアプリとして使う

### iPhone（Safari）
1. Safari で https://haisha-app.vercel.app を開く
2. 下部の共有ボタン（四角に矢印）をタップ
3. 「ホーム画面に追加」をタップ

### Android（Chrome）
1. Chrome で https://haisha-app.vercel.app を開く
2. 右上の「⋮」→「ホーム画面に追加」をタップ
