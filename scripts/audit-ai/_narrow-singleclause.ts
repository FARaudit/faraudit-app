// Escape test: instead of strip-then-recheck (whose guard delegates to a blind hasBarSignal), use a POSITIVE
// STRUCTURAL invariant — demote ONLY a sentence that is a SINGLE operative clause whose subject IS the
// universal recital. Any compound sentence (conjunction, semicolon, additional duty) NEVER demotes.
export {};
import { applyStampedConfig } from "./_instrument";
applyStampedConfig("live");
(async () => {
  // A second operative duty riding the sentence: a coordinating conjunction followed by a modal duty verb,
  // or any semicolon/colon-introduced clause. Positive detection of COMPOUNDNESS — not a bar vocabulary list.
  const COMPOUND_RE = /\b(?:and|or|;|:)\s*(?:the\s+\w+\s+)?(?:shall|must|will|is|are)\b|[;:]/i;
  const RESP_ONLY_RE = /^[^.;:]*\bdetermined?\s+to\s+be\s+responsible\b[^.;:]*$|^[^.;:]*\bdetermination\s+of\s+responsibility\b[^.;:]*$/i;
  const respNonBar = (ob: string) => RESP_ONLY_RE.test(ob.trim()) && !COMPOUND_RE.test(ob);

  const SPECS: Array<[string, string, boolean]> = [
    ["SP3300 responsibility recital (TARGET)", "Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for", true],
    ["ADV + bid guarantee", "Quoters must be determined to be responsible under FAR Part 9 and shall furnish a bid guarantee of 20 percent of the bid price.", false],
    ["ADV + nonmanufacturer rule", "A determination of responsibility will be made in accordance with FAR Part 9; the offeror must be a small business manufacturer or obtain an SBA nonmanufacturer waiver.", false],
    ["ADV + clearance", "The Contracting Officer will determine the offeror responsible only if the offeror holds an active TOP SECRET facility clearance at time of award.", false],
    ["REG R1 enumerated", "To be eligible for award, an offeror must: (1) be registered in SAM; (2) possess an active TOP SECRET facility clearance at the time of proposal submission.", false],
    ["REG R3 CMMC", "An active CMMC Level 2 certification is required for award; proposals from offerors without one will be rated technically unacceptable.", false],
    ["REG R4b DD-254", "The contractor shall comply with the attached DD Form 254; a SECRET facility clearance is required.", false],
    ["ADV responsibility + colon list of bars", "Quoters must be determined to be responsible: an active SECRET clearance is required.", false],
  ];
  let bad = 0;
  console.log(`${"SPECIMEN".padEnd(46)} ${"WANT".padEnd(8)} ${"GOT".padEnd(8)} RESULT`);
  console.log("─".repeat(84));
  for (const [n, t, want] of SPECS) {
    const got = respNonBar(t); const ok = got === want; if (!ok) bad++;
    console.log(`${n.padEnd(46)} ${(want?"DEMOTE":"KEEP").padEnd(8)} ${(got?"DEMOTE":"KEEP").padEnd(8)} ${ok?"✅":"❌"}`);
  }
  console.log("─".repeat(84));
  console.log(bad ? `❌ ${bad} wrong` : "✅ single-clause invariant separates the universal recital from every compound bar");
})();
