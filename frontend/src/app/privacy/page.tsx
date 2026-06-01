import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Chains",
};

// Generic GDPR-style template. Replace the bracketed placeholders with the
// operator's real details before going live.
export default function PrivacyPage() {
  return (
    <div className="container center-narrow">
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
          This removes your user record and, by cascade, your friendships,
          requests, blocks, languages and avatar.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        For privacy requests, contact{" "}
        <a href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>.
      </p>

      <p style={{ marginTop: 24 }}>
        <Link href="/login">← Back</Link>
      </p>
    </div>
  );
}
