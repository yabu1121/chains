# GCP コンソール（UI）だけでデプロイする手順

> CLI 版: [DEPLOY_GCP.ja.md](DEPLOY_GCP.ja.md)

`gcloud` を使わず、ブラウザの GCP コンソールだけで Cloud Run に
継続的デプロイ（`main` に push → 自動ビルド → デプロイ）を設定する手順です。
backend・frontend の両方を「リポジトリからの継続的デプロイ」で構成します。

> ポイント: 両サービスとも **Dockerfile** を同梱しているので、ビルドタイプは
> 必ず **Dockerfile** を選びます（Buildpacks の `entrypoint` / 関数ターゲット
> は使いません＝空でOK）。アプリは `$PORT` を尊重するので、コンテナポートは
> 既定の 8080 のままで動きます。

---

## 1. PostgreSQL（Cloud SQL）を作る

1. コンソール →「**SQL**」→「**インスタンスを作成**」→ **PostgreSQL**。
2. インスタンスID（例 `chains-pg`）、パスワード、リージョンを設定して作成。
3. 作成後、インスタンスの「**データベース**」→ `chains` を作成。
4. 「**ユーザー**」→ ユーザー `chains` を作成（パスワードを控える）。
5. インスタンス概要の「**接続名**」をコピー（例
   `your-project:asia-northeast1:chains-pg`）。後で使います。

## 2. JWT シークレットを作る（Secret Manager）

1. コンソール →「**Secret Manager**」→「**シークレットを作成**」。
2. 名前 `jwt-secret`、値は十分長いランダム文字列（32 byte 以上）。
   - 手元で `openssl rand -base64 48` などで生成して貼り付け。
3. 作成。

## 3. バックエンドを継続的デプロイ（Cloud Run）

1. コンソール →「**Cloud Run**」→「**サービスを作成**」→
   「**リポジトリから継続的にデプロイする**」→「**Cloud Build を設定**」。
2. **リポジトリ**: GitHub を連携（初回は Cloud Build の GitHub アプリを承認）し、
   `yabu1121/chains` を選択。
3. **ブランチ**: `^main$`。
4. **ビルドタイプ**: **Dockerfile** を選択。
   - **ビルド コンテキストのディレクトリ**: `/backend`
   - **Dockerfile の場所**: `/backend/Dockerfile`
   - entrypoint / 関数ターゲットは **空のまま**（Buildpacks 用なので不要）。
5. 「保存」。サービス設定に戻ります。
6. **認証**: 「未認証の呼び出しを許可」。
7. **コンテナ・ネットワーキング・セキュリティ** を開く:
   - 「**変数とシークレット**」タブ → **環境変数**を追加:
     | 名前 | 値 |
     | --- | --- |
     | `APP_ENV` | `production` |
     | `AUTO_MIGRATE` | `false` |
     | `REQUIRE_REDIS` | `false` |
     | `AVATAR_STORAGE` | `postgres` |
     | `DATABASE_URL` | `host=/cloudsql/<接続名> user=chains password=<上記> dbname=chains sslmode=disable` |
   - 同タブ → **シークレットを参照** → `JWT_SECRET` に `jwt-secret`（最新版）を
     マウント（「環境変数として公開」）。
   - 「**接続**」タブ → 「**Cloud SQL 接続**」に手順1のインスタンスを追加。
8. 「**作成/デプロイ**」。完了後、表示される **URL を控える**（= `BACKEND_URL`、
   例 `https://chains-backend-xxxx.run.app`）。

> 単一インスタンス想定なので「最大インスタンス数」を 1 にしておくと、Redis 無し
> （メモリキャッシュ）で安全です。スケールさせる時に Redis を足します。

## 4. マイグレーションを実行（Cloud Run ジョブ）

スキーマ適用は起動と分離しています（`AUTO_MIGRATE=false`）。同じ backend
イメージを使ってジョブで一度だけ流します。

