// $0 gate for the agentic expert tool surface (Brain card 43, Layer-1 substrate). Deterministic grounding.
import { readSection, lookupClause, findInSource, runAuditTool, type AuditToolContext } from "@/lib/audit-tools";
const SRC = "SECTION C - STATEMENT OF WORK\nThe contractor shall furnish one mini-excavator with a fully enclosed cab.\n"
  + "52.219-6 Notice of Total Small Business Set-Aside applies. Offerors must register in SAM per 52.204-7.\n"
  + "SECTION M - EVALUATION\nAward is Lowest-Priced Technically Acceptable (LPTA).";
const ctx: AuditToolContext = { fullSource: SRC };
let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

ok("lookup present 52.219-6", lookupClause(ctx, "52.219-6").present, true);
ok("lookup present 52.204-7", lookupClause(ctx, "52.204-7").present, true);
ok("lookup ABSENT 52.219-14", lookupClause(ctx, "52.219-14").present, false);
ok("present clause has excerpt", lookupClause(ctx, "52.219-6").excerpt.includes("Small Business"), true);
ok("absent clause no excerpt", lookupClause(ctx, "52.219-14").excerpt, "");
ok("find_in_source grounds a real phrase", findInSource(ctx, "fully enclosed cab").hits.length > 0, true);
ok("find_in_source empty for absent phrase", findInSource(ctx, "blockchain quantum widget").hits, []);
ok("read_section C present", readSection(ctx, "C").present, true);
ok("read_section C has SOW text", readSection(ctx, "C").text.toLowerCase().includes("mini-excavator"), true);
ok("dispatch lookup_clause", (runAuditTool(ctx, "lookup_clause", { clause: "52.219-6" }) as { present: boolean }).present, true);
ok("dispatch unknown tool", (runAuditTool(ctx, "nope", {}) as { error?: string }).error !== undefined, true);

console.log(`audit-tools gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — deterministic tool grounding: clause presence, source-span grounding, section reads, dispatch.");
