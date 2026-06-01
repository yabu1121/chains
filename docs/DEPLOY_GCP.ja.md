# GCP（Cloud Run）へのデプロイ

> English version: [DEPLOY_GCP.md](DEPLOY_GCP.md)

バックエンド・フロントエンドはどちらもコンテナ（`backend/Dockerfile`,
`frontend/Dockerfile`）として **Cloud Run** で動かし、**Cloud SQL**
(PostgreSQL) をバックエンドDBにします。本手順は「最小構成でまず動かす」→
「カスタムドメイン・Redis・オブジェクトストレージを後付け」という流れです。

> 以下のコマンドは**ご自身の端末**で実行してください（`gcloud` 認証と課金が
> 必要なため）。この Claude Code セッション内では、コマンドの先頭に `!` を付け
> ると実行でき、出力がここに返ります。

## 0. 前提

```sh
gcloud auth login
export PROJECT=your-project-id
export REGION=asia-northeast1            # 任意のリージョン
gcloud config set project "$PROJECT"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

イメージ置き場（Artifact Registry）を作成：

```sh
gcloud artifacts repositories create chains \
  --repository-format=docker --location="$REGION"
export IMG="$REGION-docker.pkg.dev/$PROJECT/chains"
```

## 1. PostgreSQL（Cloud SQL）

```sh
gcloud sql instances create chains-pg \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION"
gcloud sql databases create chains --instance=chains-pg
gcloud sql users create chains --instance=chains-pg --password='CHANGE_ME'

# インスタンス接続名（例: your-project:asia-northeast1:chains-pg）
export SQL_CONN=$(gcloud sql instances describe chains-pg --format='value(connectionName)')
```

Cloud Run からは `/cloudsql/<SQL_CONN>` の unix ソケット経由で接続するため、
DSN はキーワード形式にします：

```sh
export DATABASE_URL="host=/cloudsql/$SQL_CONN user=chains password=CHANGE_ME dbname=chains sslmode=disable"
```

## 2. JWT シークレット（Secret Manager）

```sh
openssl rand -base64 48 | gcloud secrets create jwt-secret --data-file=-
```

## 3. イメージのビルド & プッシュ

バックエンド：

```sh
gcloud builds submit backend --tag "$IMG/backend:latest"
```

フロントエンドは **API URL をビルド時に埋め込む**ため、バックエンドを作って
URL が確定してから（手順4・5の後で）ビルドします：

```sh
# BACKEND_URL が分かってから実行（手順5参照）
gcloud builds submit frontend \
  --substitutions=_API="$BACKEND_URL" \
  --config=- <<'YAML'
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build','--build-arg','NEXT_PUBLIC_API_BASE_URL=${_API}','-t','${_IMG}/frontend:latest','frontend']
    env: ['_IMG=${_IMG}']
images: ['${_IMG}/frontend:latest']
YAML
```

（ローカルでビルドするなら
`docker build --build-arg NEXT_PUBLIC_API_BASE_URL=$BACKEND_URL -t $IMG/frontend:latest frontend && docker push $IMG/frontend:latest` でも可。）

## 4. マイグレーション（Cloud Run ジョブ）

マイグレーションは起動から分離済み（`AUTO_MIGRATE=false`）。同じバックエンド
イメージを `/app/migrate` エントリポイントで実行します：

```sh
gcloud run jobs create chains-migrate \
  --image "$IMG/backend:latest" \
  --region "$REGION" \
  --set-cloudsql-instances "$SQL_CONN" \
  --set-env-vars "APP_ENV=production,AUTO_MIGRATE=false,DATABASE_URL=$DATABASE_URL" \
  --command /app/migrate
gcloud run jobs execute chains-migrate --region "$REGION" --wait
```

## 5. バックエンドのデプロイ

```sh
gcloud run deploy chains-backend \
  --image "$IMG/backend:latest" \
  --region "$REGION" --allow-unauthenticated \
  --add-cloudsql-instances "$SQL_CONN" \
  --max-instances 1 \
  --set-env-vars "APP_ENV=production,AUTO_MIGRATE=false,REQUIRE_REDIS=false,AVATAR_STORAGE=postgres,DATABASE_URL=$DATABASE_URL" \
  --set-secrets "JWT_SECRET=jwt-secret:latest"

