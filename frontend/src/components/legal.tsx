// Legal document content (Terms of Service, Privacy Policy) in English and
// Japanese. Shared by the standalone /terms and /privacy pages and the in-app
// Settings area, so the wording lives in one place. Plain presentational
// components — safe in both server and client trees.

export function PrivacyEN() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 2026-06-02</p>
      <p>
        This policy explains what personal data Chains (&quot;we&quot;) collects,
        why, and the rights you have over it. For questions or requests, contact{" "}
        <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a>.
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
        <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a>.
      </p>
    </>
  );
}

export function PrivacyJA() {
  return (
    <>
      <h1>プライバシーポリシー</h1>
      <p className="muted">最終更新日: 2026-06-02</p>
      <p>
        本ポリシーは、Chains（以下「当方」）が収集する個人データ、その目的、および
        ユーザーの権利について説明します。お問い合わせ・ご請求は{" "}
        <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a> までご連絡ください。
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
        <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a> までご連絡ください。
      </p>
    </>
  );
}

export function TermsEN() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: 2026-06-02</p>
      <p>
        These Terms govern your use of Chains (the &quot;Service&quot;), operated
        by yabu. By creating an account or using the Service, you agree to
        these Terms.
      </p>

      <h2>1. Accounts</h2>
      <p>
        You must provide accurate information and keep your credentials secure.
        You are responsible for activity under your account. You must be at least
        18 years old to use the Service.
      </p>

      <h2>2. Acceptable use</h2>
      <ul>
        <li>Do not break the law or infringe others&apos; rights.</li>
        <li>Do not harass, abuse, or impersonate others.</li>
        <li>Do not attempt to disrupt, attack, or gain unauthorized access to the Service.</li>
        <li>Do not upload content you have no right to share.</li>
      </ul>

      <h2>3. Your content</h2>
      <p>
        You retain ownership of the profile information and images you upload.
        You grant yabu the limited right to host and display that content
        in order to operate the Service.
      </p>

      <h2>4. Termination</h2>
      <p>
        You may delete your account at any time from your profile settings. We
        may suspend or terminate accounts that violate these Terms.
      </p>

      <h2>5. Disclaimer &amp; liability</h2>
      <p>
        The Service is provided &quot;as is&quot;, without warranties of any kind.
        To the extent permitted by law, yabu is not liable for indirect or
        consequential damages arising from your use of the Service.
      </p>

      <h2>6. Changes</h2>
      <p>
        We may update these Terms. Material changes will be announced in the
        Service; continued use after changes means you accept them.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions: <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a>.
        See also our <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}

export function TermsJA() {
  return (
    <>
      <h1>利用規約</h1>
      <p className="muted">最終更新日: 2026-06-02</p>
      <p>
        本規約は、yabu（以下「当方」）が提供する Chains（以下「本サービス」）の
        利用条件を定めるものです。アカウントの作成または本サービスの利用をもって、
        本規約に同意したものとみなします。
      </p>

      <h2>1. アカウント</h2>
      <p>
        正確な情報を登録し、認証情報を安全に管理してください。アカウントでの行為に
        ついてはユーザーが責任を負います。本サービスの利用には 18 歳以上である
        必要があります。
      </p>

      <h2>2. 禁止事項</h2>
      <ul>
        <li>法令違反、または第三者の権利を侵害する行為。</li>
        <li>嫌がらせ、誹謗中傷、なりすまし。</li>
        <li>本サービスの妨害・攻撃・不正アクセスの試み。</li>
        <li>共有する権利のないコンテンツのアップロード。</li>
      </ul>

      <h2>3. ユーザーのコンテンツ</h2>
      <p>
        アップロードしたプロフィール情報・画像の権利はユーザーに帰属します。当方は
        本サービスの運営に必要な範囲で、当該コンテンツをホスト・表示する限定的な
        権利を有します。
      </p>

      <h2>4. 終了</h2>
      <p>
        ユーザーはプロフィール設定からいつでもアカウントを削除できます。当方は本規約
        に違反するアカウントを停止または削除することがあります。
      </p>

      <h2>5. 免責・責任の制限</h2>
      <p>
        本サービスは現状有姿で提供され、いかなる保証も行いません。法令で認められる
        範囲において、当方は本サービスの利用に起因する間接的・結果的損害について責任を
        負いません。
      </p>

      <h2>6. 変更</h2>
      <p>
        本規約は改定されることがあります。重要な変更は本サービス上で告知します。変更
        後も利用を継続した場合、変更に同意したものとみなします。
      </p>

      <h2>7. お問い合わせ</h2>
      <p>
        お問い合わせ: <a href="mailto:hayabusa115346@gmail.com">hayabusa115346@gmail.com</a>。
        あわせて <a href="/privacy">プライバシーポリシー</a> もご確認ください。
      </p>
    </>
  );
}
