// Brain card 81 Step 3 ($0) — persona-diversity lens-spec structure. NO paid run (the lens layer's coverage
// effect is proven on the single end-to-end paid confirmation after Step 4).
//   npx tsx scripts/audit-ai/test-persona-diversity.ts
import { AUDIT_LENSES, auditLenses, LENS_KEYS } from "../../src/lib/audit-lenses";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  [${c ? "PASS" : "FAIL"}] ${m}`); if (!c) fail++; };

// ── flag OFF ⇒ byte-identical to AUDIT_LENSES ──
const off = auditLenses();
const offExplicit = auditLenses({ personaDiversity: false });
ok(JSON.stringify(off) === JSON.stringify(AUDIT_LENSES), "flag OFF (default) → byte-identical to AUDIT_LENSES");
ok(JSON.stringify(offExplicit) === JSON.stringify(AUDIT_LENSES), "flag OFF (explicit false) → byte-identical");

// ── flag ON ⇒ each lens gets an EXCLUSIVE must-extract ownership; base prompt preserved ──
const on = auditLenses({ personaDiversity: true });
ok(on.length === AUDIT_LENSES.length && on.every((l, i) => l.key === AUDIT_LENSES[i].key), "ON preserves the 5 lenses + keys");
ok(on.every((l, i) => l.system.startsWith(AUDIT_LENSES[i].system)), "ON only APPENDS (base lens prompt preserved verbatim)");
ok(on.every((l) => /PERSONA-DIVERSITY — YOUR EXCLUSIVE OWNERSHIP/.test(l.system)), "every lens carries an exclusive ownership block");

// ── heterogeneity: no two lenses share the same must-extract addendum ──
const addenda = on.map((l, i) => l.system.slice(AUDIT_LENSES[i].system.length).trim());
ok(new Set(addenda).size === addenda.length, `all ${addenda.length} must-extract checklists are DISTINCT (no two lenses share one)`);

// ── explicit ownership assignments (Brain's two named owners) ──
const sys = (k: string) => on.find((l) => l.key === k)!.system;
ok(/PERSONNEL & QUALIFICATION GATES/.test(sys("capture_strategist")), "personnel/quals OWNED by capture_strategist");
ok(/SCHEDULE & DELIVERY FEASIBILITY/.test(sys("former_ko")), "schedule/delivery-feasibility OWNED by former_ko");
// the two owned dimensions appear in EXACTLY one lens each (no sharing)
ok(on.filter((l) => /PERSONNEL & QUALIFICATION GATES/.test(l.system)).length === 1, "personnel/quals ownership is exclusive (exactly 1 lens)");
ok(on.filter((l) => /SCHEDULE & DELIVERY FEASIBILITY/.test(l.system)).length === 1, "schedule/delivery ownership is exclusive (exactly 1 lens)");
// the owned checklists cover the sweep archetypes (belt-and-suspenders with Steps 1+2)
ok(/twenty \(20\) years|minimum-experience|QPL\/QML|brand-name-or-equal/.test(sys("capture_strategist")), "personnel owner names the failing #4 archetype (experience-years/QPL/or-equal)");
ok(/First-Article\/FAT|non-waivable|30 days ARO|delivery window/.test(sys("former_ko")), "schedule owner names the failing NO_BID archetype (FAT/non-waivable/ARO window)");

ok(LENS_KEYS.length === 5, "5-lens panel intact");

console.log("");
if (fail) { console.error(`✗ ${fail} check(s) FAILED`); process.exit(1); }
console.log("✓ STEP 3 GREEN — flag-off byte-identical; ON gives each lens an EXCLUSIVE, DISTINCT must-extract ownership (personnel→capture_strategist, schedule/delivery→former_ko, no sharing); base prompts preserved. Quality layer only; real coverage effect proven on the post-Step-4 paid confirmation. $0.");
