# Deploying to GCP (Cloud Run)

Both services ship as containers (`backend/Dockerfile`, `frontend/Dockerfile`)
and run on **Cloud Run**, backed by **Cloud SQL** (PostgreSQL). This guide gets
you to a working deployment with the fewest moving parts, then shows how to add
a custom domain, Redis and object storage.

> You run these commands yourself (they need your `gcloud` auth and billing).
> In this Claude Code session you can prefix a command with `!` to run it here.

## 0. Prerequisites

```sh
gcloud auth login
export PROJECT=your-project-id
export REGION=asia-northeast1            # pick your region
gcloud config set project "$PROJECT"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

Create an Artifact Registry repo for the images:

```sh
gcloud artifacts repositories create chains \
  --repository-format=docker --location="$REGION"
export IMG="$REGION-docker.pkg.dev/$PROJECT/chains"
```

## 1. PostgreSQL (Cloud SQL)

```sh
gcloud sql instances create chains-pg \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION"
gcloud sql databases create chains --instance=chains-pg
gcloud sql users create chains --instance=chains-pg --password='CHANGE_ME'

# Full instance connection name, e.g. your-project:asia-northeast1:chains-pg
export SQL_CONN=$(gcloud sql instances describe chains-pg --format='value(connectionName)')
```

Cloud Run reaches Cloud SQL over a unix socket at `/cloudsql/<SQL_CONN>`, so the
DSN uses keyword form:

```sh
export DATABASE_URL="host=/cloudsql/$SQL_CONN user=chains password=CHANGE_ME dbname=chains sslmode=disable"
```

## 2. JWT secret (Secret Manager)

```sh
openssl rand -base64 48 | gcloud secrets create jwt-secret --data-file=-
```

## 3. Build & push images

Backend:

```sh
gcloud builds submit backend --tag "$IMG/backend:latest"
```

Frontend — the API URL is **baked at build time**, so build it *after* the
backend exists (step 4) and pass its URL:

```sh
# (run this after BACKEND_URL is known — see step 5)
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

(Or simply `docker build --build-arg NEXT_PUBLIC_API_BASE_URL=$BACKEND_URL -t $IMG/frontend:latest frontend && docker push $IMG/frontend:latest` if building locally.)

## 4. Run migrations (Cloud Run Job)

Migrations are decoupled from start-up (`AUTO_MIGRATE=false`). Run the same
backend image with the `/app/migrate` entrypoint:

```sh
gcloud run jobs create chains-migrate \
  --image "$IMG/backend:latest" \
  --region "$REGION" \
  --set-cloudsql-instances "$SQL_CONN" \
  --set-env-vars "APP_ENV=production,AUTO_MIGRATE=false,DATABASE_URL=$DATABASE_URL" \
  --command /app/migrate
gcloud run jobs execute chains-migrate --region "$REGION" --wait
```

## 5. Deploy the backend

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

`--max-instances 1` + `REQUIRE_REDIS=false` lets a single instance use the
in-memory cache (no Redis yet). To scale out, add Redis (see below) and raise
the cap.

## 6. Build & deploy the frontend

Build the frontend image with `BACKEND_URL` (step 3), then:

```sh
gcloud run deploy chains-frontend \
  --image "$IMG/frontend:latest" \
  --region "$REGION" --allow-unauthenticated --max-instances 1
export FRONTEND_URL=$(gcloud run services describe chains-frontend --region "$REGION" --format='value(status.url)')
```

## 7. Wire up CORS + cookies

The frontend and backend are on **different `*.run.app` hosts**, which are
*cross-site*. Update the backend so cookies work cross-site and CORS allows the
frontend origin:

```sh
gcloud run services update chains-backend --region "$REGION" \
  --update-env-vars "CORS_ORIGINS=$FRONTEND_URL,COOKIE_SAMESITE=none,COOKIE_SECURE=true"
```

`COOKIE_SAMESITE=none` is required because Lax cookies are not sent across
different registrable domains; Cloud Run is HTTPS so Secure is satisfied. Visit
`$FRONTEND_URL` and log in.

## Custom domain (recommended)

Map both services under one registrable domain so you can use the stronger
`SameSite=Lax`:

```sh
gcloud run domain-mappings create --service chains-frontend --domain app.example.com   --region "$REGION"
gcloud run domain-mappings create --service chains-backend  --domain api.example.com   --region "$REGION"
# add the DNS records gcloud prints
```

Then rebuild the frontend with `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
and update the backend:

```sh
gcloud run services update chains-backend --region "$REGION" \
  --update-env-vars "CORS_ORIGINS=https://app.example.com,COOKIE_SAMESITE=lax"
```

(Cloudflare can sit in front for DNS/CDN/WAF: point the domain's nameservers at
Cloudflare and CNAME `app`/`api` to the Cloud Run domain mappings.)

## Adding Redis (to scale beyond one instance)

`REQUIRE_REDIS=true` needs a reachable Redis. The simplest GCP-native option is
**Memorystore** + a Serverless VPC connector (the current Redis client speaks
plain Redis, no TLS/auth):

```sh
gcloud redis instances create chains-redis --size=1 --region="$REGION"
gcloud compute networks vpc-access connectors create chains-vpc --region="$REGION" --range=10.8.0.0/28
# then redeploy backend with --vpc-connector chains-vpc and:
#   --update-env-vars REQUIRE_REDIS=true,REDIS_ADDR=<memorystore-host>:6379  --max-instances=N
```

(A TLS/password-authenticated provider like Upstash would need the Redis client
extended to pass a password and enable TLS — not yet supported.)

## Avatars on object storage (optional)

Avatars default to `AVATAR_STORAGE=postgres` (stored in Cloud SQL), which works
as-is. To move them to GCS/CDN, add a GCS implementation of
`internal/platform/blobstore.Store` and set `AVATAR_STORAGE=gcs` — the avatar
service depends only on the interface.
