import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — FARaudit",
  description: "How FARaudit handles your federal contract data."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 md:px-10 py-12 max-w-3xl mx-auto">
      <Link href="/" className="text-text-3 hover:text-text-2 text-xs">← Home</Link>
      <h1 className="font-display text-3xl text-text font-medium mt-4">Privacy Policy</h1>
      <p className="mt-2 text-text-3 text-xs font-mono">Effective April 27, 2026</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-text-2">
        <Block title="Information we collect">
          FARaudit collects (a) account info you provide on sign-up — name, business email, organization; (b) federal solicitation PDFs and notice IDs you upload for analysis; (c) audit results, KO email drafts, and your responses to clarification prompts; (d) usage telemetry needed to operate the service (login timestamps, IP address, request paths).
        </Block>
        <Block title="How we use it">
          Solicitation content is sent to our analysis pipeline (Anthropic Claude via authenticated server-side calls) only to produce the audit report you requested. Audit outputs are stored on your account so you can re-open them. We do not train external models on your data, and we do not sell or rent it to third parties.
        </Block>
        <Block title="Where it lives">
          Account data and audit results are stored in Supabase (Postgres) with row-level security so only you can read your rows. Encryption in transit (TLS) and at rest (Supabase-managed AES-256). Service-role keys live only in our Vercel environment.
        </Block>
        <Block title="Third parties">
          We use Anthropic for analysis, Supabase for storage and auth, Resend for transactional email, and Vercel for hosting. Each is a sub-processor with their own privacy commitments. We do not share data with marketing or advertising vendors.
        </Block>
        <Block title="Your rights">
          You may request access to, correction of, or deletion of your data at any time. The Settings page exposes one-click deletion (CCPA-compliant; we honor identical requests from any state or country). Email <a href="mailto:jose@faraudit.com" className="text-accent">jose@faraudit.com</a> for anything not exposed in-product.
        </Block>
        <Block title="Children">
          FARaudit is built for federal contracting professionals. We do not knowingly collect data from anyone under 18. If you believe a minor has registered, email us and we will delete the account.
        </Block>
        <Block title="Changes">
          We will post material changes on this page and notify active users 30 days in advance via the email on file.
        </Block>
        <Block title="Contact">
          <a href="mailto:jose@faraudit.com" className="text-accent">jose@faraudit.com</a> · FARaudit · Operated under Woof Management LLC.
        </Block>
      </section>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg text-text font-medium">{title}</h2>
      <p className="mt-2">{children}</p>
    </div>
  );
}
