// Is the published "What the source says is:" quote actually a substring of the source? The heading-merge joins a
// heading to the next line with a space, and that merged segment can be selected as the proof quote — producing a
// "verbatim" quote that never appears contiguously in the document. In a module whose whole purpose is truth, that
// is the defect the arc exists to remove, reintroduced by my own fix.
import { groundModalForce } from "../../src/lib/audit-force-grounding";
const SRC = "SITE VISIT\nA site visit will be held on 13 August 2026 at the Valley Resident Office.\nSubmit offers by 20 August.";
const r = groundModalForce([{ id: "q", requirement: "Mandatory site visit.", excerpt: "" }], SRC);
console.log("fired:", r.corrected.length);
if (r.corrected.length) {
  const out = String(r.findings[0].requirement);
  const m = out.match(/What the source says is: "([^"]+)"/);
  const quote = m ? m[1] : "(no quote emitted)";
  console.log("quote  :", JSON.stringify(quote));
  const contiguous = SRC.includes(quote);
  const wsFlexible = new RegExp(quote.split(/\s+/).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+")).test(SRC);
  console.log("substring of source (exact)        :", contiguous);
  console.log("substring ignoring whitespace runs :", wsFlexible, wsFlexible?"":"  <-- NOT VERBATIM: text joined across a structural break");
}
