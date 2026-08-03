---
name: panel-eab43ada-w50s6u26qa019-adjudication
description: Adjudication of audit eab43ada (W50S6U26QA019, CAANG landscaping SDVOSB) — F upheld on 5 AUTO-Fs; Rule 70 cap-not-mute proven structurally unreachable; exempt-from-gap docs counted in the ANALYZED numerator
metadata:
  type: project
---

Audit `eab43ada-2baf-49e2-b224-a968df7864f3`, engine agentic_v3, render v5, artifact 384,119 chars
(= the prompt's figure; bytes 384,608 — chars-vs-bytes, same file, artifact identity RECONCILED).
Render flags were pulled LIVE from Vercel by `render-audit.ts` (it now fails loud without `VERCEL_TOKEN`),
so the 583df921 laptop-flag trap is CLOSED — no finding died as a render artifact this round.

**Why F:** five AUTO-Fs, each verified against live SAM. The one worth remembering is that all 24 cited
clause tokens were REAL (set-difference against the 10-attachment package = empty, third consecutive clean
run) — the fabrications were in figures and frames, not clause numbers. A clause-fabrication census passing
is not evidence the report is honest.

**How to apply:**

- **The `documents.complete=false` path MUTES what Rule 70 says must CAP.** `audit-decide.ts:3572`
  (INCOMPLETE PRECEDENCE) returns INCOMPLETE on `inp.documentsComplete === false` and sits ABOVE the
  GATE_V2 branch where the CAP-NOT-MUTE release lives (gated on `v2.kind === "uncovered_obligation"`).
  `audit-executor-v3.ts:872` sets `payload.documents.complete = false` for every read-but-not-grounded
  document (block spans :868–874), directly under a comment asserting *"Per Rule 70 this CAPS the result…
  it does not mute it."* That comment is false in production. Any Rule-70 audit must trace which SIGNAL
  carries the uncovered-obligation fact, not just whether the flag is armed.
  `AUDIT_COVERAGE_CAP_NOT_MUTE=true` and it still muted.

- **A "no fabrication" credit is not the same as coverage — check what the clean census OMITTED.** The cyber
  seat graded C partly for the engine refusing to invent a CMMC gate. True and worth crediting (`CMMC`=0,
  `252.204-7021`=0 in the export). But the export also cites `252.204-7012` **zero times** while the clause
  — Safeguarding Covered Defense Information and Cyber Incident Reporting, carrying the 72-hour DIBNET
  report, 90-day image preservation and the NIST SP 800-171 flowdown — is verifiably in §I *and* in the
  engine's own primary region. The engine surfaced 252.204-**7008** (the §K representation) and missed
  7012 (the performance clause behind it). Restraint on the invented gate; omission on the real one.

- **A doc exempted from the gap list is still counted in the ANALYZED numerator.** `deriveAnalyzedDocuments`
  computes `analyzed = regions − uncovered`, and `documentsCovered` (`audit-orchestrator.ts:806`) `continue`s
  past every `!isBindingDoc(...)`. So the site-visit roster (SIGNIN_NONBINDING) and
  `Attachment_0005_..._Fillable_Form.docx` (OFFEROR_FILL_RE) vanished from the customer's gap list AND
  counted as analyzed: `analyzed: 3` over a `finding_provenance` that grounds in exactly TWO docs.
  Always tally `finding_provenance` by doc and diff it against `documents.analyzed`.

- **Two "download failed" documents were SAM-deleted supersedes — and the fix was inert on the worker.**
  Live probe: v3 manifest 12 entries, v2 `resourceLinks` 10, both orphans return **HTTP 400** with body
  `"The resource has been deleted."`, all 10 posted docs 200. `supersededManifestEntries` keys on that
  SENTENCE (not the status code — a prior cut keyed 404/410 and was inert), and its guards
  (`resourceLinksLen>0`, `ingestedCount>=resourceLinksLen` → 10>=10) would fire. It didn't, because
  `agents/audit-worker/worker.ts` omitted the third argument (fixed by unmerged `e381e74`). **Merging that
  fix will NOT green this report** — the 7 unanalyzed docs independently set `documents.complete=false`.

- **Test EVERY absence accusation against the engine's OWN assembled region before you ship it — I had four
  wrong.** Split `raw_pdf_text` on `==== DOCUMENT: … ====` and substring-test each accusation in the region
  it belongs to. Four of nineteen came back `*ABSENT*` and forced retractions/reclassifications, including
  one I had written up as "strengthened". Two recurring mechanisms, both worth more than the accusations:
  **(a) SF-30 form-field VALUE loss** — both amendment regions carry the Block 11 kill-gate verbatim and the
  Block 14 *heading* `14. DESCRIPTION OF AMENDMENT/MODIFICATION`, but NOT the text under it
  (`purpose of this amendment`, `Version 2`, `question(s) and answer` all False). Label kept, value dropped —
  the SAME class as the SF-1449 loss recorded on 583df921, one panel later.
  **(b) run-in heading hoist** — `(b) . The Vendor agrees to hold the prices in its offer firm for \t Period
  for acceptance of quotations \n 60 calendar days…`. The extractor lifts the bold run-in heading into the
  middle of its own sentence, severing subject from object. **35 occurrences in the primary region alone**,
  hitting 52.212-4 Definitions / Inspection-Acceptance / Assignment / Changes. Likely why `obligationsOf`
  starved across §I/§L. Report the MECHANISM, never "the clause is missing".
  **It has a PROVEN consequence — the hoist deletes grammatical SUBJECTS and manufactures false obligations.**
  52.212-1(e) really reads *"Debriefings. If a postaward debriefing is given to requesting Vendors, **the
  Government will** disclose the following information…"*; the engine's own source reads
  `Debriefings disclose the following information, if applicable:` — subject gone. Downstream, finding #65
  published a GOVERNMENT debriefing duty as a bidder "gate to clear". Before blaming a lens for
  mis-attributing a duty, diff the sentence against the real PDF: the actor may have been deleted upstream.
  Counter-check that saved a phantom: the primary region is 99,867 chars vs 129,653 from `pdftotext -layout`
  — **23% delta that is pure layout whitespace**; all 63 page markers and all 9 section headers survive.
  Measure structure, not char count, before calling content loss.

- **Hunt the KILL-GATES the report is silent about, by grepping the export for the string.** `acknowledg` = 0
  hits while BOTH SF-30s carry Block 11 *"FAILURE OF YOUR ACKNOWLEDGMENT … MAY RESULT IN REJECTION OF YOUR
  OFFER"* plus an explicit §14 sentence ordering it. `3 business days` = 0 hits while the notice body sets the
  questions cutoff at 1:00 PM PDT three business days before close — the only deadline that expired before the
  report went stale. `Amendment 0002` = 0 hits while Amendment 0002 replaced the controlling drawing, which
  the report separately flags as a P1 unknown. The Q&A the engine READ (1,308 clean chars) answers that exact
  question ("southwest corner of Building 22… marked with a red X") — 0 hits.

- **`amendment_disclosure` is write-only.** One occurrence in the whole repo (`audit-executor-v3.ts:955`,
  the writer); no v4/v5 renderer reads it. Grep persisted fields for readers before crediting a disclosure.

- **Solicitation-side, primary-sourced:** 52.219-6 sits in §I of a 100% SDVOSB set-aside; eCFR 52.219-6(b)
  reads *"This clause applies only to— (1) Contracts that have been totally set aside for small business
  concerns"* and (c)(1) makes non-small offers nonresponsive. FAR 19.507(e)(1) requires 52.219-14 on any
  subpart-19.14 set-aside *"regardless of dollar value"* — absent here. DoD Class Deviation **2026-O0037**
  (verified primary PDF, effective 2026-02-01) makes RFO FAR Part 19 controlling, so a CO cites RFO 19.104-3
  — but **acquisition.gov's RFO Part 19 page 504'd on nine attempts across four URL forms**, and the
  2026-O0037 memo does NOT restate 19.104-3 (0 occurrences — it is the DFARS 219 companion and points back
  at that same page). The RFO FAR text has a SINGLE point of failure. RFO paragraph letters stay UNVERIFIED;
  cite the codified FAR and 52.219-6's own (b), which needs no prescription lookup.

- **When a .gov primary is unreachable, check whether the SOLICITATION depends on that same URL — the outage
  is then itself a finding.** Here 52.252-1 tells offerors the full text of the incorporated provisions is at
  `https://www.acquisition.gov/far-overhaul/far-part-deviation-guide` (000/504 live) and
  `https://www.acq.osd.mil/dpap/dars/dfars_far_overhaul_class_deviations.html` (200). Twenty-four provisions
  are incorporated by reference, including the RFO-deviated 52.212-1 that governs quote content. The 52.252-1
  remedy is the CO ("Upon request, the Contracting Officer will make their full text available") — so the
  action is a written request before the questions cutoff, not a protest.

Related: [[feedback-renderer-asserts-source-properties-unconditionally]],
[[panel-583df921-phantom-artifact-adjudication]], [[feedback-coverage-measures-ingestion-not-analysis]],
[[feedback-cap-not-mute-no-materiality-classifier]]
