// Every API route must actually PARSE. No gate covered this layer.
//
// Run: npx tsx test/public/_route-modules-parse.test.ts
//
// Written after a live near-miss on 2026-08-03: during a conflict resolution,
// src/app/api/regulatory-updates/route.ts sat on disk containing '<<<<<<< HEAD',
// '=======' and '>>>>>>> origin/main' — syntactically invalid TypeScript — and the
// ENTIRE test/public/ suite passed, 18 of 18 green. Nothing in that suite imports
// anything under src/app/api/**, so a route can be arbitrarily broken and every gate
// still reports success. Only `tsc` caught it, and `tsc` is not what a merge waits on.
//
// This gate is deliberately about SYNTACTIC REACHABILITY, not behaviour. It does not
// execute handlers — a route handler needs a request, a session and a database. It
// asserts the far weaker property that was actually missing: the file is valid,
// conflict-free source that declares at least one HTTP handler.
//
// Cheap, and it fails on exactly the class that got through.
export {};
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "esbuild";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const API = join(ROOT, "src", "app", "api");

function routeFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (/^route\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const CONFLICT = /^(?:<{7}|={7}|>{7})(?:\s|$)/m;
const HANDLER = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[:=]/;

console.log("── Part A · every src/app/api/**/route.ts parses and declares a handler ──");
const files = routeFiles(API);

// Fail closed: an empty sweep is the failure mode this whole file exists to prevent.
// "0 routes checked, 0 problems" is the shape of a gate that cannot go red.
check(`discovered route files (${files.length})`, files.length > 0, "found no route.ts under src/app/api — the sweep is inert");

for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  const src = readFileSync(f, "utf8");

  // Conflict markers first: they produce a parse error too, but the named cause is
  // what makes the failure actionable at 2am.
  check(`${rel} · no merge-conflict markers`, !CONFLICT.test(src), "unresolved conflict markers are present");

  let parsed = true; let why = "";
  try {
    transformSync(src, { loader: f.endsWith("x") ? "tsx" : "ts", format: "esm" });
  } catch (err) {
    parsed = false;
    why = err instanceof Error ? err.message.split("\n")[0] : String(err);
  }
  check(`${rel} · parses as TypeScript`, parsed, why);

  check(`${rel} · exports at least one HTTP handler`, HANDLER.test(src), "no GET/POST/... export found");
}

// ── Part B · planted positives: each probe must catch a known bad ───────────────
// Reconstructed from the actual bytes that survived the suite on 2026-08-03.
console.log("\n── Part B · planted inputs (each probe must catch a known bad) ──");

const PLANTED_CONFLICT = [
  "export async function GET() {",
  "<<<<<<< HEAD",
  "  return new Response('a');",
  "=======",
  "  return new Response('b');",
  ">>>>>>> origin/main",
  "}",
].join("\n");

check("B1 · conflict-marker probe catches the planted markers", CONFLICT.test(PLANTED_CONFLICT));

let plantedParsed = true;
try { transformSync(PLANTED_CONFLICT, { loader: "ts", format: "esm" }); } catch { plantedParsed = false; }
check("B2 · parse probe rejects the planted conflict file", !plantedParsed);

let noHandlerParsed = true;
try { transformSync("export const dynamic = 'force-dynamic';", { loader: "ts", format: "esm" }); } catch { noHandlerParsed = false; }
check("B3 · a route with no handler is caught", noHandlerParsed && !HANDLER.test("export const dynamic = 'force-dynamic';"));

// NEGATIVE controls — these must NOT fire, or every healthy route reads as broken.
check("B4 · conflict probe does NOT fire on ordinary code",
  !CONFLICT.test("const a = 1;\nconst b = a === 7 ? 1 : 2;\n// ======= not a marker mid-comment\n"));
check("B5 · handler probe accepts `export async function GET`", HANDLER.test("export async function GET(req: Request) {}"));
check("B6 · handler probe accepts `export const POST =`", HANDLER.test("export const POST = async () => {};"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
