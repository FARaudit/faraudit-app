// STEP 1+2 PROBE — can the narrowing be built as TYPED CLASS EXCLUSIONS on the ratified 3-step shape
// (FRAME + SUBSTANCE + strip-then-require-no-surviving-bar-signal), WITHOUT a phrase blocklist?
export {};
import { applyStampedConfig } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const m = await import("../../src/lib/audit-gate-v2");
  const { hasBarSignal, importanceOf } = m;

  // Candidate class (a): FAR Part 9 RESPONSIBILITY-DETERMINATION recital.
  const RESP_FRAME = /\b(?:determined?|determination)\s+(?:to\s+be\s+|of\s+)?responsib(?:le|ility)\b|\bresponsibility\s+determination\b|\bafirmative\s+determination\b/i;
  const RESP_SUBSTANCE = /\b(?:determined?\s+to\s+be\s+)?responsib(?:le|ility)\b|\bFAR\s+(?:Part\s+)?9(?:\.\d+(?:-\d+)?)?\b|\bstandards?\s+of\s+responsibility\b/gi;
  // Candidate class (b): GENERAL government evaluation-methodology prose.
  const EVAL_FRAME = /\bthe\s+government\s+(?:will|shall|may)\s+(?:evaluate|assess|consider)\b|\b(?:shall|will|may)\s+be\s+evaluated\b/i;
  const EVAL_SUBSTANCE = /\bthe\s+government\s+(?:will|shall|may)\s+(?:evaluate|assess|consider)\b|\b(?:shall|will|may)\s+be\s+evaluated\b|\bto\s+determine\s+(?:the\s+)?acceptability\b|\bpast\s+performance\b/gi;

  const strip = (ob: string, re: RegExp) => ob.replace(new RegExp(re.source, "gi"), " ");
  const respNonBar = (ob: string) => RESP_FRAME.test(ob) && !hasBarSignal(strip(ob, RESP_SUBSTANCE));
  const evalNonBar = (ob: string) => EVAL_FRAME.test(ob) && !hasBarSignal(strip(ob, EVAL_SUBSTANCE));
  const narrowed = (ob: string) => respNonBar(ob) || evalNonBar(ob);

  type S = { label: string; text: string; mustDemote: boolean };
  const SPECS: S[] = [
    // MUST DEMOTE — the two measured universal-boilerplate obligations from SP3300-26-Q-0165.
    { label: "SP3300 · FAR 9 responsibility recital", mustDemote: true,
      text: "Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for" },
    { label: "SP3300 · past-performance eval methodology", mustDemote: true,
      text: "The Government will evaluate the quoter’s Past Performance to determine acceptability of the quote in" },
    // MUST NOT DEMOTE — the 4 veto-protected register specimens (the narrowing's whole justification).
    { label: "REG R1 enumerated eligibility list", mustDemote: false,
      text: "To be eligible for award, an offeror must: (1) be registered in SAM; (2) possess an active TOP SECRET facility clearance at the time of proposal submission; (3) hold a current FAA Part 145 certificate." },
    { label: "REG R3 CMMC acceptability gate", mustDemote: false,
      text: "An active CMMC Level 2 certification is required for award; proposals from offerors without one will be rated technically unacceptable." },
    { label: "REG R4b DD-254 modal", mustDemote: false,
      text: "The contractor shall comply with the attached DD Form 254; a SECRET facility clearance is required." },
    { label: "REG R4b DD-254 verb-less", mustDemote: false,
      text: "DD Form 254, block 1 — Facility Clearance Required: SECRET." },
    // ADVERSARIAL — genuine bars deliberately DRESSED as responsibility / eval-methodology prose.
    { label: "ADV bar dressed as responsibility determination", mustDemote: false,
      text: "The Contracting Officer will determine the offeror responsible only if the offeror holds an active TOP SECRET facility clearance at time of award." },
    { label: "ADV bar dressed as eval methodology (clearance)", mustDemote: false,
      text: "The Government will evaluate whether the offeror possesses an active SECRET facility clearance; offerors without one are ineligible for award." },
    { label: "ADV bar dressed as eval methodology (CMMC)", mustDemote: false,
      text: "The Government will assess each quoter’s CMMC Level 2 certification status to determine acceptability." },
    { label: "ADV responsibility recital WITH a bonding bar riding along", mustDemote: false,
      text: "Quoters must be determined to be responsible under FAR Part 9 and shall furnish a bid guarantee of 20 percent of the bid price." },
    { label: "ADV eval methodology WITH 8(a) set-aside riding along", mustDemote: false,
      text: "The Government will evaluate past performance; only SBA-certified 8(a) concerns may submit an offer." },
    { label: "ADV responsibility + nonmanufacturer rule", mustDemote: false,
      text: "A determination of responsibility will be made in accordance with FAR Part 9; the offeror must be a small business manufacturer or obtain an SBA nonmanufacturer waiver." },
  ];

  console.log("═".repeat(118));
  console.log("NARROWING PROBE — typed class exclusions (frame + substance + strip-then-no-surviving-bar-signal)");
  console.log("═".repeat(118));
  console.log(`${"SPECIMEN".padEnd(50)} ${"WANT".padEnd(11)} ${"resp".padEnd(6)} ${"eval".padEnd(6)} ${"NARROWED".padEnd(9)} RESULT`);
  console.log("─".repeat(118));
  let bad = 0;
  for (const s of SPECS) {
    const r = respNonBar(s.text), e = evalNonBar(s.text), n = narrowed(s.text);
    const ok = n === s.mustDemote;
    if (!ok) bad++;
    console.log(`${s.label.slice(0,50).padEnd(50)} ${(s.mustDemote?"DEMOTE":"KEEP").padEnd(11)} ${String(r).padEnd(6)} ${String(e).padEnd(6)} ${String(n).padEnd(9)} ${ok?"✅":"❌ WRONG"}`);
  }
  console.log("─".repeat(118));
  console.log(bad ? `❌ ${bad} specimen(s) wrong — the narrowing as drafted is UNSAFE or INEFFECTIVE`
                  : "✅ all specimens correct — narrowing demotes both universal recitals and releases NO genuine bar");
  console.log("\n(importanceOf/hasBarSignal on the two targets, for the record:)");
  for (const s of SPECS.slice(0,2)) console.log(`  ${s.label}: importanceOf=${importanceOf(s.text)} hasBarSignal=${hasBarSignal(s.text)}`);
})();
