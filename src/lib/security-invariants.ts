// EXECUTABLE FORM OF RULES 32, 60 AND 17 — the three with the worst consequences and, until now, no test.
//
// WHY THIS EXISTS RATHER THAN THE BASH SCAN. `scripts/security/fort-knox-scan.sh` was the standing security
// gate and it is structurally unable to fail: it contains ZERO `exit` statements, sets `FORT_KNOX_FAILED=1` in
// one place and never reads it. Proven by planted positive — a real `ghp_`-shaped token dropped into `src/`
// is DETECTED, printed, and the script still exits 0. Wired into CI as-is it would be a green check that
// proves nothing, which is worse than no check because it reads as coverage.
//
// A second, quieter defect in that script: every repo-scoped check globs `~/bullrize`, `~/lexanchor`,
// `~/faraudit-cron` with `2>/dev/null`, and an ABSENT directory yields empty output, which takes the "✓" branch.
// In CI, in a worktree, or on any other machine, a missing repository is indistinguishable from a clean one.
// The predicates below take their inputs explicitly so absence is a caller-visible fact, never a silent pass.
//
// Everything here is a PURE function over (path, content) pairs. That is the load-bearing design choice: it is
// what lets the suite feed synthetic violations and prove each checker actually goes RED. A security checker
// that has never been observed failing is indistinguishable from one that cannot.

export interface Violation {
  rule: 32 | 60 | 17;
  file: string;
  line: number;
  detail: string;
}

export interface SourceFile {
  path: string;
  content: string;
}

/** High-confidence credential VALUE shapes. Deliberately anchored on issuer-specific prefixes and lengths
 *  rather than entropy: an entropy heuristic on a repository full of sha256 fixture hashes and base64 assets
 *  produces noise, and a noisy security gate is one people learn to ignore. Missing a novel shape leaves the
 *  status quo; a false positive on every commit gets the gate deleted. */
export const CREDENTIAL_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "Anthropic API key", re: /sk-ant-api[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub PAT (classic)", re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "GitHub PAT (fine-grained)", re: /github_pat_[A-Za-z0-9_]{40,}/g },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/g },
  { name: "JWT (three-segment)", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
];

/** An env var name that reads like a credential. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the deliberate exception —
 *  the anon key is designed to be public and is protected by row-level security, not by secrecy. */
export const PUBLIC_ENV_ALLOWLIST = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_COMPANY_NAME",
]);

const SECRETISH = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIAL)S?$/;

/** Strip line comments so a checker keyed on code positions is not fooled by prose — and, equally, so prose
 *  that merely NAMES a variable is not reported as an exposure. `public/teaming-partners-live.js` documents
 *  that its server route is "SAM_API_KEY-backed"; that is a disclosure question for the comment-leak gate,
 *  not a credential reaching the browser, and conflating the two would make this gate cry wolf. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(Math.max(0, m.length - p1.length)))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

const lineOf = (content: string, index: number) => content.slice(0, index).split("\n").length;

/** RULE 32 — a secret VALUE must never be committed. Scans whatever files the caller supplies. */
export function findCommittedSecretValues(files: SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    for (const { name, re } of CREDENTIAL_PATTERNS) {
      for (const m of f.content.matchAll(new RegExp(re.source, re.flags))) {
        out.push({
          rule: 32,
          file: f.path,
          line: lineOf(f.content, m.index as number),
          // The MATCHED VALUE IS NEVER INCLUDED. This message is printed to a terminal and pasted into chat;
          // echoing the secret to prove the secret leaked would be the same defect that spawned Rule 32.
          detail: `${name} value present in a committed file`,
        });
      }
    }
  }
  return out;
}

/** RULE 60 — no credential may be reachable from a browser. `served` are files shipped verbatim to visitors
 *  (public/**); `client` are components that execute in the browser ("use client"). The test is STRUCTURAL:
 *  the question is only "can a browser reach this value", never "how bad would it be". */
export function findBrowserReachableCredentials(served: SourceFile[], client: SourceFile[]): Violation[] {
  const out: Violation[] = [];

  // (a) A credential VALUE in anything served verbatim. No bundler, no minifier — it ships as written.
  out.push(...findCommittedSecretValues(served).map((v) => ({ ...v, rule: 60 as const, detail: `${v.detail} — SERVED to the browser` })));

  // (b) A key passed in a URL. This is precisely how the SAM key shipped: a widget calling an authenticated
  // endpoint with `?api_key=<literal>`. Length floor keeps `?api_key=${KEY}` templates out of the report.
  for (const f of served) {
    for (const m of stripComments(f.content).matchAll(/[?&](api_?key|apikey|access_?token|auth_?token)=([A-Za-z0-9_-]{16,})/gi)) {
      out.push({ rule: 60, file: f.path, line: lineOf(f.content, m.index as number), detail: `credential passed in a URL query parameter (${m[1]})` });
    }
  }

  // (c) A non-public env var read from code that runs in the browser. Comments are stripped first — naming a
  // server-side variable in prose is a disclosure question, not an exposure.
  for (const f of [...served, ...client]) {
    for (const m of stripComments(f.content).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const name = m[1];
      if (name.startsWith("NEXT_PUBLIC_")) continue;
      out.push({ rule: 60, file: f.path, line: lineOf(f.content, m.index as number), detail: `browser-executed code reads server env var ${name}` });
    }
  }

  // (d) A NEXT_PUBLIC_* variable whose name reads like a credential and is not on the reviewed allowlist.
  // Adding one must be a deliberate, reviewed act — the prefix makes it public by construction.
  for (const f of [...served, ...client]) {
    for (const m of f.content.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+/g)) {
      const name = m[0];
      if (PUBLIC_ENV_ALLOWLIST.has(name)) continue;
      if (!SECRETISH.test(name)) continue;
      out.push({ rule: 60, file: f.path, line: lineOf(f.content, m.index as number), detail: `${name} is browser-visible by construction and is not on the reviewed allowlist` });
    }
  }

  return out;
}

/** RULE 17 — env-var parity. Given the flag names each platform actually reports, name every flag that governs
 *  shared code but is set on only one of them. Pure, so the suite can test it without credentials; the live
 *  values are the caller's problem to obtain (and to skip by name when it cannot). */
export function findEnvParityGaps(
  worker: Record<string, string>,
  vercel: Record<string, string>,
  governs: (name: string) => boolean = (n) => n.startsWith("AUDIT_")
): Violation[] {
  const out: Violation[] = [];
  const names = new Set([...Object.keys(worker), ...Object.keys(vercel)].filter(governs));
  for (const n of [...names].sort()) {
    const inW = n in worker, inV = n in vercel;
    if (inW && !inV) out.push({ rule: 17, file: "(platform env)", line: 0, detail: `${n} set on audit-worker but ABSENT on Vercel` });
    else if (!inW && inV) out.push({ rule: 17, file: "(platform env)", line: 0, detail: `${n} set on Vercel but ABSENT on audit-worker` });
    else if (inW && inV && worker[n] !== vercel[n]) out.push({ rule: 17, file: "(platform env)", line: 0, detail: `${n} DIFFERS between platforms` });
  }
  return out;
}
