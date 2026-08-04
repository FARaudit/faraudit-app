// AUTH FRONT DOOR — ARC #747 class: a surface that asserts what it never computed.
//
// /signin.html shipped as a design placeholder: it took an email and a password, waited 1.4s, printed
// "Identity verified. Redirecting to your intelligence dashboard…" and sent the visitor to /home — where
// middleware bounced them straight back, because nothing had authenticated. It was the "Sign In" link on
// the public landing page, so that was the front door a real customer used.
//
// The check below is deliberately a SHAPE, not a filename: any served page that collects a password must
// hand that password to something. A page that takes a credential and transmits it nowhere cannot be
// authenticating — whatever it then tells the visitor is a claim it never computed.
export {};
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");

function htmlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

// Evidence that a credential actually leaves the page. Any ONE of these is enough — this is not trying to
// prove the auth is CORRECT, only that the page is wired to something rather than pantomiming.
const TRANSMITS = [
  /signInWithPassword|signInWithOtp|signInWithOAuth/,   // supabase-js
  /auth\/v1\/token/,                                    // supabase REST directly
  /<form[^>]+action=/i,                                 // classic POST
  /fetch\s*\(\s*['"`][^'"`]*(?:auth|login|session|sign-?in)/i,
];
const COLLECTS_PASSWORD = /<input[^>]+type=["']password["']/i;

let scanned = 0;
for (const f of htmlFiles(PUBLIC)) {
  const src = readFileSync(f, "utf8");
  if (!COLLECTS_PASSWORD.test(src)) continue;
  scanned++;
  const rel = f.replace(ROOT + "/", "");
  assert(TRANSMITS.some((re) => re.test(src)), `${rel} — collects a password and transmits it somewhere`);
}
// Stated, not implied: with both mocks deleted there are zero such surfaces today, so the loop above
// currently asserts nothing. Reporting the count keeps an empty scan from reading like a clean sweep
// ([[feedback_placebo_family_inert_equals_passing]]) — this check earns its keep on the NEXT one added.
console.log(`ℹ  password-collecting surfaces under public/: ${scanned} (guard is forward-looking)`);

// The two specific placeholders, pinned by name so neither comes back quietly.
const nextConfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
for (const name of ["signin.html", "sign-in.html"]) {
  assert(!existsSync(join(PUBLIC, name)), `public/${name} (fake sign-in surface) is gone`);
  // …and pinned again at the routing layer: deleting the file is not the same as closing the URL.
  assert(new RegExp(`source:\\s*["']/${name.replace(/[.]/g, "\\.")}["'][^}]*destination:\\s*["']/sign-in["']`).test(nextConfig),
    `next.config.ts redirects /${name} → /sign-in`);
}

// The public landing page must point at the real route. A relative href to a deleted file is a 404 for
// every unauthenticated visitor — the single worst link on the site to break.
//
// THE PAGE THIS GUARDS MOVED, AND THAT IS THE POINT. This read public/landing.html, an ORPHAN: nothing
// in src/ or public/ linked to it, and `/` has always been served from public/root-landing.html by
// src/app/page.tsx. So the strongest link-integrity check on the site was pointed at a page no visitor
// reached, while the actual front door went unchecked. It now reads what `/` serves.
//
// The selector is href-based, not class-based: the old one keyed on `class="nav-signin"`, and the live
// landing markup carries no class on those anchors — ported verbatim it would have found zero links and
// passed the "every" leg vacuously.
const landingFile = "root-landing.html";
const landing = readFileSync(join(PUBLIC, landingFile), "utf8");
const anchors = [...landing.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const signInHrefs = anchors.filter((h) => /sign-?in/i.test(h));
assert(signInHrefs.length > 0, `${landingFile} has a Sign In link`);
assert(signInHrefs.every((h) => h === "/sign-in"), `${landingFile} Sign In → /sign-in (found: ${signInHrefs.join(", ") || "none"})`);
// The retired page must not come back by the same door it left: an orphan re-added to the allowlist is
// exactly how this one survived a week past its replacement.
assert(!existsSync(join(PUBLIC, "landing.html")), "public/landing.html (orphaned duplicate landing page) is gone");
for (const f of ["src/middleware.ts", "src/app/_components/auth-shell.tsx"]) {
  assert(!/["']\/landing\.html["']/.test(readFileSync(join(ROOT, f), "utf8")), `${f} no longer lists /landing.html`);
}

// Nothing in the app should still describe /signin.html as a public path it expects to serve.
for (const f of ["src/middleware.ts", "src/app/_components/auth-shell.tsx"]) {
  const src = readFileSync(join(ROOT, f), "utf8");
  assert(!/["']\/signin\.html["']/.test(src), `${f} no longer lists /signin.html`);
  assert(!/["']\/sign-in\.html["']/.test(src), `${f} no longer lists /sign-in.html`);
}

console.log(failures === 0 ? "\nPASS — the front door authenticates or it does not exist.\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
