# 継続的デリバリ（GitHub Actions → Cloud Run）

`main` への push で、両イメージのビルド → DB マイグレーション → バックエンド／
フロントエンドの Cloud Run デプロイを自動実行します（`.github/workflows/deploy.yml`）。
認証は鍵を使わない **Workload Identity Federation（WIF）** です。

> 前提: 初回は手動デプロイ（[DEPLOY_GCP.ja.md](DEPLOY_GCP.ja.md)）で Cloud Run の
> 2サービス（`chains-backend` / `chains-frontend`）と マイグレーションジョブ
> （`chains-migrate`）、Artifact Registry、Cloud SQL を作成しておきます。CD は
> それらの**イメージ更新**（とフロントの `API_ORIGIN`）だけを行います。

## 1. 変数（環境に合わせて）

```sh
export PROJECT_ID=<your-project-id>
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
export REGION=asia-northeast1
export REPO=<github-owner>/<repo>        # 例: yabu1121/chains
export SA=chains-deployer                # デプロイ用サービスアカウント名
```

## 2. デプロイ用サービスアカウント + 権限

```sh
gcloud iam service-accounts create "$SA" --project "$PROJECT_ID" \
  --display-name "GitHub Actions deployer"
export SA_EMAIL="$SA@$PROJECT_ID.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/cloudbuild.builds.editor \
            roles/artifactregistry.writer roles/iam.serviceAccountUser \
            roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$SA_EMAIL" --role "$ROLE"
done
```

（`run.admin` でサービス/ジョブのデプロイ・実行、`cloudbuild.builds.editor` +
`storage.admin` で `gcloud builds submit`、`artifactregistry.writer` で push、
`serviceAccountUser` で Cloud Run のランタイム SA を使うため。）

## 3. Workload Identity Federation（鍵レス連携）

```sh
gcloud iam workload-identity-pools create github \
  --project "$PROJECT_ID" --location global --display-name "GitHub"

gcloud iam workload-identity-pools providers create-oidc github \
  --project "$PROJECT_ID" --location global \
  --workload-identity-pool github --display-name "GitHub OIDC" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='$REPO'"

# このリポジトリからの push だけがデプロイ SA を借用できるよう紐付け
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# ワークフローに渡すプロバイダのフルネーム
echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

## 4. GitHub 側の設定

リポジトリ → Settings → Secrets and variables → Actions。

**Variables**
| 名前 | 値の例 |
|---|---|
| `GCP_PROJECT_ID` | `<your-project-id>` |
| `GCP_REGION` | `asia-northeast1` |
| `GCP_AR_REPO` | `asia-northeast1-docker.pkg.dev/<project>/chains` |
| `API_ORIGIN` | `https://chains-180234550522.asia-northeast1.run.app` |

**Secrets**
| 名前 | 値 |
|---|---|
| `GCP_WIF_PROVIDER` | 手順3末尾で出力された `projects/.../providers/github` |
| `GCP_DEPLOY_SA` | `chains-deployer@<project>.iam.gserviceaccount.com` |

## 5. 動かす

`main` に push（または PR をマージ）すると自動デプロイ。Actions タブの
**Deploy** ワークフローで進行を確認できます。手動実行は **Run workflow**
（`workflow_dispatch`）から。

> メモ: フロントは `NEXT_PUBLIC_API_BASE_URL` 無しでビルドされ、実行時に
> `API_ORIGIN` 経由で `/api/*` をバックエンドへプロキシします（クッキーを
> ファーストパーティにするため。詳細は `frontend/next.config.mjs`）。
