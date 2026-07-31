// CERT — the Opus 5 swap: roles resolve, price family is right, context window is explicit, panel tier moved.
import { modelFor } from "../../src/lib/model-registry";
import { priceKeyFor, PRICE } from "../../src/lib/audit-cost";
import fs from "fs";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

ok("judge   → claude-opus-5", modelFor("judge") === "claude-opus-5");
ok("crossdoc→ claude-opus-5", modelFor("crossdoc") === "claude-opus-5");
ok("lens    unchanged (sonnet-4-6)", modelFor("lens") === "claude-sonnet-4-6");
ok("extractor unchanged (haiku-4-5)", modelFor("extractor") === "claude-haiku-4-5");
ok("finder  unchanged (sonnet-4-6)", modelFor("finder") === "claude-sonnet-4-6");

const pk = priceKeyFor("claude-opus-5");
ok(`claude-opus-5 resolves to a price family (${pk})`, pk !== null);
const p = PRICE[pk as string];
ok("that family prices at $5 in / $25 out (same as Opus 4.8)", !!p && p.in === 5 && p.out === 25);

const eng = fs.readFileSync("src/lib/audit-engine.ts", "utf8");
ok("context window declared explicitly for opus-5", /"claude-opus-5":\s*1_000_000/.test(eng));
const panel = fs.readFileSync("src/lib/agentic-panel-runner.ts", "utf8");
ok("panel opus tier → claude-opus-5", /tier === "opus"\) return process\.env\.AUDIT_JUDGE_MODEL \|\| "claude-opus-5"/.test(panel));
ok("panel sonnet/haiku tiers untouched", /AUDIT_PANEL_HAIKU \|\| "claude-haiku-4-5"/.test(panel) && /AUDIT_PANEL_SONNET \|\| "claude-sonnet-4-6"/.test(panel));

console.log(`\nCERT OPUS5: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
