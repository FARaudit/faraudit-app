export default function CapitalPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold">Capital OS</h1>
        <p className="mt-2 text-zinc-400">Bloomberg-grade market intelligence — without the $24K/yr terminal</p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-4">
          {["S&P 500", "10Y Yield", "VIX", "DXY"].map((label) => (
            <div key={label} className="rounded-xl border border-zinc-800 p-5">
              <p className="text-zinc-400 text-sm">{label}</p>
              <p className="text-2xl font-bold mt-2">—</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-800 p-6">
            <h2 className="font-semibold text-lg">Macro regime</h2>
            <p className="text-zinc-500 mt-2 text-sm">Loading classifier...</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-6">
            <h2 className="font-semibold text-lg">Yield curve</h2>
            <p className="text-zinc-500 mt-2 text-sm">Loading...</p>
          </div>
        </div>
      </div>
    </main>
  );
}
