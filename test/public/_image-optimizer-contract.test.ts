// ─────────────────────────────────────────────────────────────────────────────
// IMAGE OPTIMIZER CONTRACT — every /_next/image request a served page builds
// must be one this deployment's next.config actually permits.
//
// THE DEFECT THIS EXISTS FOR. Defense News asked the optimizer for `q=70`.
// Next 16 changed `images.qualities` from "any quality" to `[75]`, and a
// quality outside the list is not softened to the nearest allowed value at the
// optimizer — it is rejected: `400 BAD_REQUEST · INVALID_IMAGE_OPTIMIZE_REQUEST`.
// Every photograph on the page therefore failed its first request and painted
// only through the raw-publisher fallback, at the publisher's full resolution:
// 5554x3707 and 8231x5487 originals on a news page whose largest slot is 1080
// wide. Nothing looked broken. The page had pictures. It was simply serving
// tens of megabytes per view and had silently lost every resize.
//
// A build does not catch this: the config is valid, the URL is well-formed, and
// the failure is a runtime 400 from the optimizer with a client-side fallback
// standing behind it. Which is exactly the shape a gate is for.
//
// WHAT IS CHECKED. The `w` and `q` of every optimizer URL any served page
// builds, against the widths and qualities next.config declares. Both sides are
// PARSED, never restated: a number typed into this file would be one more copy
// to drift.
//
// Run: npx tsx test/public/_image-optimizer-contract.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {};
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = process.cwd();
const RAW_CONFIG = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");

/** The `images:` block, brace-matched out of the file, with its line comments
 *  removed.
 *
 *  TWO THINGS THIS AVOIDS, both hit while writing it. The comment above
 *  remotePatterns explains why `hostname: "**"` would be an open proxy — read
 *  the whole file and the gate finds that `**` and condemns the config for the
 *  wildcard it was warning against. Then: stripping block comments from the
 *  whole file with a regex is worse, because `https://*.supabase.co` in the CSP
 *  string opens a `/*` that swallows everything to the next `*​/`, and the images
 *  block disappears entirely — a gate reading an empty policy and reporting on
 *  it. Scope first by structure, then strip. */
function imagesBlock(src: string): string {
  const at = src.indexOf("images:");
  if (at === -1) return "";
  const open = src.indexOf("{", at);
  if (open === -1) return "";
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { i++; break; }
  }
  return src.slice(open, i).replace(/^\s*\/\/.*$/gm, "");
}
const CONFIG = imagesBlock(RAW_CONFIG);

