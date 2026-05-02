// One-shot: create demo@faraudit.com with a strong generated password.
// Logs credentials to ~/faraudit-app/ceo/demo-credentials.txt (gitignored).
// Re-running with the same email is a no-op (Supabase rejects duplicate).

import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

const EMAIL = "demo@faraudit.com";

// Generate a strong password — 24 random bytes → base64url (≈32 chars).
const password = randomBytes(24).toString("base64url");

console.log(`[create-demo-user] creating ${EMAIL}`);
const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password,
  email_confirm: true,            // skip email-verification step
  user_metadata: { role: "demo", created_by: "audit-ai-script" }
});

if (error) {
  console.error(`[create-demo-user] failed: ${error.message}`);
  process.exit(1);
}

const userId = data.user?.id;
const ts = new Date().toISOString();

const credPath = resolve(process.cwd(), "ceo/demo-credentials.txt");
const credBlock = `# FARaudit demo credentials
# Generated: ${ts}
# Stored locally only — ceo/ is gitignored
# For first-customer demo at faraudit.com/home or /sign-in

EMAIL:    ${EMAIL}
PASSWORD: ${password}
USER ID:  ${userId}

# To rotate this password:
#   1. Supabase Studio → apex-production → Authentication → Users → demo@faraudit.com → Reset password
#   2. Or: re-run with delete first: supabase.auth.admin.deleteUser(USER_ID), then this script
`;
writeFileSync(credPath, credBlock, { mode: 0o600 });

console.log(`\n✓ demo user created`);
console.log(`  email:    ${EMAIL}`);
console.log(`  password: ${password}`);
console.log(`  user_id:  ${userId}`);
console.log(`\n  credentials logged to: ${credPath}`);
console.log(`  file mode 0600 (owner read/write only)`);
console.log(`\n  ceo/ is gitignored · password will not leave this machine`);
