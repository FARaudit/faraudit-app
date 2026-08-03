// SEAT B — adversarial probe of reconcileAbsenceClaims. Read-only, $0, no model call.
// Goal: find inputs where the function REWRITES a claim it should not (deleting a true warning).
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";

type Case = {
  label: string;
  src: string;
  claim: string;
  prov?: string[];
  setAside?: string | null;
  expect: "STAND DOWN" | "fire";
  why: string;
};

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;

const PWS = doc("PWS KO Approved - 20260720.pdf", "PWS BODY. ".repeat(200));
const WD = doc("WAGE DETERMINATIONS - 20260513.pdf", "WD BODY. ".repeat(200));
const EXH1 = doc("Exhibit 1 - Government Furnished Property.pdf", "GFP BODY. ".repeat(200));
const WD4281 = doc("Wage Determination 2015-4281 Rev 22.pdf", "WD 4281 BODY. ".repeat(200));

const cases: Case[] = [
  // ---- controls: the module's own documented safe/unsafe examples -------------------------------
  {
    label: "C1 control — genuine false absence about the PWS (SHOULD fire)",
    src: PWS + WD,
    claim: "PWS (Attachment 0001) is referenced but not provided in the assigned source — the offeror cannot build a compliant compliance matrix without it.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "fire",
    why: "the intended true positive",
  },
  {
    label: "C2 control — coordinated subject, second copula present (SHOULD stand down)",
    src: PWS,
    claim: "The PWS is complete and the drawings are not provided.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "claim is about the drawings",
  },

  // ---- A. elided copula in the second clause ----------------------------------------------------
  {
    label: "A1 — second clause elides the copula ('but the drawings not attached')",
    src: PWS,
    claim: "The PWS is provided but the drawings not attached.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "asserts the DRAWINGS are missing; drawings are genuinely absent from the source",
  },
  {
    label: "A2 — comma-joined second clause, copula elided",
    src: PWS,
    claim: "The PWS is attached, the drawings not provided.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "same, comma variant",
  },
  {
    label: "A3 — realistic lens prose, elided copula",
    src: PWS + WD,
    claim: "The PWS is included but the referenced site drawings not furnished, so the offeror cannot estimate labor hours.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "drawings genuinely missing",
  },

  // ---- B. residue check ignores DIGITS -----------------------------------------------------------
  {
    label: "B1 — different EXHIBIT NUMBER (digits are not residue)",
    src: EXH1,
    claim: "Exhibit 2 is not provided with the solicitation.",
    prov: ["Exhibit 1 - Government Furnished Property.pdf"],
    expect: "STAND DOWN",
    why: "Exhibit 2 really is absent; only Exhibit 1 is in the source",
  },
  {
    label: "B2 — different WAGE DETERMINATION number",
    src: WD4281,
    claim: "Wage Determination 2015-4282 is not provided, so rates for the second locality are unknown.",
    prov: ["Wage Determination 2015-4281 Rev 22.pdf"],
    expect: "STAND DOWN",
    why: "a second, genuinely-absent WD",
  },

  // ---- C. multi-claim finding: the SECOND, true absence claim is discarded ------------------------
  {
    label: "C3 — false claim (PWS) + TRUE claim (drawings) in one requirement",
    src: PWS,
    claim: "PWS (Attachment 0001) is referenced but not provided. Attachment 0004, the site drawings, is also not provided.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "fire",
    why: "fires correctly on PWS, but watch what happens to sentence 2",
  },

  // ---- D. parenthetical stripping swallows the real subject ---------------------------------------
  {
    label: "D1 — whole subject inside parentheses",
    src: PWS,
    claim: "(The drawings referenced throughout the PWS) are not provided.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "about the drawings",
  },
  {
    label: "D2 — bracketed subject",
    src: PWS,
    claim: "[Attachment 0004 — the drawings cited in the PWS] is not attached.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "about the drawings",
  },

  // ---- E. 200-char subject window truncation ------------------------------------------------------
  {
    label: "E1 — real subject pushed past MAX_SPAN=200",
    src: PWS,
    claim:
      "The site drawings enumerated in Table 3 of the market research report, comprising sheets C-1 through C-14 for civil, S-1 through S-48 for structural, M-1 through M-22 for mechanical and E-1 through E-30 for electrical, and the PWS are not provided.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    expect: "STAND DOWN",
    why: "coordinated subject whose head noun sits >200 chars before the predicate",
  },

  // ---- F. set-aside arm: no residue check at all ---------------------------------------------------
  {
    label: "F1 — set-aside SIZE STANDARD unstated (different fact)",
    src: PWS,
    claim: "The size standard applicable to this set-aside is not stated anywhere in the solicitation.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    setAside: "Total Small Business",
    expect: "STAND DOWN",
    why: "the size standard, not the set-aside type, is what is missing",
  },
  {
    label: "F2 — limitations on subcontracting unstated",
    src: PWS,
    claim: "The limitations on subcontracting percentage for this set-aside are not specified.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    setAside: "SDVOSB",
    expect: "STAND DOWN",
    why: "52.219-14 content is genuinely missing",
  },
  {
    label: "F3 — set-aside arm's sentence filter deletes an unrelated true warning",
    src: PWS,
    claim: "Set-aside type is not stated in Section B. The place of performance is not specified anywhere in the package. The delivery schedule is not identified.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    setAside: "8(a)",
    expect: "fire",
    why: "fires on sentence 1; watch sentences 2 and 3",
  },
  {
    label: "F4 — resolved set-aside is UNRESTRICTED",
    src: PWS,
    claim: "The set-aside status is not stated in the notice.",
    prov: ["PWS KO Approved - 20260720.pdf"],
    setAside: "Unrestricted",
    expect: "fire",
    why: "check the wording produced",
  },

  // ---- G. token substring / cross-document collision ------------------------------------------------
  {
    label: "G1 — singular claim vs a differently-scoped doc of the same name family",
    src: doc("Drawing Index.pdf", "INDEX ONLY. ".repeat(100)),
    claim: "The drawing package is not provided.",
    prov: [],
    expect: "STAND DOWN",
    why: "an index is not the drawings",
  },
];

let fired = 0;
for (const c of cases) {
  const r = reconcileAbsenceClaims(
    [{ id: "F1", requirement: c.claim }],
    c.src,
    new Set(c.prov ?? []),
    c.setAside ?? null,
  );
  const didFire = r.refuted.length > 0;
  const verdict = didFire ? "FIRED" : "stood down";
  const bad = (c.expect === "STAND DOWN" && didFire) || (c.expect === "fire" && !didFire);
  if (didFire) fired++;
  console.log(`\n${bad ? "### DEFECT" : "ok      "}  ${c.label}`);
  console.log(`   expect: ${c.expect}   actual: ${verdict}`);
  console.log(`   IN : ${JSON.stringify(c.claim)}`);
  if (didFire) {
    console.log(`   OUT: ${JSON.stringify(r.findings[0].requirement)}`);
    console.log(`   doc: ${r.refuted[0].doc}  kind=${r.refuted[0].kind}`);
  }
  console.log(`   note: ${c.why}`);
}
console.log(`\n--- ${fired}/${cases.length} fired ---`);
