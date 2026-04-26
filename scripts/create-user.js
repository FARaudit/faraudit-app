#!/usr/bin/env node
// One-shot admin script — creates a Supabase user (no password, magic-link only).
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-user.js [email]
//
// If email is omitted, defaults to jose@faraudit.com.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.argv[2] || "jose@faraudit.com";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
  console.error("   Get the service role key from Supabase project settings → API");
  process.exit(1);
}

(async () => {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log(`Creating user ${EMAIL}...`);

  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
    user_metadata: { name: "Jose Antonio Rodriguez Jr", role: "founder" }
  });

  if (error) {
    if (error.message?.toLowerCase().includes("already") || error.code === "email_exists") {
      console.log(`ℹ️  User ${EMAIL} already exists`);
      const { data: list } = await sb.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === EMAIL);
      if (existing) {
        console.log(`   id: ${existing.id}`);
        console.log(`   created: ${existing.created_at}`);
        console.log(`   confirmed: ${existing.email_confirmed_at ? "yes" : "no"}`);
      }
      process.exit(0);
    }
    console.error("❌", error.message);
    process.exit(1);
  }

  console.log(`✅ Created user ${EMAIL}`);
  console.log(`   id: ${data.user.id}`);
  console.log(`   confirmed: ${data.user.email_confirmed_at ? "yes" : "no"}`);
  console.log("");
  console.log(`Next: visit /login on the deployed app, request a magic link, sign in.`);
})();
