import { LegalDoc } from "@/components/LegalDoc";

export const metadata = {
  title: "Terms of Service — Chains",
};

// Generic template. Replace the bracketed placeholders (operator name, contact,
// governing law, etc.) with real details before going live. This is not legal
// advice — have it reviewed before relying on it.
export default function TermsPage() {
  return <LegalDoc en={<TermsEN />} ja={<TermsJA />} />;
}

function TermsEN() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: [DATE]</p>
      <p>
        These Terms govern your use of Chains (the &quot;Service&quot;), operated
        by [OPERATOR]. By creating an account or using the Service, you agree to
        these Terms.
      </p>

      <h2>1. Accounts</h2>
      <p>
        You must provide accurate information and keep your credentials secure.
        You are responsible for activity under your account. You must be at least
        [AGE] years old to use the Service.
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
        You grant [OPERATOR] the limited right to host and display that content
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
        To the extent permitted by law, [OPERATOR] is not liable for indirect or
        consequential damages arising from your use of the Service.
      </p>

      <h2>6. Changes</h2>
      <p>
        We may update these Terms. Material changes will be announced in the
        Service; continued use after changes means you accept them.
      </p>

      <h2>7. Contact &amp; governing law</h2>
      <p>
        Questions: <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>. These
        Terms are governed by the laws of [JURISDICTION]. See also our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}

function TermsJA() {
  return (
    <>
      <h1>利用規約</h1>
      <p className="muted">最終更新日: [DATE]</p>
      <p>
        本規約は、[OPERATOR]（以下「当方」）が提供する Chains（以下「本サービス」）の
        利用条件を定めるものです。アカウントの作成または本サービスの利用をもって、
        本規約に同意したものとみなします。
      </p>

      <h2>1. アカウント</h2>
      <p>
        正確な情報を登録し、認証情報を安全に管理してください。アカウントでの行為に
        ついてはユーザーが責任を負います。本サービスの利用には [AGE] 歳以上である
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

      <h2>7. お問い合わせ・準拠法</h2>
      <p>
        お問い合わせ: <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>。本規約は
        [JURISDICTION] の法令に準拠します。あわせて{" "}
        <a href="/privacy">プライバシーポリシー</a> もご確認ください。
      </p>
    </>
  );
}
