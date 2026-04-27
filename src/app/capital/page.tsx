import Link from "next/link";

export default function CapitalOSPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 md:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-text">FARaudit</Link>
        <nav className="flex items-center gap-6 text-sm text-text-2">
          <Link href="/dashboard" className="hover:text-text">Dashboard</Link>
          <Link href="/audit" className="hover:text-text">Audit</Link>
          <Link href="/capital" className="text-text">Capital OS</Link>
          <Link href="/legal" className="hover:text-text">LexAnchor</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">02 / Apex Empire</p>
          <h1 className="mt-6 font-display text-5xl md:text-6xl text-text font-light tracking-tight">
            Capital OS<span className="text-gold">.</span>
          </h1>
          <p className="mt-8 text-text-2 text-lg leading-relaxed">
            Market intelligence for the Apex Empire. Coming soon.
          </p>
          <p className="mt-10">
            <a
              href="https://www.notion.so/34efaf5b9314819bad4bfd97d6ef2105"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-gold hover:text-gold-dim font-mono text-sm tracking-wider"
            >
              View today&apos;s positions digest →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