1. コンソール →「**Cloud Run**」→「**ジョブ**」タブ →「**ジョブを作成**」。
2. **コンテナイメージ**: 手順3のビルドが Artifact Registry に作ったイメージ
   （`...-docker.pkg.dev/<project>/.../chains-backend@sha256:...` または `:latest`）を
   選択。
3. 「コンテナ」設定:
   - **コンテナの起動コマンド（ENTRYPOINT 上書き）**: `/app/migrate`
   - **変数**: `APP_ENV=production`, `AUTO_MIGRATE=false`, `DATABASE_URL=`（手順3と同じ）
   - 「**接続**」→ Cloud SQL 接続を追加。
4. 作成 →「**実行**」。成功（exit 0）を確認。

> 以降スキーマを変えた時は、このジョブを再実行してから新リビジョンを出します。

## 5. フロントエンドを継続的デプロイ（Cloud Run）

1.「**サービスを作成**」→「**リポジトリから継続的にデプロイする**」→ 同じリポジトリ。
2. **ブランチ** `^main$`、**ビルドタイプ Dockerfile**:
   - **ビルド コンテキストのディレクトリ**: `/frontend`
   - **Dockerfile の場所**: `/frontend/Dockerfile`
3. **認証**: 「未認証の呼び出しを許可」。
4. 「変数とシークレット」→ **環境変数**:
   | 名前 | 値 |
   | --- | --- |
   | `API_BASE_URL` | `BACKEND_URL`（手順3の URL） |
   | `NEXT_TELEMETRY_DISABLED` | `1` |

   > フロントは API URL を **実行時**に読むので（ビルド時の埋め込み不要）、
   > この `API_BASE_URL` を変えるだけで向き先を切り替えられます（再ビルド不要）。
5. 作成。完了後、URL を控える（= `FRONTEND_URL`）。

## 6. CORS と cookie をつなぐ

backend と frontend は別 `*.run.app`（＝別サイト）なので、cookie を cross-site で
送れるよう backend を更新します。

1. Cloud Run → `chains-backend` →「**新しいリビジョンの編集とデプロイ**」。
2. 「変数とシークレット」で環境変数を追加/更新:
   | 名前 | 値 |
   | --- | --- |
   | `CORS_ORIGINS` | `FRONTEND_URL`（手順5の URL） |
   | `COOKIE_SAMESITE` | `none` |
   | `COOKIE_SECURE` | `true` |
3. デプロイ。`FRONTEND_URL` を開いて新規登録 → ログインできれば成功です。

## 7. （任意）カスタムドメイン

Cloud Run の各サービス →「**カスタム ドメインを管理**」で
`app.example.com`（frontend）/ `api.example.com`（backend）をマッピングし、
表示される DNS レコードを登録。両者が同一ドメイン配下になったら、backend の
`COOKIE_SAMESITE` を `lax` に、`CORS_ORIGINS` を `https://app.example.com` に、
frontend の `API_BASE_URL` を `https://api.example.com` に更新します。

## 8. 継続的デプロイの確認

以降は `main` に push するたびに Cloud Build が自動でイメージをビルドし、Cloud Run
に新リビジョンをデプロイします（「Cloud Run → サービス → リビジョン」「Cloud Build
→ 履歴」で進行を確認できます）。

---

### つまずきポイント早見表
- **ビルドが失敗/おかしい** → ビルドタイプが Buildpacks になっていないか確認。
  **Dockerfile** を選び、コンテキストを `/backend`・`/frontend` に。
- **502/コンテナが起動しない** → アプリは `$PORT` で待ち受けます。コンテナポートは
  既定 8080 のままでOK（`HTTP_ADDR` は設定しないこと）。
- **ログインできない（cookie が保存されない）** → 手順6の `COOKIE_SAMESITE=none` /
  `COOKIE_SECURE=true` と `CORS_ORIGINS`（フロントの実URL）を確認。
- **DB に繋がらない** → `DATABASE_URL` の `/cloudsql/<接続名>` と、サービス/ジョブの
  「接続」タブで Cloud SQL を追加したかを確認。