export BACKEND_URL=$(gcloud run services describe chains-backend --region "$REGION" --format='value(status.url)')
```

`--max-instances 1` ＋ `REQUIRE_REDIS=false` で、単一インスタンスがメモリ
キャッシュを使う最小構成になります（Redis 不要）。スケールアウトする際は
Redis を足してこの上限を上げます（後述）。

## 6. フロントエンドのビルド & デプロイ

手順3で `BACKEND_URL` を渡してビルドしたら：

```sh
gcloud run deploy chains-frontend \
  --image "$IMG/frontend:latest" \
  --region "$REGION" --allow-unauthenticated --max-instances 1
export FRONTEND_URL=$(gcloud run services describe chains-frontend --region "$REGION" --format='value(status.url)')
```

## 7. CORS と cookie の結線

フロントとバックエンドは**別々の `*.run.app` ホスト**＝**別サイト**扱いです。
cookie を cross-site で送れるようにし、CORS にフロントのオリジンを許可します：

```sh
gcloud run services update chains-backend --region "$REGION" \
  --update-env-vars "CORS_ORIGINS=$FRONTEND_URL,COOKIE_SAMESITE=none,COOKIE_SECURE=true"
```

`COOKIE_SAMESITE=none` が必要なのは、Lax cookie は別の登録可能ドメインへは
送られないためです（Cloud Run は HTTPS なので Secure 要件は満たします）。
`$FRONTEND_URL` を開いてログインできれば成功です。

## カスタムドメイン（推奨）

両サービスを**同一の登録可能ドメイン配下**にマッピングすると、より強い
`SameSite=Lax` が使えます：

```sh
gcloud run domain-mappings create --service chains-frontend --domain app.example.com --region "$REGION"
gcloud run domain-mappings create --service chains-backend  --domain api.example.com --region "$REGION"
# gcloud が表示する DNS レコードを登録する
```

その後、フロントを `NEXT_PUBLIC_API_BASE_URL=https://api.example.com` で再ビルド
し、バックエンドを更新：

```sh
gcloud run services update chains-backend --region "$REGION" \
  --update-env-vars "CORS_ORIGINS=https://app.example.com,COOKIE_SAMESITE=lax"
```

（前段に Cloudflare を置く場合：ドメインのネームサーバを Cloudflare に向け、
`app`/`api` を Cloud Run のドメインマッピング先に CNAME する。）

## Redis を足す（単一インスタンスを超えてスケールする場合）

`REQUIRE_REDIS=true` には到達可能な Redis が必要です。GCP ネイティブで最も
簡単なのは **Memorystore** ＋ サーバーレス VPC コネクタ（現在の Redis
クライアントは TLS/認証なしのプレーン Redis 前提）：

```sh
gcloud redis instances create chains-redis --size=1 --region="$REGION"
gcloud compute networks vpc-access connectors create chains-vpc --region="$REGION" --range=10.8.0.0/28
# その後 backend を --vpc-connector chains-vpc 付きで再デプロイし、
#   --update-env-vars REQUIRE_REDIS=true,REDIS_ADDR=<memorystoreのホスト>:6379  --max-instances=N
```

（Upstash のような TLS＋パスワード認証の Redis を使う場合は、Redis クライアント
側にパスワード/TLS 対応の拡張が必要で、現状は未対応です。）

## アバターをオブジェクトストレージへ（任意）

アバターは既定で `AVATAR_STORAGE=postgres`（Cloud SQL に保存）でそのまま動き
ます。GCS/CDN へ移す場合は `internal/platform/blobstore.Store` の GCS 実装を
追加し `AVATAR_STORAGE=gcs` を設定するだけです（アバターサービスはインター
フェイスにのみ依存）。
