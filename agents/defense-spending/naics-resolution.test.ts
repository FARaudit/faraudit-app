// $0 REGRESSION for WHICH NAICS CODES the nightly pulls.
//
// The worker took its code list from a Railway environment variable. That list
// is a snapshot of an answer that lives in `capability_statements.naics_codes`
// — the customer profile that already scopes the SAM feed, Teaming, KO intel
// and the engine's bidder profile. The moment a customer adds a code, the env
// var is wrong, /defense-spending has no row for that code, and the page shows
// an EMPTY market rather than a wrong one. Nothing looks broken. Nobody finds
// out. Measured 2026-08-12: the variable listed 11 codes, the one capability
// statement on record declared 3.
//
// THIS TESTS THE REAL FUNCTION. An earlier version of this file mirrored the
// union logic locally, because the resolver lived inside index.ts and index.ts
// runs a full nightly at import. That mirror stayed GREEN while the env var was
// flipped from a supplement into a restriction — the one behaviour the file
// exists to protect. The logic was extracted to naics.ts for exactly that
// reason; a gate that tests a copy tests the copy.
//
// Run: npx tsx agents/defense-spending/naics-resolution.test.ts
import { unionNaicsCodes, customerCodeCount } from "./naics";
import type { CapabilityStatementRow } from "./naics";
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
};

type Row = CapabilityStatementRow;

/** Adapter over the REAL resolver: applies the throw-on-error rule that lives
 *  in index.ts, then delegates the union to the shipped implementation. */
function resolve(
  read: { data: Row[] | null; error: { message: string } | null },
  extra: string[]
): string[] {
  if (read.error) throw new Error(read.error.message);
  return unionNaicsCodes(read.data, extra);
}

const ok = (rows: Row[]) => ({ data: rows, error: null });

function main() {
  // ── 1 · A CUSTOMER CODE IS NEVER MISSED ───────────────────────────────────
  // The whole point. A code the customer declares gets pulled even when no
  // environment variable mentions it.
  {
    const codes = resolve(ok([{ naics_codes: ["332710", "336412", "336611"] }]), []);
    assert(codes.length === 3, "three declared codes resolve to three");
    assert(codes.includes("336611"), "a declared code is pulled with NO env var set");

    // The regression that motivated this: customer adds a fourth code.
    const after = resolve(ok([{ naics_codes: ["332710", "336412", "336611", "541330"] }]), []);
    assert(after.includes("541330"), "a NEWLY added customer code is picked up with no redeploy");
  }

  // ── 2 · THE ENV VAR CAN ONLY ADD, NEVER RESTRICT ──────────────────────────
  // A supplement that could subtract would reintroduce the same failure.
  {
    const codes = resolve(ok([{ naics_codes: ["332710", "336412", "336611"] }]), ["336411"]);
    assert(codes.length === 4, "the supplement adds to the customer set");
    assert(codes.includes("336411"), "a prospect/demo code is pullable without a customer");
    for (const c of ["332710", "336412", "336611"]) {
      assert(codes.includes(c), `customer code ${c} survives alongside the supplement`);
    }

    // A narrower env var must NOT shrink the pull.
    const narrowed = resolve(ok([{ naics_codes: ["332710", "336412", "336611"] }]), ["332710"]);
    assert(narrowed.length === 3, "an env var listing ONE code does not restrict the set to one");
  }

  // ── 2b · THE SUPPLEMENT IS A SUPERSET, PROVEN ON THE REAL FUNCTION ────────
  // Directly on unionNaicsCodes: whatever `extra` contains, every customer code
  // must still be present. This is the check the mirrored version could not make.
  {
    const customers = ["332710", "336412", "336611"];
    for (const extra of [[], ["332710"], ["999999"], ["332710", "336412"]]) {
      const out = unionNaicsCodes([{ naics_codes: customers }], extra);
      const kept = customers.every((c) => out.includes(c));
      assert(kept, `extra=[${extra.join(",")}] — all ${customers.length} customer codes survive`);
      assert(out.length >= customers.length, `extra=[${extra.join(",")}] — the set never shrinks below the customer set`);
    }
    assert(customerCodeCount([{ naics_codes: customers }]) === 3,
      "customerCodeCount reports the declared codes, excluding any supplement");
  }

  // ── 3 · MANY CUSTOMERS UNION, THEY DO NOT OVERWRITE ───────────────────────
  {
    const codes = resolve(ok([
      { naics_codes: ["332710", "336412"] },
      { naics_codes: ["336611", "332710"] },
      { naics_codes: ["541330"] }
    ]), []);
    assert(codes.length === 4, "three customers union to four distinct codes");
    assert(codes.join(",") === "332710,336412,336611,541330", "deduped and ordered");
  }

  // ── 4 · BOTH COLUMN SHAPES ────────────────────────────────────────────────
  // The column has carried text[] and a comma-joined string.
  {
    assert(resolve(ok([{ naics_codes: "332710, 336412 ,336611" }]), []).length === 3,
      "a comma-joined string is read, and whitespace trimmed");
    const mixed = resolve(ok([{ naics_codes: ["332710"] }, { naics_codes: "336412" }]), []);
    assert(mixed.length === 2, "array and string rows resolve together");
  }

  // ── 5 · A MALFORMED PROFILE COSTS ONLY ITSELF ─────────────────────────────
  {
    const codes = resolve(ok([
      { naics_codes: ["332710"] },
      { naics_codes: null },
      {},
      { naics_codes: 336412 },
      { naics_codes: ["", "  "] },
      { naics_codes: ["336611"] }
    ]), []);
    assert(codes.join(",") === "332710,336611",
      "unreadable rows contribute nothing and do not stop the readable ones");
  }

  // ── 6 · ZERO CUSTOMERS IS AN ANSWER; A FAILED READ IS NOT ─────────────────
  {
    assert(resolve(ok([]), []).length === 0, "no customers resolves to no codes — a real state");
    assert(resolve(ok([]), ["336411"]).length === 1, "the supplement still pulls with no customers");

    let threw = false;
    try { resolve({ data: null, error: { message: "permission denied" } }, ["336411"]); }
    catch { threw = true; }
    assert(threw, "a FAILED read throws — it never silently falls back to the env var");
  }

  // ── 7 · index.ts STILL BEHAVES THIS WAY ───────────────────────────────────
  // The mirror above is only a mirror. These read the real module so the two
  // cannot drift apart silently. Structure, not prose: each check targets a
  // code construct, and the file's comments are excluded from the search first
  // so an assertion cannot pass by matching the paragraph explaining it.
  {
    const src = readFileSync(path.join(import.meta.dirname, "index.ts"), "utf8");
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")      // block comments
      .replace(/^\s*\/\/.*$/gm, "");          // line comments

    assert(/from\(["']capability_statements["']\)/.test(code),
      "index.ts reads capability_statements — the codes come from the customer");
    assert(/\bthrow new Error\(/.test(code.slice(code.indexOf("resolveNaicsCodes"), code.indexOf("FY_WINDOWS"))),
      "a failed read throws inside the resolver rather than degrading");
    // The old shape: process.env.NAICS_CODES with a hardcoded fallback code.
    assert(!/process\.env\.NAICS_CODES\s*\|\|\s*["']3\d{5}["']/.test(code),
      "no hardcoded NAICS fallback — that default silently pulled one code");
    assert(/for\s*\(const naics of codes\)/.test(code),
      "the loop iterates the RESOLVED codes, not a module-level constant");
    assert(/unionNaicsCodes\(/.test(code),
      "index.ts delegates the union to naics.ts — the module this file actually tests");
  }

  console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
