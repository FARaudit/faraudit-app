// De-arm (#657) gauntlet — plain-assert (run via: npx ts-node test/dearm.test.ts).
// Covers: allowlist domain matching, the archive-decision matrix, and the structural guarantee that
// no trash/delete capability exists in the Gmail module.
import { isArchiveAllowlisted, shouldArchive } from "../src/archive-allowlist";
import * as gmail from "../src/gmail";

let passed = 0;
let failed = 0;
function check(cond: boolean, label: string): void {
  if (cond) passed += 1;
  else { failed += 1; console.error(`FAIL: ${label}`); }
}

// ── 1. isArchiveAllowlisted (default allowlist: github.com, vercel.com, railway.app, supabase.com) ──
check(isArchiveAllowlisted("noreply@github.com") === true, "github.com allowlisted");
check(isArchiveAllowlisted("notifications@notifications.github.com") === true, "subdomain notifications.github.com allowlisted");
check(isArchiveAllowlisted("bot@vercel.com") === true, "vercel.com allowlisted");
check(isArchiveAllowlisted("noreply@railway.app") === true, "railway.app allowlisted");
check(isArchiveAllowlisted("noreply@supabase.com") === true, "supabase.com allowlisted");
check(isArchiveAllowlisted("someone@github.com.evil.com") === false, "spoofed suffix NOT allowlisted");
check(isArchiveAllowlisted("ceo@faraudit.com") === false, "human sender NOT allowlisted");
check(isArchiveAllowlisted("") === false, "empty sender NOT allowlisted");
check(isArchiveAllowlisted(null) === false, "null sender NOT allowlisted");

// ── 2. Archive-decision matrix (change 2 verification) ──
//   allowlisted + deterministic → ARCHIVED
check(shouldArchive("deterministic", "noreply@github.com") === true, "deterministic + allowlisted → archived");
//   deterministic non-allowlisted → labeled, stays INBOX
check(shouldArchive("deterministic", "vendor@acme.com") === false, "deterministic + non-allowlisted → retained");
//   LLM-classified (even if allowlisted) → labeled, stays INBOX
check(shouldArchive("llm", "noreply@github.com") === false, "LLM + allowlisted → retained (LLM never archives)");
check(shouldArchive("llm", "vendor@acme.com") === false, "LLM + non-allowlisted → retained");

// ── 3. STRUCTURAL: no trash / delete capability anywhere in the Gmail module (change 1 verification) ──
check(!("moveToTrash" in gmail), "gmail module exports NO moveToTrash");
const gmailExports = Object.keys(gmail);
check(!gmailExports.some((k) => /trash|delete/i.test(k)), "gmail module has NO trash/delete-shaped export");
// archive path exists and is the only inbox-removal primitive
check(typeof gmail.archiveThread === "function", "archiveThread exists (label + remove INBOX/UNREAD)");
check(typeof gmail.ensureLabel === "function", "ensureLabel exists (create AI/Blacklisted if missing)");

console.log(`\n[dearm.test] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
