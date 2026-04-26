import Link from "next/link";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="w-7 h-7">
      <path d="M12 2 L4 5 V12 C4 17 8 21 12 22 C16 21 20 17 20 12 V5 L12 2Z" />
      <path d="M9 12 L11 14 L15 10" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="w-7 h-7">
      <path d="M3 20 H21" />
      <path d="M6 16 V10" />
      <path d="M11 16 V6" />
      <path d="M16 16 V13" />
      <path d="M21 16 V8" />
    </svg>
  );
}

function ScalesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="w-7 h-7">
      <path d="M12 3 V21" />
      <path d="M5 21 H19" />
      <path d="M5 7 H19" />
      <path d="M3 13 L7 7 L11 13 H3 Z" />
      <path d="M13 13 L17 7 L21 13 H13 Z" />
    </svg>
  );
}

interface PillarProps {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  description: string;
  href: string;
}

function Pillar({ icon, title, tagline, description, href }: PillarProps) {
  return (
    <Link
      href={href}
      className="group block bg-bg p-10 hover:bg-surface transition-colors"
    >
      <div className="text-gold mb-6">{icon}</div>
      <h3 className="font-display text-2xl text-text">{title}</h3>
      <p className="text-text-2 text-sm mt-1 italic">{tagline}</p>
      <p className="text-text-3 text-sm mt-6 leading-relaxed">{description}</p>
      <p className="mt-10 text-gold text-xs font-mono uppercase tracking-[0.25em] opacity-0 group-hover:opacity-100 transition-opacity">
        Open →
      </p>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <main>
      {/* Header */}
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b border-border">
        <Link href="/" className="font-display text-xl text-text tracking-tight">
          FARaudit
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/audit" className="text-text-2 hover:text-text">Audit</Link>
          <Link href="/dashboard" className="text-text-2 hover:text-text">Dashboard</Link>
          <Link
            href="/login"
            className="px-4 py-2 border border-border-2 text-text hover:border-gold hover:text-gold transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative px-6 md:px-10 pt-24 md:pt-32 pb-24 md:pb-32 max-w-6xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">
          Federal Contract Intelligence
        </p>
        <h1 className="mt-8 font-display font-light text-5xl sm:text-6xl md:text-7xl tracking-tight text-text leading-[1.05]">
          Federal Contract<br />Intelligence
          <span className="text-gold">.</span>
        </h1>
        <p className="mt-10 max-w-2xl text-lg md:text-xl text-text-2 leading-relaxed font-body">
          Defense subcontractors win more bids when they know what&apos;s hiding in the solicitation.
        </p>
        <div className="mt-14 flex flex-col sm:flex-row gap-4">
          <Link
            href="/audit"
            className="inline-flex items-center justify-center px-10 py-4 bg-gold text-bg font-medium tracking-wide hover:bg-gold-dim transition-colors"
          >
            Run a free audit
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center px-10 py-4 border border-border-2 text-text hover:bg-surface hover:border-text-2 transition-colors"
          >
            See how it works
          </Link>
        </div>

        {/* Gold rule */}
        <div className="mt-24 h-px bg-gradient-to-r from-gold via-gold-dim to-transparent" />
      </section>

      {/* Three pillars */}
      <section id="how-it-works" className="px-6 md:px-10 pb-32 max-w-6xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-10">
          The Empire
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          <Pillar
            icon={<ShieldIcon />}
            title="FARaudit"
            tagline="Solicitation compliance auditing"
            description="Three-call AI analysis of every SAM.gov solicitation. FAR/DFARS clauses, certifications, hidden risks — in 45 seconds."
            href="/audit"
          />
          <Pillar
            icon={<ChartIcon />}
            title="Capital OS"
            tagline="Market intelligence"
            description="Bloomberg-grade macro signals, defense sector tracking, options flow, regime classification, yield curve analytics."
            href="/capital"
          />
          <Pillar
            icon={<ScalesIcon />}
            title="LexAnchor"
            tagline="Legal intelligence"
            description="Federal contract law, GAO bid protests, ASBCA decisions, False Claims cases, lobbying disclosures."
            href="/legal"
          />
        </div>
      </section>

      {/* Provenance / social proof */}
      <section className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-text-3 mb-4">
            Provenance
          </p>
          <p className="font-display text-2xl md:text-3xl text-text italic font-light leading-snug max-w-3xl">
            Built by a former Lockheed Martin and Sikorsky financial analyst.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="font-display text-lg text-text">FARaudit</p>
          <p className="text-xs text-text-3 font-mono">
            © 2026 FARaudit. Federal Contract Intelligence.
          </p>
        </div>
      </footer>
    </main>
  );
}
