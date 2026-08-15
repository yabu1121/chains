# GitHub / Google OAuth ログイン — 実装メモ

> 学習用メモ。「どこに・何を・なぜ」を残してあります。コードと一緒に読んでください。
> ブランチは作っていません（`main` の作業ツリーに未コミットで置いてあります）。差分を読んでから自分でコミットしてください。

## 全体フロー（サーバーサイド・リダイレクト型）

httpOnly Cookie 認証なので、ブラウザにトークンを渡しません。バックエンドが Cookie を立てて、フロントへ 302 で戻します。

```
ブラウザ                         chains backend                  GitHub/Google
  |  GET /api/auth/oauth/github/start  |                              |
  |----------------------------------->|  state生成→cacheに保存        |
  |        302 → 同意画面               |----------------------------->|
  |<-----------------------------------|                              |
  |                                    |        ユーザーが許可          |
  |  GET .../github/callback?code&state (provider が302で戻す)        |
  |----------------------------------->|  state検証→code交換→profile取得 |
  |                                    |  find-or-create→Cookie発行     |
  |     302 → FRONTEND_URL/friends     |                              |
  |<-----------------------------------|                              |
  | (AuthProvider が /api/me で復帰)    |                              |
```

`state` が CSRF 対策です。こちらが発行して cache に保存した値しか受理しないので、攻撃者が callback を偽造できません。

## アカウントの扱い（`loginWithOAuth`, oauth.go）

provider のプロフィールを受け取って、次の優先順で session にします。

1. **既にリンク済み**（`user_identities` に (provider, provider_user_id) がある）→ そのユーザーでログイン
2. **検証済みメールが既存アカウントと一致** → そのアカウントに identity をリンク（重複ユーザーを作らない）
3. **どれでもない** → 新規ユーザーを作成（パスワード無し）

ポイント：
- `users.password_hash` は OAuth ユーザーだと `''`（空）。bcrypt 比較は空文字に絶対マッチしないので、パスワードログインは自然に不可。
- 検証済みメールが取れない場合は **エラーにして弾く**（`oauth_no_email`）。`users.email` は NOT NULL UNIQUE のままにしたいので、ダミーメールを発行する設計にはしていません。GitHub は `user:email` スコープで検証済みメールがほぼ必ず取れます。
- ユーザー名は provider の login / メールのローカル部から自動生成し、衝突したら末尾にランダム付与（`uniqueUsername`）。

## 追加・変更したファイル

### バックエンド
| ファイル | 内容 |
|---|---|
| `migrations/000010_oauth_identities.{up,down}.sql` | `user_identities` テーブル新設 |
| `internal/models/user_identity.go` | identity の GORM モデル＋`ProviderGitHub/Google` 定数 |
| `internal/features/auth/oauth.go` | **本体**。provider 設定・state・code交換・profile取得・find-or-create |
| `internal/features/auth/oauth_test.go` | find-or-create のユニットテスト（新規/再ログイン/リンク/メール無し拒否） |
| `internal/features/auth/repository.go` | `FindIdentity` / `CreateIdentity` / `CreateUserWithIdentity`（トランザクション） |
| `internal/features/auth/service.go` | `userStore` インターフェースに identity 3メソッド追加 |
| `internal/features/auth/handler.go` | `EnableOAuth` / `OAuthStart` / `OAuthCallback` / `OAuthProviders` ＋ Cookie発行の共通化 |
| `internal/features/auth/service_test.go` | fake store に identity 実装を追加 |
| `internal/platform/config/config.go` | OAuth 用の環境変数を追加 |
| `internal/server/server.go` | OAuth サービスを組み立てて、有効な provider があれば配線 |

### フロントエンド
| ファイル | 内容 |
|---|---|
| `src/components/OAuthButtons.tsx` | 有効な provider を取得して「○○ で続ける」リンクを表示 |
| `src/lib/api.ts` | `oauthStartUrl()` / `fetchOAuthProviders()` |
| `src/app/login/page.tsx` | ボタン設置＋`?error` 表示 |
| `src/app/register/page.tsx` | ボタン設置 |
| `src/lib/i18n.tsx` | 文言（EN/JA） |
| `src/app/globals.css` | `.oauth-btn` スタイル（塗りつぶしでないアウトライン） |

## 動かすために必要なこと（←ここは要対応）

実際の OAuth ハンドシェイクは**本物のクライアント認証情報が無いと動かない**ため、ここまでは未検証です。次をやってください。

### 1. OAuth アプリを登録
- **GitHub**: Settings → Developer settings → OAuth Apps → New。
  - Authorization callback URL: `http://localhost:8080/api/auth/oauth/github/callback`（本番は本番APIのドメイン）
- **Google**: Cloud Console → APIs & Services → Credentials → OAuth client ID（Web application）。
  - Authorized redirect URI: `http://localhost:8080/api/auth/oauth/google/callback`

### 2. 環境変数（backend）
```
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
OAUTH_REDIRECT_BASE_URL=http://localhost:8080   # この API 自身の公開URL。callback はこれに付け足す
FRONTEND_URL=http://localhost:3000              # 未設定なら CORS_ORIGINS の先頭を使う
```
※ 認証情報が未設定の provider はボタンも出ず、ルートも生えません（`/api/auth/oauth/providers` が空配列を返す）。

### 3. 確認
- マイグレーション適用（dev は `AUTO_MIGRATE` で自動、本番は `cmd/migrate`）。
- フロントのログイン画面に「GitHub で続ける / Google で続ける」が出る。
- 押す → 同意 → `/friends` に戻ってログイン済みになる。

## 検証できたこと / できていないこと

- ✅ `go build ./...` / `go vet ./...` / auth ユニットテスト（OAuth含む）/ フロント `tsc` `lint` すべて green
- ✅ find-or-create のロジックはテスト済み（新規・再ログイン・メールリンク・メール無し拒否・ユーザー名衝突）
- ⚠️ provider との実 HTTP 往復（code交換・userinfo）は本物の認証情報が要るため未実行。`fetchGitHubProfile` / `fetchGoogleProfile` のレスポンス形だけ要目視確認。
- ⚠️ 統合テスト（embedded-postgres）はこの環境では走らせていない。`go test ./internal/integration/...` を手元で。

## 設計上、後で考えたほうがいい点
- register 画面の OAuth は利用規約チェックを通らない。法務的に同意フローをどう扱うか（コールバック後に同意を求める等）は要検討。
- 1ユーザーに複数 provider をリンクするUI（設定画面で後付け連携）は未実装。今は「ログイン時に自動リンク」だけ。
