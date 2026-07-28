// Red-team probe on PR #293: is MAX_MERGED_REQS actually enforced when the INCOMING requirement is itself
// already an engine-merged multi-facet string? 0.3% of banked requirements are (applyFindingDedup joins with " · ").
import { dedupeByExcerpt } from "@/lib/v4-report/build-data";
const EX = "The offeror shall submit the technical volume not later than 2:00 PM local time.";
const mk = (req: string) => ({ req, cite: "L-1", excerpt: EX } as never);

// survivor arrives with 2 facets; incoming carries 2 MORE facets in one pre-merged string.
const out = dedupeByExcerpt([mk("A · B"), mk("C · D")]) as Array<{ req: string }>;
const facets = out[0].req.split(/\s*·\s*/).filter(Boolean);
console.log("rows:", out.length);
console.log("merged req:", JSON.stringify(out[0].req));
console.log("facet count:", facets.length, "(cap is 3)");
console.log(facets.length > 3 ? "❌ CAP EXCEEDED — the guard counted 1 append, the reader gets 4 obligations"
                              : "✅ cap held");

// duplicate-facet detection across a pre-merged incoming string
const out2 = dedupeByExcerpt([mk("A · B"), mk("B · C")]) as Array<{ req: string }>;
console.log("\ndup-facet case merged req:", JSON.stringify(out2[0].req));
console.log(/B.*B/s.test(out2[0].req) ? "❌ facet 'B' duplicated in one row" : "✅ no duplicate facet");
