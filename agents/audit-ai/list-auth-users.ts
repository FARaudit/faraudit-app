// One-shot: list every user in apex-production's auth.users via the
// admin API. Surfaces email, created_at, last_sign_in, confirmation status.
// Does NOT and CANNOT print passwords — Supabase stores bcrypt hashes only.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (error) { console.error("auth.admin.listUsers failed:", error); process.exit(1); }

const users = data.users || [];
console.log(`apex-production auth.users — ${users.length} total\n`);

for (const u of users) {
  const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "never";
  const created = u.created_at ? new Date(u.created_at).toLocaleString() : "—";
  const confirmed = u.email_confirmed_at ? "✓" : "✗";
  console.log(`  ${confirmed}  ${u.email?.padEnd(40) || "(no email)"}  created=${created.padEnd(22)}  last_sign_in=${lastSignIn}`);
}

console.log("\nNote: Supabase stores password HASHES (bcrypt), not plaintext.");
console.log("To get into faraudit.com/home you need either:");
console.log("  1. The password you originally set for one of these emails");
console.log("  2. A password reset link (Supabase Studio → Auth → user → Send password reset)");
console.log("  3. A magic link sign-in (if /sign-in supports it)");
console.log("  4. Create a fresh test user with a known password (admin.createUser API)");
