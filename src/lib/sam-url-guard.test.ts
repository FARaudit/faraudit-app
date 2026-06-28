// SSRF guard: behavior + cross-copy PARITY (limit c).
// Run: npx tsx src/lib/sam-url-guard.test.ts
//
// Part A — the canonical guard (src/lib/sam-url-guard.ts) rejects the SSRF /
// key-leak attack surface and accepts only sam.gov (initial) + sam.gov/S3 (redirect).
// Part B — the VENDORED copy (agents/audit-ai/pdf.ts, which cannot import src/) has
// NOT drifted on the security-critical constants: the two host allowlists + the
// redirect cap are byte-identical across both files. A one-sided edit = a security
// regression; this test fails loudly on drift (the "Keep in sync" comment is not
// enforcement — this is).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertAllowedSamUrl } from "./sam-url-guard";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const accepts = (url: string, kind: "initial" | "redirect"): boolean => {
  try { assertAllowedSamUrl(url, kind); return true; } catch { return false; }
};

// ── Part A · behavior ──
console.log("── Part A · canonical guard behavior ──");
// initial: only https sam.gov
check("A1 · https sam.gov initial → accept", accepts("https://sam.gov/api/prod/opps/v3/opportunities/resources/files/x/download", "initial"));
check("A2 · https www.sam.gov subdomain → accept", accepts("https://www.sam.gov/x", "initial"));
check("A3 · http sam.gov (not https) → REJECT", !accepts("http://sam.gov/x", "initial"));
check("A4 · evil.com → REJECT", !accepts("https://evil.com/x", "initial"));
check("A5 · suffix attack sam.gov.attacker.com → REJECT", !accepts("https://sam.gov.attacker.com/x", "initial"));
check("A6 · cloud metadata 169.254.169.254 → REJECT", !accepts("https://169.254.169.254/latest/meta-data/", "initial"));
check("A7 · S3 as INITIAL (key would leak) → REJECT", !accepts("https://bucket.s3.amazonaws.com/x", "initial"));
check("A8 · garbage / relative → REJECT", !accepts("not-a-url", "initial"));
// redirect: sam.gov OR an S3 host only
check("A9 · S3 presigned redirect → accept", accepts("https://bucket.s3.amazonaws.com/x?sig=1", "redirect"));
check("A10 · GovCloud regional S3 redirect → accept", accepts("https://s3.us-gov-west-1.amazonaws.com/b/x", "redirect"));
check("A11 · sam.gov redirect → accept", accepts("https://sam.gov/x", "redirect"));
check("A12 · non-S3 AWS host evil.amazonaws.com → REJECT", !accepts("https://evil.amazonaws.com/x", "redirect"));
check("A13 · http S3 redirect (not https) → REJECT", !accepts("http://bucket.s3.amazonaws.com/x", "redirect"));

// ── Part B · cross-copy parity of the security constants ──
console.log("\n── Part B · vendored-copy parity (no drift) ──");
const srcText = readFileSync(join(process.cwd(), "src/lib/sam-url-guard.ts"), "utf8");
const venText = readFileSync(join(process.cwd(), "agents/audit-ai/pdf.ts"), "utf8");

const grab = (text: string, name: string): string | null => {
  // capture the RHS of `const <name> = <value>;` up to the line end
  const m = text.match(new RegExp(`${name}\\s*=\\s*([^\\n]+?);?\\s*(?://.*)?$`, "m"));
  return m ? m[1].trim() : null;
};
const fields = [
  { label: "initial host allowlist", name: "SAM_INITIAL_HOST_RE" },
  { label: "redirect host allowlist", name: "SAM_REDIRECT_HOST_RE" },
];
for (const fld of fields) {
  const s = grab(srcText, fld.name);
  const v = grab(venText, fld.name);
  check(`B · ${fld.label} present in both`, !!s && !!v, `src=${s} vendored=${v}`);
  check(`B · ${fld.label} byte-identical across copies`, s === v, `src=${s} vendored=${v}`);
}
// redirect cap — named differently in each copy, compare the numeric value
const srcCap = grab(srcText, "MAX_SAM_REDIRECTS");
const venCap = grab(venText, "SAM_MAX_REDIRECTS");
check("B · redirect cap present in both", !!srcCap && !!venCap, `src=${srcCap} vendored=${venCap}`);
check("B · redirect cap value identical", srcCap === venCap, `src=${srcCap} vendored=${venCap}`);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
