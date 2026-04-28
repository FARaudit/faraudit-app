import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import DeleteAccountButton from "@/components/DeleteAccountButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-xs text-text-3 mb-2">
          <Link href="/dashboard" className="hover:text-text-2">Dashboard</Link>
          <span>›</span>
          <span className="text-text-2">Settings</span>
        </div>
        <h1 className="font-display text-3xl text-text font-medium">Settings</h1>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-3xl mx-auto space-y-10">
        <section>
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-3 mb-3">Profile</p>
          <div className="border border-border bg-surface p-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-3">Email</span><span className="text-text font-mono">{user.email}</span></div>
            <div className="flex justify-between"><span className="text-text-3">User ID</span><span className="text-text-3 font-mono text-xs">{user.id.slice(0, 8)}…</span></div>
          </div>
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-3 mb-3">Data</p>
          <div className="border border-border bg-surface p-5 space-y-3 text-sm">
            <a href="/api/audit/export" className="block text-accent hover:underline">Download all audit data (JSON)</a>
            <p className="text-text-3 text-xs">Export every audit, classification, and KO email draft tied to your account.</p>
          </div>
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-3 mb-3">Danger zone</p>
          <div className="border border-red/40 bg-red/5 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-text text-sm">Delete account</p>
              <p className="mt-1 text-xs text-red">
                Permanent. Removes audits, KO email history, and all account data. 30-second countdown so you can cancel.
              </p>
            </div>
            <DeleteAccountButton />
          </div>
        </section>
      </main>
    </div>
  );
}
