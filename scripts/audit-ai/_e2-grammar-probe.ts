import { gateCitationsInText } from "../../src/lib/audit-citation-fidelity";
const src = "The Contractor shall submit the Standard Form 1442 with its bid. Standard Form 1449 applies to commercial items. FAR 9.5 governs.";
for (const t of ["Submit SF 1442 per FAR 53.301-1442", "See DFARS 253.303-1449 for the form", "Per FAR 9.5 and FAR 6.302-1", "Comply with DFARS 215-2.", "Per FAR 52.219-14 and DFARS 252.204-7012"]) {
  console.log(JSON.stringify(t), "\n   →", JSON.stringify(gateCitationsInText(t, src)), "\n");
}
