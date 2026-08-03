/**
 * $0 INVESTIGATION PROBE — does arming AUDIT_ATTACHMENT_COVERAGE actually give the LENSES a discovery path?
 *
 * Claim under test: with the flag ARMED, exactly ONE of the five lenses (contracts_attorney) receives the
 * binding-attachment name list + pre-injected text. The other four receive [] — so they hold a read_document
 * tool they can never name a target for. If true, arming alone cannot move a pricing-lane document
 * (a wage determination) off zero findings.
 *
 * Falsification legs are included: the probe must PASS a control that proves the ruler works.
 */

// module-load capture (audit-tools.ts:240) — env MUST be set before the import.
process.env.AUDIT_ATTACHMENT_COVERAGE = "true";

const FAKE_PACKAGE = [
  "==== DOCUMENT: W50S6U-26-Q-A019 Combined Synopsis Solicitation.pdf ====",
  "SECTION B - SUPPLIES OR SERVICES AND PRICES",
  "CLIN 0001 Grounds maintenance services, 12 months.",
  "SECTION I - CONTRACT CLAUSES",
  "52.222-42 Statement of Equivalent Rates for Federal Hires.",
  "==== DOCUMENT: Wage Determination 2015-5613 Rev 24.pdf ====",
  "SERVICE CONTRACT ACT WAGE DETERMINATION",
  "Groundskeeper .................... 19.67",
  "Laborer .......................... 23.05",
  "Health & Welfare ................. 5.55",
  "==== DOCUMENT: Statement of Work.pdf ====",
  "The Contractor shall mow all turf areas weekly.",
].join("\n");

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}`); }
};

async function main() {
  const tools = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-tools.ts");
  const lensMod = await import("/Users/josearodriguezjr./faraudit-app/src/lib/audit-lenses.ts");

  const ctx = { fullSource: FAKE_PACKAGE, groundingSource: FAKE_PACKAGE } as any;

  // ── CONTROL: the ruler works — the flag really is armed in this process, and enumeration really does find docs.
  ok("CONTROL: flag reads ARMED in-process", tools.ATTACHMENT_COVERAGE_ENABLED === true);
  const enumerated = tools.listBindingDocuments(ctx);
  ok(`CONTROL: enumeration finds the attachments (got ${enumerated.length}: ${enumerated.join(" | ")})`, enumerated.length >= 1);
  const wdName = enumerated.find((n: string) => /wage determination/i.test(n));
  ok("CONTROL: the wage determination IS enumerable by the engine", !!wdName);

  // ── CONTROL: the WD numbers are reachable to find_in_source from ANY lens (so this is not an ingest gap).
  const hit = tools.runAuditTool(ctx, "find_in_source", { phrase: "19.67" }) as { hits: string[] };
  ok("CONTROL: find_in_source reaches the WD rate 19.67 (not an ingest gap)", hit.hits.length > 0);

  // ── THE CLAIM: which lenses get the names?
  const COVERAGE_LENS_KEY = process.env.AUDIT_COVERAGE_LENS_KEY || "contracts_attorney";
  const keys: string[] = lensMod.LENS_KEYS;
  ok(`panel is the standing five (${keys.join(", ")})`, keys.length === 5);

  const routed = keys.map((key) => {
    // exact reproduction of audit-expert.ts:70-71
    const isCoverageLens = tools.ATTACHMENT_COVERAGE_ENABLED && key === COVERAGE_LENS_KEY;
    const bindingDocs = isCoverageLens ? tools.listBindingDocuments(ctx) : [];
    return { key, docsSeen: bindingDocs.length };
  });

  console.log("\n── WITH THE FLAG ARMED, what each lens is handed ──");
  for (const r of routed) console.log(`   ${r.key.padEnd(20)} binding docs named to it: ${r.docsSeen}`);

  const withNames = routed.filter((r) => r.docsSeen > 0).map((r) => r.key);
  const blind = routed.filter((r) => r.docsSeen === 0).map((r) => r.key);
  ok(`ARMED: exactly one lens is handed the attachment list (${withNames.join(", ") || "none"})`, withNames.length === 1);
  ok(`ARMED: the other four are handed nothing (${blind.join(", ")})`, blind.length === 4);
  ok("ARMED: pricing_analyst — the wage-determination lane — is one of the blind four", blind.includes("pricing_analyst"));

  // ── THE SECOND HALF: is the pricing lens even TOLD wage determinations exist?
  const pricing = lensMod.AUDIT_LENSES.find((l: any) => l.key === "pricing_analyst")!;
  const pricingWithDiversity = lensMod.auditLenses({ personaDiversity: true }).find((l: any) => l.key === "pricing_analyst")!;
  const mentionsWage = (s: string) => /wage|service contract act|davis-bacon|\bSCA\b/i.test(s);
  ok("pricing_analyst base prompt never mentions wage determinations", !mentionsWage(pricing.system));
  ok("pricing_analyst persona-diversity prompt never mentions them either", !mentionsWage(pricingWithDiversity.system));
  // control on that ruler
  ok("CONTROL: the same matcher DOES fire on a sentence that mentions a wage determination",
     mentionsWage("Surface the applicable Service Contract Act wage determination."));

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
