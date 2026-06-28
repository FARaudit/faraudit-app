// $0 unit proof for the SSRF/key-leak guard (src/lib/sam-url-guard.ts).
// Pure-logic test of assertAllowedSamUrl — positive (real SAM + S3 redirect
// hosts pass) + load-bearing negatives (every SSRF/key-leak vector is blocked).
// Run: npx tsx scripts/audit-ai/test-sam-url-guard.ts
import { assertAllowedSamUrl } from "../../src/lib/sam-url-guard";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL:", msg); }
}
function allowed(url: string, kind: "initial" | "redirect"): boolean {
  try { assertAllowedSamUrl(url, kind); return true; } catch { return false; }
}

// ── POSITIVES — must pass ──────────────────────────────────────────────
ok(allowed("https://sam.gov/api/prod/opps/v3/opportunities/abc/resources/download/1", "initial"), "sam.gov initial");
ok(allowed("https://api.sam.gov/prod/opportunities/v3/resources/files/x/download", "initial"), "api.sam.gov initial");
ok(allowed("https://falextracts.s3.amazonaws.com/Attachment/x?X-Amz-Expires=9", "redirect"), "S3 presigned redirect (bucket-style)");
ok(allowed("https://s3.us-gov-west-1.amazonaws.com/bucket/key?sig=1", "redirect"), "GovCloud S3 redirect");
ok(allowed("https://s3.amazonaws.com/b/k", "redirect"), "plain s3.amazonaws.com redirect");
ok(allowed("https://mybucket.s3.us-east-1.amazonaws.com/k", "redirect"), "regional bucket-style S3 redirect");
ok(allowed("https://sam.gov/path", "redirect"), "sam.gov also valid as redirect target");

// ── LOAD-BEARING NEGATIVES — must ALL be blocked ───────────────────────
ok(!allowed("http://sam.gov/x", "initial"), "NEG: http (non-TLS) blocked");
ok(!allowed("https://sam.gov.evil.com/x", "initial"), "NEG: suffix-spoof host blocked");
ok(!allowed("https://evilsam.gov/x", "initial"), "NEG: prefix-spoof (evilsam.gov) blocked");
ok(!allowed("https://notsam.gov.attacker.net/x", "initial"), "NEG: nested spoof blocked");
ok(!allowed("https://169.254.169.254/latest/meta-data/", "initial"), "NEG: cloud metadata IP blocked");
ok(!allowed("http://169.254.169.254/", "initial"), "NEG: metadata over http blocked");
ok(!allowed("https://localhost/admin", "initial"), "NEG: localhost blocked");
ok(!allowed("https://10.0.0.5/internal", "initial"), "NEG: private RFC1918 IP blocked");
ok(!allowed("file:///etc/passwd", "initial"), "NEG: file:// scheme blocked");
ok(!allowed("ftp://sam.gov/x", "initial"), "NEG: ftp scheme blocked");
ok(!allowed("not a url", "initial"), "NEG: malformed URL blocked");
// amazonaws.com must NOT be an allowed INITIAL host (only a redirect target) —
// the api_key rides the initial request, so it may only go to sam.gov.
ok(!allowed("https://falextracts.s3.amazonaws.com/x", "initial"), "NEG: S3 not allowed as INITIAL (key would leak to AWS)");
// redirect targets are still constrained — an open-redirect to an attacker host is blocked
ok(!allowed("https://attacker.com/x", "redirect"), "NEG: arbitrary redirect target blocked");
ok(!allowed("http://falextracts.s3.amazonaws.com/x", "redirect"), "NEG: http S3 redirect blocked");
ok(!allowed("https://amazonaws.com.evil.com/x", "redirect"), "NEG: amazonaws suffix-spoof blocked");
ok(!allowed("https://evil.amazonaws.com/x", "redirect"), "NEG: non-S3 amazonaws host blocked (tightened allowlist)");
ok(!allowed("https://ec2-1-2-3-4.compute.amazonaws.com/x", "redirect"), "NEG: EC2 compute amazonaws host blocked");
ok(!allowed("https://falextracts.s3.amazonaws.com/x", "initial"), "NEG: S3 still not allowed as INITIAL host");

console.log(`\nsam-url-guard: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("✓ ALL GREEN — SSRF/key-leak vectors blocked, real SAM + S3 hosts pass");