/** Reads a numeric array out of the images block. Parsed, not restated. */
function numArray(key: string): number[] | null {
  const m = CONFIG.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  const nums = m[1].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

// Next's own defaults, used when the config is silent. Stated here because a
// config that omits a key is not a config with no policy.
const DEFAULT_QUALITIES = [75];
const DEFAULT_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES = [16, 32, 48, 64, 96, 128, 256, 384];

const qualities = numArray("qualities") ?? DEFAULT_QUALITIES;
const widths = [
  ...(numArray("deviceSizes") ?? DEFAULT_DEVICE_SIZES),
  ...(numArray("imageSizes") ?? DEFAULT_IMAGE_SIZES)
];

console.log("\n── what the deployment permits ──");
console.log(`   qualities: ${qualities.join(", ")}`);
console.log(`   widths:    ${widths.sort((a, b) => a - b).join(", ")}`);
ok(CONFIG.length > 0, "the images block was located in next.config.ts",
  CONFIG.length ? `${CONFIG.length} chars` : "not found — every check below would read a default and prove nothing");
ok(qualities.length > 0 && widths.length > 0, "the config's image policy was parsed", "an unparsed policy proves nothing");

// ── every optimizer URL any served page builds ───────────────────────────────
const PUB = path.join(ROOT, "public");
const files = readdirSync(PUB).filter((f) => f.endsWith(".html") || f.endsWith(".js"));

type Req = { file: string; w: number | null; q: number | null; raw: string };
const requests: Req[] = [];
for (const f of files) {
  const src = readFileSync(path.join(PUB, f), "utf8");
  if (!src.includes("/_next/image")) continue;
  // These URLs are ASSEMBLED, not written whole: `'/_next/image?url=' +
  // encodeURIComponent(url) + '&w=' + w + '&q=75'`. Reading only as far as the
  // first quote captured `/_next/image?url=` and nothing else — so the q this
  // gate exists to check was never in the text it searched, and a planted q=70
  // passed. Take the whole STATEMENT instead, and let the literal fragments in
  // it be found wherever they sit.
  for (const m of src.matchAll(/\/_next\/image/g)) {
    const end = src.indexOf(";", m.index!);
    const nl = src.indexOf("\n", m.index!);
    const stop = Math.min(end === -1 ? src.length : end, nl === -1 ? src.length : nl);
    const raw = src.slice(m.index!, stop);
    const w = raw.match(/[&?]w=(\d+)/);
    const q = raw.match(/[&?]q=(\d+)/);
    requests.push({ file: f, w: w ? Number(w[1]) : null, q: q ? Number(q[1]) : null, raw });
  }
  // A width passed as a variable resolves at the call sites, so collect those too.
  for (const m of src.matchAll(/dnImgTag\([^,]+,[^,]+,\s*(\d+)\s*\)/g)) requests.push({ file: f, w: Number(m[1]), q: null, raw: m[0] });
  for (const m of src.matchAll(/dnImgHTML\([^,]+,\s*(\d+)\s*\)/g)) requests.push({ file: f, w: Number(m[1]), q: null, raw: m[0] });
}

console.log("\n── what the pages ask for ──");
ok(requests.length > 0, "at least one optimizer request was found to check",
  requests.length ? `${requests.length} request site(s) across ${new Set(requests.map((r) => r.file)).size} file(s)`
                  : "found none — this gate would pass vacuously");

const badQ = requests.filter((r) => r.q !== null && !qualities.includes(r.q));
ok(badQ.length === 0, "every requested quality is one the config permits",
  badQ.length ? badQ.map((r) => `${r.file} q=${r.q}`).join(", ") + ` — permitted: ${qualities.join(", ")}` : "");

const badW = requests.filter((r) => r.w !== null && !widths.includes(r.w));
ok(badW.length === 0, "every requested width is one the config permits",
  badW.length ? badW.map((r) => `${r.file} w=${r.w}`).join(", ") + ` — permitted: ${widths.join(", ")}` : "");

// ── the host allowlist is a boundary, not a convenience ──────────────────────
console.log("\n── remote host allowlist ──");
const wild = /hostname\s*:\s*["'](\*\*|\*)["']/.test(CONFIG);
ok(!wild, "no wildcard hostname — the optimizer is a fetching proxy and a bare ** is an open one");
const hosts = [...CONFIG.matchAll(/hostname:\s*["']([^"']+)["']/g)].map((m) => m[1]);
ok(hosts.length > 0, "remote hosts are named", hosts.join(", "));

// ── PLANTED POSITIVES · each check must be able to fail ─────────────────────
console.log("\n── planted positives ──");
const plantQ = [{ file: "planted", w: 640, q: 70, raw: "" }].filter((r) => !qualities.includes(r.q));
ok(plantQ.length === 1, "P1 · a q=70 request IS rejected by the quality check (the shipped defect)");
const plantW = [{ file: "planted", w: 999, q: 75, raw: "" }].filter((r) => !widths.includes(r.w));
ok(plantW.length === 1, "P2 · an unlisted width IS rejected by the width check");
ok(/hostname\s*:\s*["'](\*\*|\*)["']/.test(`images: { remotePatterns: [{ hostname: "**" }] }`),
  "P3 · the wildcard check catches a planted **");
// NEGATIVE control — the checks must not fire on what the page legitimately sends.
ok(qualities.includes(75) && widths.includes(640) && widths.includes(1080) && widths.includes(256),
  "N1 · the three widths and one quality this page uses are all permitted");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
