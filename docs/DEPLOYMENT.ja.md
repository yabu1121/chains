# デプロイ

> English version: [DEPLOYMENT.md](DEPLOYMENT.md) ・ GCP 手順: [DEPLOY_GCP.ja.md](DEPLOY_GCP.ja.md)

Chains の本番デプロイに関するメモ。全環境変数は `backend/.env.example` と
`frontend/.env.local.example` を参照してください。

## 本番で必要な環境変数

### バックエンド（`cmd/api`）

| 変数 | 必須 | 補足 |
| --- | --- | --- |
| `APP_ENV` | はい | `production` を設定。未設定でも production 扱い（fail-closed）。 |
| `JWT_SECRET` | はい | 32 byte 以上。`openssl rand -base64 48`。未設定/短すぎると起動失敗。 |
| `DATABASE_URL` | はい | 本番は `sslmode=require`（または `verify-full`）。 |
| `CORS_ORIGINS` | はい | 許可するサイトのオリジンをカンマ区切りで。本番で `*` は不可。 |
| `COOKIE_SAMESITE` | いいえ | 既定 `lax`（サイトとAPIが同一ドメイン時）。別サイトは `none`（Secure 強制）。 |
| `REDIS_ADDR` | ※ | 既定で必須（`REQUIRE_REDIS=true`）。単一インスタンスなら `REQUIRE_REDIS=false`。 |
| `JWT_TTL` / `REFRESH_TTL` | いいえ | アクセス/リフレッシュトークンの寿命。既定 `15m` / `720h`。 |
| `AVATAR_STORAGE` | いいえ | `postgres`（既定）または `fs`。blobstore 参照。 |
| `AUTO_MIGRATE` | いいえ | 本番は既定 `false`。マイグレーションは別ステップで実行（下記）。 |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | いいえ | 両方設定でプロセス内 TLS。未設定なら上流で TLS 終端。 |

コネクションプール（`DB_MAX_OPEN_CONNS` など）と `CACHE_TTL` には安全な既定値が
あります。

### フロントエンド（Next.js）

| 変数 | 必須 | 補足 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | はい | 公開 API のオリジン（https）。**ビルド時にバンドルへ埋め込まれる**。 |

## ビルド

コンテナイメージ（`backend/Dockerfile`, `frontend/Dockerfile`）：

```sh
docker build -t chains-backend ./backend
docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t chains-frontend ./frontend
```

## マイグレーション

マイグレーションは API 起動から分離されています。新しい API インスタンスを
ロールアウトする前に、独立したステップとして実行してください：

```sh
# ローカル
make backend-migrate
# コンテナ（API と同じイメージ）
docker run --rm --env-file backend/.env --entrypoint /app/migrate chains-backend
```

## TLS

ロードバランサ/リバースプロキシで TLS 終端するのが推奨です。あるいは
`TLS_CERT_FILE` と `TLS_KEY_FILE` を設定してプロセス内で終端します。
`APP_ENV=production` ではレスポンスに HSTS も付与されます。
