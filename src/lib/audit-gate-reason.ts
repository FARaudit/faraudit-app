// REPORT-TRUTH #6 — the export gate must say WHAT is missing and what to do instead.
// Lives in lib/, NOT in the route: a Next.js route module may only export its handlers and route config, so an extra
// export there fails the build's route-type constraint (TS2344). Pure, no I/O, unit-tested in gate-reason.test.ts.
/** REPORT-TRUTH #6 (flag AUDIT_GATE_REASON_NAMED, default OFF ⇒ the legacy banner ⇒ byte-identical).
 *
 *  THE DEFECT. The gate banner is V1-era copy written for a TRANSIENT V2 timeout: "Deep analysis unavailable for this
 *  run · The core report below is complete and accurate · re-run to try again." REPORT-TRUTH #1 began routing a
 *  DETERMINISTIC, NAMED coverage gap into that same generic path, and on live run 583df921 every clause of it was
 *  wrong:
 *    • "Deep analysis unavailable" — false. The analysis ran. One binding document was read but never analyzed.
 *    • "complete and accurate"     — CONTRADICTS the gate it is explaining. The engine set documents_complete=false
 *                                     and named the document. Claiming completeness while withholding the export is
 *                                     the exact confident-wrong class this arc exists to remove — and it is the one
 *                                     surface still making a false claim after #1-#4 shipped.
 *    • "re-run to try again"       — invites the customer to SPEND on an identical outcome. The cause is
 *                                     deterministic: the same document will yield no findings on the next run too.
 *
 *  THE FIX. The engine already computes the precise reason (#1 writes documents.unanalyzed[] as {name, reason}).
 *  Surface THAT. A gate is only honest if it says what is missing and what the reader should do instead — telling
 *  someone a report is withheld, while telling them it is complete, is worse than saying nothing.
 *  Falls back to the legacy copy for V1 rows and for any gate whose cause is not named. */
export function gateCause(audit: Record<string, unknown>): { head: string; body: string } | null {
  if (process.env.AUDIT_GATE_REASON_NAMED !== "true") return null;
  const comp = (audit.compliance_json ?? {}) as Record<string, unknown>;
  if (comp.engine !== "agentic_v3") return null;
  const v3 = (comp.v3 ?? {}) as Record<string, unknown>;
  const docs = (v3.documents ?? {}) as Record<string, unknown>;
  const unanalyzed = Array.isArray(docs.unanalyzed) ? (docs.unanalyzed as Array<{ name?: string; reason?: string }>) : [];
  const missing = Array.isArray(docs.missing) ? (docs.missing as Array<{ name?: string; reason?: string }>) : [];
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Order matters: an UNREAD document is a harder failure than a read-but-unanalyzed one, so it is named first.
  if (missing.length) {
    const names = missing.map((m) => esc(String(m.name ?? "a posted document"))).join(", ");
    return {
      head: `${missing.length} posted document${missing.length > 1 ? "s were" : " was"} not retrieved`,
      body: `The audit could not read ${names}. Findings below cover only what was retrieved, so the export is held back rather than shipped as a full picture. Open ${missing.length > 1 ? "those documents" : "that document"} on SAM.gov before relying on this.`,
    };
  }
  if (unanalyzed.length) {
    const names = unanalyzed.map((u) => esc(String(u.name ?? "a binding document"))).join(", ");
    const one = unanalyzed.length === 1;
    return {
      head: `${unanalyzed.length} document${one ? "" : "s"} read but not analyzed`,
      // "produced no grounded finding from them" is FALSE for one class — a document credited only by an
      // excerpt it shares with a sibling did have a finding grounded in text it contains. "nothing below is
      // grounded in them SPECIFICALLY" is true of both classes, and the per-document reason (documents.unanalyzed[].reason)
      // carries the distinction for anyone who opens it.
      body: `${names} ${one ? "was" : "were"} retrieved in full, but nothing below is grounded in ${one ? "it" : "them"} specifically — so nothing below reflects ${one ? "its" : "their"} contents. The export is held back because the report is not a complete picture of this solicitation. Read ${one ? "that document" : "those documents"} directly before pricing or bidding. Re-running will not change this.`,
    };
  }
  if (comp.honest_fail === true) {
    return {
      head: `The engine did not reach a confident verdict`,
      body: `This run returned an honest INCOMPLETE rather than a confident guess, so the export is held back. The findings below are still grounded in the solicitation — treat them as partial coverage, not a decision.`,
    };
  }
  return null;
}
