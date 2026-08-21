// GATE — a named sole-source award to a firm that is NOT the customer is a NO_BID (CEO ruling
// 2026-08-21), and every path that cannot PROVE "not the customer" still lands on NHR.
//
// PLANTED POSITIVES, each restored, each turning its named leg red:
//   A  make firmMayBeVendor return false on empty input  → leg 4 (an unnameable firm gets NO_BID)
//   B  drop the suffix strip                             → leg 3 (two unrelated Inc.s "match")
//   C  compare with === instead of token overlap         → leg 2 (Raytheon vs Raytheon Company no-bids)
//   npx tsx src/lib/audit-sole-source-nobid.test.ts
import { firmMayBeVendor } from "./audit-sole-source-lock";
import { buildBidderProfileFromCapability } from "./audit-bidder-profile";

let fail = 0;
const ok = (l: string, c: boolean, why: string) => { if (c) console.log(`  ✓ ${l}`); else { fail++; console.error(`  ✗ ${l} — ${why}`); } };

// ── the comparator: "may be the same firm" holds the verdict at NHR ──
ok("1 a decisive mismatch is NOT the vendor",
   !firmMayBeVendor("FARaudit Inc.", "Raytheon"),
   "the one case the ruling exists for does not reach NO_BID");

ok("2 a suffix variant IS treated as possibly the same firm",
   firmMayBeVendor("Raytheon", "Raytheon Company"),
   "an exact-string compare would no-bid the vendor itself — the worst possible false positive");

ok("3 two unrelated firms sharing only a legal suffix do NOT match",
   !firmMayBeVendor("FARaudit Inc.", "Teledyne Inc."),
   "'Inc' is shared by every firm on earth; without the suffix strip nothing ever reaches NO_BID");

ok("4 an unnameable firm is treated as POSSIBLY the vendor",
   firmMayBeVendor("", "Raytheon") && firmMayBeVendor("   ", "Raytheon"),
   "a blank firm name must stay unevaluable → NHR, never NO_BID");

ok("5 a vendor that reduces to nothing significant stays unevaluable",
   firmMayBeVendor("FARaudit Inc.", "Inc."),
   "a vendor of only stopwords must not license a NO_BID");

ok("6 punctuation and case do not create a mismatch",
   firmMayBeVendor("teledyne d.g. o'brien", "Teledyne D.G. O'Brien"),
   "the same firm written differently would no-bid itself");

ok("7 containment on the joined form matches",
   firmMayBeVendor("RaytheonCo", "Raytheon"),
   "a joined spelling would escape the tokenizer and no-bid the vendor");

// ── the operand actually arrives from a capability row ──
const prof = buildBidderProfileFromCapability(
  { company_name: "FARaudit Inc.", certifications: ["SDVOSB"], attributes_v2: [], size_facts: null } as never,
  { solicitationNaics: "336413" },
);
ok("8 firmName is threaded out of the capability row",
   prof?.firmName === "FARaudit Inc.",
   `got ${JSON.stringify(prof?.firmName)} — without this the NO_BID branch is unreachable in production`);

const blank = buildBidderProfileFromCapability(
  { company_name: "   ", certifications: ["SDVOSB"], attributes_v2: [], size_facts: null } as never,
  { solicitationNaics: "336413" },
);
ok("9 a blank company_name yields NO firmName",
   blank?.firmName === undefined,
   "an empty string would be compared against the vendor and could decide a NO_BID");

console.log(fail ? `\n✗ ${fail} failed` : `\n✓ 9/9`);
process.exit(fail ? 1 : 0);
