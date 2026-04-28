import Link from "next/link";

export const metadata = {
  title: "Terms of Service — FARaudit",
  description: "FARaudit Terms of Service."
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-6 md:px-10 py-12 max-w-3xl mx-auto">
      <Link href="/" className="text-text-3 hover:text-text-2 text-xs">← Home</Link>
      <h1 className="font-display text-3xl text-text font-medium mt-4">Terms of Service</h1>
      <p className="mt-2 text-text-3 text-xs font-mono">Effective April 27, 2026</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-text-2">
        <Block title="Service">
          FARaudit is federal-contract intelligence software. We analyze solicitation documents, surface compliance risks, and assist with bid / no-bid decisions and Contracting-Officer correspondence drafting.
        </Block>
        <Block title="Not legal advice">
          FARaudit is information-only. Outputs are not legal advice and do not create an attorney-client relationship. Material decisions — bid commitments, contract execution, regulatory positioning — should be reviewed by qualified counsel.
        </Block>
        <Block title="Your obligations">
          You will (a) keep credentials confidential, (b) not upload documents you do not have authority to share, (c) not use the service for unlawful purposes, (d) not attempt to reverse-engineer the analysis pipeline or extract our prompts, (e) not abuse rate limits or run automated scrapers.
        </Block>
        <Block title="Acceptable use">
          You will not upload classified information. FARaudit is built for unclassified federal procurement documents only. If you upload classified content you are solely responsible for the consequences.
        </Block>
        <Block title="Account">
          We may suspend or terminate accounts that violate these terms or that exhibit signals of automated abuse. You may close your account at any time from the Settings page; data deletion is irreversible.
        </Block>
        <Block title="Limitation of liability">
          Service is provided AS IS. To the maximum extent permitted, FARaudit and Woof Management LLC are not liable for indirect, incidental, or consequential damages, lost profits, or lost contract awards. Our aggregate liability for any claim is limited to the amount you paid in the 12 months preceding the claim.
        </Block>
        <Block title="Governing law">
          These terms are governed by the laws of the State of Delaware, without regard to conflict-of-law rules. Disputes will be resolved in the state and federal courts located in Delaware.
        </Block>
        <Block title="Changes">
          We may update these terms by posting a new effective date here and notifying active users 30 days in advance via email.
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
