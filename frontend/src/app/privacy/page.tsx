import { LegalDoc } from "@/components/LegalDoc";

export const metadata = {
  title: "Privacy Policy — Chains",
};

// Generic GDPR-style template. Replace the bracketed placeholders with the
// operator's real details before going live.
export default function PrivacyPage() {
  return <LegalDoc en={<PrivacyEN />} ja={<PrivacyJA />} />;
}

function PrivacyEN() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: [DATE]</p>
      <p>
        This policy explains what personal data Chains (&quot;we&quot;) collects,
        why, and the rights you have over it. For questions or requests, contact{" "}
        <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li>Account details you provide: email address, username and display name.</li>
        <li>Profile information you choose to add: bio/status, job title, links and programming languages.</li>
        <li>An optional avatar image you upload.</li>
        <li>Your connections: friend requests and friendships, and users you block.</li>
        <li>Authentication data: a hashed password and short-lived session tokens.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To provide the service: authentication, your profile, and the friend network.</li>
        <li>To keep the service secure (e.g. rate limiting and abuse prevention).</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>Retention</h2>
      <p>
        We keep your data while your account is active. Session tokens expire
        automatically. When you delete your account, your data is erased as
        described below.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Access &amp; portability:</strong> you can view your profile data in the app.</li>
        <li><strong>Rectification:</strong> you can edit your profile at any time.</li>
        <li>
          <strong>Erasure:</strong> you can permanently delete your account and all
          associated data from your profile settings (&quot;Delete account&quot;).
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        For privacy requests, contact{" "}
        <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>.
      </p>
    </>
  );
}

function PrivacyJA() {
  return (
    <>
      <h1>プライバシーポリシー</h1>
      <p className="muted">最終更新日: [DATE]</p>
      <p>
        本ポリシーは、Chains（以下「当方」）が収集する個人データ、その目的、および
        ユーザーの権利について説明します。お問い合わせ・ご請求は{" "}
        <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a> までご連絡ください。
      </p>

      <h2>収集するデータ</h2>
      <ul>
        <li>登録情報: メールアドレス、ユーザー名、表示名。</li>
        <li>任意で追加するプロフィール情報: 自己紹介/ステータス、職種、各種リンク、プログラミング言語。</li>
        <li>任意でアップロードするアバター画像。</li>
        <li>つながり: 友達リクエスト・友達関係、ブロックしたユーザー。</li>
        <li>認証データ: ハッシュ化されたパスワードと短命のセッショントークン。</li>
      </ul>

      <h2>利用目的</h2>
      <ul>
        <li>サービスの提供（認証、プロフィール、友達ネットワーク）。</li>
        <li>サービスの安全維持（レート制限・不正利用防止など）。</li>
      </ul>
      <p>当方は個人データを販売しません。</p>

      <h2>保存期間</h2>
      <p>
        アカウントが有効な間、データを保持します。セッショントークンは自動的に失効
        します。アカウントを削除すると、下記のとおりデータは消去されます。
      </p>

      <h2>ユーザーの権利</h2>
      <ul>
        <li><strong>アクセス・可搬性:</strong> アプリ内でプロフィールデータを確認できます。</li>
        <li><strong>訂正:</strong> いつでもプロフィールを編集できます。</li>
        <li>
          <strong>消去:</strong> プロフィール設定の「アカウント削除」から、アカウントと
          関連データを完全に削除できます。
        </li>
      </ul>

      <h2>お問い合わせ</h2>
      <p>
        プライバシーに関するご請求は{" "}
        <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a> までご連絡ください。
      </p>
    </>
  );
}
