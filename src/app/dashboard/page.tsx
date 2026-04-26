import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import SignOutButton from "./signout-button";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">FARaudit Dashboard</h1>
            <p className="mt-2 text-zinc-400">Live solicitations · scores · capture intelligence</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Signed in as</p>
            <p className="text-sm">{user.email}</p>
            <SignOutButton />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-800 p-5">
            <p className="text-zinc-400 text-sm">Active Solicitations</p>
            <p className="text-3xl font-bold mt-2">—</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-5">
            <p className="text-zinc-400 text-sm">High-Score Matches</p>
            <p className="text-3xl font-bold mt-2">—</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-5">
            <p className="text-zinc-400 text-sm">Audit Reports</p>
            <p className="text-3xl font-bold mt-2">—</p>
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-zinc-800 p-6">
          <h2 className="font-semibold text-lg">Live solicitation feed</h2>
          <p className="text-zinc-500 mt-2 text-sm">Loading from Supabase...</p>
        </div>
      </div>
    </main>
  );
}
