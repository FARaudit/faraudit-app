/* R3 residual hunt: facet swallow (#4), idempotency, order-stability, flag-OFF byte-identity, ReDoS, regex residuals. */
import { applyFindingDedup } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";
const base = (o: any): TypedFinding => ({ id: o.id, requirement: o.requirement, citation: o.citation, excerpt: o.excerpt ?? "", kind: o.kind ?? "submission", controllability: o.controllability ?? "bidder_controls", grounded: true, lens: "L", ...o });

// ── #4 facet swallow: 1-2 char distinguisher (CLIN "1"/"2", "Sec A"/"Sec B") ──
const c1 = base({ id: "1", citation: "FAR 52.216-1", requirement: "deliver quantity for option 1" });
const c2 = base({ id: "2", citation: "FAR 52.216-1", requirement: "deliver quantity for option 2" });
let dd = applyFindingDedup([c1, c2], { enabled: true });
console.log("#4a option 1/2 facets:", (dd[0] as any).requirement);
const a = base({ id: "a", citation: "FAR 52.216-2", requirement: "requirement applies to Sec A" });
const b = base({ id: "b", citation: "FAR 52.216-2", requirement: "requirement applies to Sec B" });
dd = applyFindingDedup([a, b], { enabled: true });
console.log("#4b Sec A/B facets:", (dd[0] as any).requirement);

// ── idempotency after the R2 bundle change ──
const g = [
  base({ id: "x1", citation: "FAR 52.217-8", requirement: "option to extend services", controllability: "bidder_controls", kind: "pricing", severity: "P0" }),
  base({ id: "x2", citation: "FAR 52.217-8", requirement: "option to extend services restated", controllability: "bidder_controls", kind: "submission", severity: "P2" }),
  base({ id: "x3", citation: "FAR 52.217-8", requirement: "extension distinct facet here", controllability: "bidder_controls", kind: "other" }),
];
const once = applyFindingDedup(g, { enabled: true });
const twice = applyFindingDedup(once, { enabled: true });
console.log("idempotent len:", once.length, twice.length, "req-equal:", (once[0] as any).requirement === (twice[0] as any).requirement, "keys-stable:", JSON.stringify(once) === JSON.stringify(twice));

// ── order-stability: shuffle input order, survivor content stable? ──
const rev = [...g].reverse();
const ddRev = applyFindingDedup(rev, { enabled: true });
console.log("order: fwd-survivor-req:", (once[0] as any).requirement.slice(0, 60), "| rev-survivor-req:", (ddRev.find((f: any) => f.findingDedupMerged) as any).requirement.slice(0, 60));

// ── flag-OFF byte identity ──
const off = applyFindingDedup(g, { enabled: false });
console.log("flag-OFF same ref:", off === g);

// ── ReDoS on FD_CLAUSE_RE with a pathological blob ──
const evil = base({ id: "e", citation: "5".repeat(50000) + ".222-2".repeat(5000), requirement: "2".repeat(40000) });
const t0 = Date.now();
applyFindingDedup([evil, base({ id: "e2", citation: "FAR 52.222-2", requirement: "x" })], { enabled: true });
console.log("ReDoS ms:", Date.now() - t0);

// ── regex residual: 52.1xx provisions (are they real finding classes the gate misses?) ──
const prov = [
  base({ id: "p1", citation: "FAR 52.104", requirement: "provision 52.104 restated" }),
  base({ id: "p2", citation: "FAR 52.104", requirement: "provision 52.104 restated again" }),
];
const ddProv = applyFindingDedup(prov, { enabled: true });
console.log("52.1xx merged?", ddProv.length, "(2 = not merged, out of scope by design)");
