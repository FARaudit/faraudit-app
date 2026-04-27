import Link from "next/link";

export default function LexAnchorPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 md:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-text">FARaudit</Link>
        <nav className="flex items-center gap-6 text-sm text-text-2">
          <Link href="/dashboard" className="hover:text-text">Dashboard</Link>
          <Link href="/audit" className="hover:text-text">Audit</Link>
          <Link href="/capital" className="hover:text-text">Capital OS</Link>
          <Link href="/legal" className="text-text">LexAnchor</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold">03 / Apex Empire</p>
          <h1 className="mt-6 font-display text-5xl md:text-6xl text-text font-light tracking-tight">
            LexAnchor<span className="text-gold">.</span>
          </h1>
          <p className="mt-8 text-text-2 text-lg leading-relaxed">
            AI legal intelligence. Coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
