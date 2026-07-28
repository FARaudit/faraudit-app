// ARC #747 · E2 — CENSUS over the REAL stored audit corpus ($0, read-only, no model, no flag).
//
// ── REVISION 2. The first version of this census could not see the defect it was written for. ──
// Its number pattern required a dot (`\d+\.\d+`), so `DFARS 215-2` — the founding C1 token — never matched
// and the census reported a clean corpus. Two corrections, both load-bearing:
//   (1) dash-only forms are extracted. The malformation IS the dash.
//   (2) presence is BOUNDARY-ANCHORED, not `String.includes`. `"215-2"` is a substring of `"52.215-22"`,
//       which appears twice in this very source — so a naive presence check would have reported the
//       fabricated citation as PRESENT and passed it. [[feedback_token_substring_collision_doctrine]]
//
// ── WHAT THE CENSUS ESTABLISHED, and how it changed the spec ──
// The E2 spec asks for three checks: well-formed · appears in the source · not body-swapped. Measured:
//   • "appears in the source" is WRONG AS STATED. 29/29 absent tokens in the run-record corpus and 13/13 in
//     the live corpus are legitimate — they are AUTHORITY citations ("13 CFR 121.406(b)" for the SBA
//     nonmanufacturer size standard; "FAR 36.204" for construction magnitude), which assert what the LAW
//     says, not what the document prints. A fail-closed presence gate would have deleted only true
//     sentences. It is not a safe universal rule and is not built as one.
//   • sentence-level negation detection, tried as a way to carve out "no 52.219-6 is present", was wrong
//     10/10 — it fires on "will NOT provide covered telecommunications equipment (FAR 52.204-24)", where the
//     negation belongs to the obligation, not to the citation. A word-presence test wearing a shape test's
//     clothes. Dropped.
//   • the GRAMMAR check needs no source lookup and no claim-mode guess, and it catches C1 exactly. That is
//     where E2's weight belongs.
// A first grammar draft rejected "FAR 9.5" (a real FAR subpart — Organizational and Consultant Conflicts of
// Interest) because it demanded three digits after the dot. Grammars below are deliberately PERMISSIVE:
// they reject only what is structurally impossible in that corpus, never what is merely unusual.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const CORPUS = "(?:FAR|DFARS|DFAR|AFFARS|VAAR|DLAD|C\\.?F\\.?R\\.?|U\\.?S\\.?C\\.?)";
// dotted forms first (longest-first), then the dash-only form that the first revision could not see
const NUM = "\\d{1,4}\\.\\d{1,4}-\\d{1,4}|\\d{1,4}\\.\\d{1,4}|\\d{2,4}-\\d{1,3}";
const TOKEN_RE = new RegExp(`(${CORPUS})\\s+(?:part\\s+|subpart\\s+|section\\s+|clause\\s+|table\\s+)?(${NUM})\\b`, "gi");

