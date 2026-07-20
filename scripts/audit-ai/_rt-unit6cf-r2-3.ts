/* RED-TEAM R2 attack 3 — fdNormTokens residual invisibility. The R1 fix keeps ≥2-char / digit / 1-char
 * tokens (filter is now effectively "every non-empty a-z0-9 token"). Residual attack surface = tokens whose
 * ENTIRE identity is NON-alphanumeric (stripped by the /[^a-z0-9]+/ split): comparison operators (≤ vs ≥),
 * unicode Roman numerals (Ⅱ vs Ⅲ), accented distinguishers. If the only distinguisher is such a token, the
 * two facets have EQUAL token sets → fdIsRestatement true both ways → the later facet is DROPPED (invariant 3:
 * no distinct obligation's requirement text vanishes). */
import { applyCrossFleetDedup, type TypedFinding } from "../../src/lib/audit-decide";

let breaks = 0; let holds = 0;
const F = (o: Partial<TypedFinding>): TypedFinding => ({ id: Math.random().toString(36).slice(2), requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, ...o } as TypedFinding);
const run = (fs: TypedFinding[]) => applyCrossFleetDedup(fs, { enabled: true });
const check = (label: string, reqA: string, reqB: string, mustKeepBoth: boolean) => {
  const out = run([F({ requirement: reqA }), F({ requirement: reqB })]);
  const t = out.map((f) => f.requirement).join(" ||| ");
  const hasA = t.includes(reqA), hasB = t.includes(reqB);
  const okNow = mustKeepBoth ? (hasA && hasB) : true;
  console.log(`${okNow ? "✅ holds" : "🔥 BREAK (facet vanished)"} ${label} → rows=${out.length} kept=[A:${hasA} B:${hasB}]`);
  okNow ? holds++ : breaks++;
};

// R1-fix regression checks (must hold):
check("negation 'no' (2-char, R1 P1 fix)", "No extensions will be granted after July 22, 2026", "Extensions will be granted after July 22, 2026", true);
check("2-char distinguisher QA vs IT", "QA staff on site by July 22, 2026", "IT staff on site by July 22, 2026", true);
check("single-char option A vs B", "Deliver option A by July 22, 2026", "Deliver option B by July 22, 2026", true);
check("digit-bearing 24/7", "Provide 24/7 desk coverage starting July 22, 2026", "Provide desk coverage starting July 22, 2026", true);
check("C&A splits to c+a (distinct from 'ca')", "Complete C&A package by July 22, 2026", "Complete CA package by July 22, 2026", true);
// FRESH attacks — purely-symbolic distinguishers:
check("≤ vs ≥ (meaning-inverting operator)", "Maintain storage temperature ≤ 30 degrees until July 22, 2026", "Maintain storage temperature ≥ 30 degrees until July 22, 2026", true);
check("unicode Roman numeral Ⅱ vs Ⅲ", "Phase Ⅱ report due July 22, 2026", "Phase Ⅲ report due July 22, 2026", true);
check("± vs exact", "Calibrate to ± 5 units by July 22, 2026", "Calibrate to 5 units by July 22, 2026", true);
check("accented-only distinguisher ñ", "Cañon site survey due July 22, 2026", "Canon site survey due July 22, 2026", true);

console.log(`\nR2-3: ${breaks} BREAK(s), ${holds} hold(s)`);
process.exit(0);
