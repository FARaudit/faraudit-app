"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="mt-1 text-xs text-text-3 hover:text-text-2 underline font-mono"
    >
      Sign out
    </button>
  );
}