// PERMISSIVE grammars — reject only the structurally impossible.
//   FAR    48 CFR ch.1  parts 1-53; subpart/section 9.5 · 9.504 · 6.302-1 · 15.408; clauses 52.XXX-YY
//   DFARS  48 CFR ch.2  parts 201-253; sections 2XX.YYY(-YY) incl. subpart 215.2; clauses 252.XXX-7YYY
//   AFFARS 48 CFR ch.53 53XX.YYY; clauses 5352.XXX-YYYY
//   DLAD   48 CFR ch.54 5452.XXX-YYYY
//   VAAR   48 CFR ch.8  8XX.YYY; clauses 852.XXX-YY
//   CFR/USC carry their own title outside the token; any part.section shape is admissible
const SHAPE: Record<string, RegExp> = {
  FAR:    /^(?:52\.\d{3}-\d{1,3}|(?:[1-9]|[1-4]\d|5[0-3])\.\d{1,4}(?:-\d{1,2})?)$/,
  DFARS:  /^(?:252\.\d{3}-7\d{3}|2(?:0[1-9]|[1-4]\d|5[0-3])\.\d{1,4}(?:-\d{1,2})?)$/,
  DFAR:   /^(?:252\.\d{3}-7\d{3}|2(?:0[1-9]|[1-4]\d|5[0-3])\.\d{1,4}(?:-\d{1,2})?)$/,
  AFFARS: /^(?:5352\.\d{3}-\d{4}|53\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  DLAD:   /^(?:5452\.\d{3}-\d{4}|54\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  VAAR:   /^(?:852\.\d{3}-\d{1,3}|8\d{2}\.\d{1,4}(?:-\d{1,2})?)$/,
  CFR:    /^\d{1,4}\.\d{1,4}(?:-\d{1,3})?$/,
  USC:    /^\d{1,4}(?:\.\d{1,4})?$/,
};
// Which OTHER corpus would accept this number? A number that is invalid for its stated corpus but valid for
// exactly one other is not a typo — it is a body swap, and naming the true corpus is the whole finding.
function acceptedBy(num: string): string[] {
  return Object.entries(SHAPE).filter(([k, re]) => k !== "DFAR" && re.test(num)).map(([k]) => k);
}
// BOUNDARY-ANCHORED presence. `\b` alone is not enough at a dot: in "52.215-22" the char before "215" is
// ".", which IS a \b for a digit — so the guard has to be an explicit not-preceded-by-[.\d-] instead.
function presentInSource(num: string, src: string): boolean {
  const esc = num.replace(/[.\-]/g, "\\$&");
  return new RegExp(`(?<![.\\d-])${esc}(?![.\\d-])`).test(src);
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, any>[];

  let audits = 0, findings = 0, tokens = 0;
  const t = { absent: 0, malformed: 0, swap: 0 };
  const absent: string[] = [], malformed: string[] = [], swap: string[] = [];
  const seen: string[] = [];

  for (const row of rows) {
    const src: string = row.raw_pdf_text ?? "";
    const cj = row.compliance_json ?? {};
    // d0664ba2 keeps its findings at cj.v3.findings; other rows at cj.findings. Union BOTH plus showStoppers
    // — the first revision's `??` chain stopped at the first non-empty and would silently skip showStoppers.
    const fs_: any[] = [...(cj.findings ?? []), ...(cj.typed_findings ?? []), ...(cj.v3?.findings ?? []), ...(cj.v3?.showStoppers ?? [])];
    if (!src || !fs_.length) continue;
    audits++;
    const tag = `${String(row.id).slice(0, 8)} ${row.solicitation_number ?? "?"}`;
    seen.push(`${tag} findings=${fs_.length} src=${src.length}`);

    for (const f of fs_) {
      findings++;
      for (const [field, raw] of [["citation", f.citation], ["requirement", f.requirement]] as const) {
        const text = String(raw ?? "");
        for (const m of text.matchAll(TOKEN_RE)) {
          const prefix = m[1].replace(/\./g, "").toUpperCase();
          const num = m[2];
          tokens++;
          const ok = SHAPE[prefix] ? SHAPE[prefix].test(num) : true;
          const present = presentInSource(num, src);

          if (!ok) {
            const alt = acceptedBy(num);
            t.malformed++;
            malformed.push(`${tag} ${field}: "${m[0].trim()}" — ${prefix} grammar rejects "${num}"${alt.length ? `; valid for [${alt.join(", ")}]` : "; valid for NO corpus"} · in-source=${present}\n        :: ${text.slice(0, 170)}`);
          }
          if (!present) { t.absent++; if (absent.length < 30) absent.push(`${tag} ${field}: "${m[0].trim()}" :: ${text.slice(0, 130)}`); }
          if (present) {
            const near = new Set<string>();
            const re = new RegExp(`(${CORPUS})[\\s,]*(?:part |subpart |section |clause |table )?${num.replace(/[.\-]/g, "\\$&")}(?![.\\d-])`, "gi");
            for (const mm of src.matchAll(re)) near.add(mm[1].replace(/\./g, "").toUpperCase());
            if (near.size > 0 && !near.has(prefix)) {
              t.swap++;
              swap.push(`${tag} ${field}: emitted "${m[0].trim()}" — source pairs ${num} with [${[...near].join(", ")}]\n        :: ${text.slice(0, 170)}`);
            }
          }
        }
      }
    }
  }

  console.log(`audits ${audits} · findings ${findings} · corpus-prefixed tokens ${tokens}`);
  console.log(seen.map((s) => "   " + s).join("\n"));
  console.log(`\n  MALFORMED-for-stated-corpus ${t.malformed} · CORPUS-SWAP ${t.swap} · absent-from-source ${t.absent}`);
  const dump = (n: string, xs: string[]) => { console.log(`\n── ${n} (${xs.length}) ──`); xs.forEach((x) => console.log("  " + x)); };
  dump("MALFORMED", malformed);
  dump("CORPUS SWAP", swap);
  dump("ABSENT FROM SOURCE (context only — NOT a defect class, see header)", absent);
})();
