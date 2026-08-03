// $0. CEO queue #5 gate 1 — what does a lens actually have, and what would fixing it cost?
//
// ESTABLISHED BY READING THE CODE, not recall:
//   · find_in_source searches ctx.fullSource — the WHOLE assembled package, attachments included. So a lens
//     CAN reach attachment text; it just has to already know what phrase to look for.
//   · read_section is scoped to UCF A–M (sectionsOf), so it cannot see an attachment at all.
//   · read_document reads a binding attachment BY NAME — and is only in the tool set when
//     ATTACHMENT_COVERAGE_ENABLED.
//   · listBindingDocuments(ctx) exists, is deterministic and $0 — and is NOT a tool. One call site
//     (audit-expert.ts:71), reached only by the single COVERAGE_LENS_KEY lens.
//
// So the gap is ENUMERATION: no lens can ask "what documents are in this package?" It must already know. That
// is why "wage" appears in no lens prompt — the pricing analyst is never told a wage determination exists.
//
// The rejected fix is on record: pre-injecting every binding doc's FULL TEXT into all five lenses was 5x
// redundant and blew the 270s budget (audit-expert.ts:73). This measures the cheaper thing — the NAME LIST
// alone — because the whole design hinges on whether that is 200 tokens or 20,000.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");
const CHARS_PER_TOKEN = 3.5;

function records(): Array<{ sol: string; src: string }> {
  const out: Array<{ sol: string; src: string }> = [];
  if (!existsSync(CORPUS)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const r = JSON.parse(readFileSync(p, "utf8"));
          const src = r?.input?.fullSource;
          if (typeof src === "string" && src) out.push({ sol: r?.meta?.sol ?? e.name, src });
        } catch { /* skip */ }
      }
    }
  };
  walk(CORPUS);
  return out;
}

/** Mirror of docRegionsOf + listBindingDocuments, over a banked package. */
function docNames(src: string): string[] {
  return [...src.matchAll(/^====\s*DOCUMENT:\s*(.+?)\s*====$/gm)].map((m) => m[1]);
}
/** Mirror of isBindingDoc's exclusions — drawings and pure forms are not obligation carriers. */
const NON_BINDING = /\.(png|jpg|jpeg|gif)$|drawing|sign[- ]?in/i;

(async () => {
  const recs = records();
  const seen = new Set<string>();
  const uniq = recs.filter((r) => (seen.has(r.sol) ? false : (seen.add(r.sol), true)));
  console.log(`banked packages: ${recs.length} (${uniq.length} distinct solicitations)\n`);

  const counts: number[] = [];
  const listChars: number[] = [];
  console.log("=== per solicitation: documents, binding subset, and the cost of NAMING them ===");
  console.log("  docs  binding  name-list chars  ≈tokens   solicitation");
  for (const r of uniq) {
    const names = docNames(r.src);
    if (!names.length) continue;
    const binding = names.filter((n) => !NON_BINDING.test(n));
    const list = binding.map((n) => `- ${n}`).join("\n");
    counts.push(binding.length);
    listChars.push(list.length);
    console.log(`  ${String(names.length).padStart(4)}  ${String(binding.length).padStart(7)}  ${String(list.length).padStart(15)}  ${String(Math.round(list.length / CHARS_PER_TOKEN)).padStart(7)}   ${r.sol.slice(0, 40)}`);
  }

  if (!listChars.length) { console.log("\n  no multi-document packages banked"); return; }
  listChars.sort((a, b) => a - b);
  counts.sort((a, b) => a - b);
  const p = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  console.log("\n=== THE NUMBER THE DESIGN HINGES ON ===");
  console.log(`  binding docs per package : min ${counts[0]} · p50 ${p(counts, 0.5)} · max ${counts[counts.length - 1]}`);
  console.log(`  name-list chars          : min ${listChars[0]} · p50 ${p(listChars, 0.5)} · max ${listChars[listChars.length - 1]}`);
  console.log(`  name-list TOKENS         : p50 ≈ ${Math.round(p(listChars, 0.5) / CHARS_PER_TOKEN)} · max ≈ ${Math.round(listChars[listChars.length - 1] / CHARS_PER_TOKEN)}`);
  console.log(`  × 5 lenses, worst case   : ≈ ${Math.round((listChars[listChars.length - 1] / CHARS_PER_TOKEN) * 5)} tokens added per run`);
  console.log("\n  For contrast, the REJECTED fix pre-injected these documents' FULL TEXT into all five lenses.");
  const fullChars = uniq.map((r) => {
    const names = docNames(r.src);
    if (names.length < 2) return 0;
    return Math.round(r.src.length * (1 - 1 / names.length)); // rough: everything but the primary
  }).filter(Boolean).sort((a, b) => a - b);
  if (fullChars.length) {
    console.log(`  full-text of attachments : p50 ≈ ${Math.round(p(fullChars, 0.5) / CHARS_PER_TOKEN).toLocaleString()} tokens · max ≈ ${Math.round(fullChars[fullChars.length - 1] / CHARS_PER_TOKEN).toLocaleString()} tokens`);
    console.log(`  × 5 lenses, worst case   : ≈ ${Math.round((fullChars[fullChars.length - 1] / CHARS_PER_TOKEN) * 5).toLocaleString()} tokens — which is why it blew the budget.`);
  }
})();
