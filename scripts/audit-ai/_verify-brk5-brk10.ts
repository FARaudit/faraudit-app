// BRK-5 / BRK-10 verification through the PRODUCTION path (deriveVerdict), which is where the set-aside program
// canon and the SAM-metadata union are actually threaded — the pure-function probe harness cannot supply either.
export {};
import { deriveVerdict, setAsideBackstopNotices } from "../../src/lib/audit-decide";
import type { VerdictInputs, TypedFinding } from "../../src/lib/audit-findings";

let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, lens: "t", ...o });
const CLEAN = "This is a full and open solicitation. Award will be made to the lowest-priced technically acceptable offeror. Price all CLINs.";
const MATRIX = "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020) Yes\n" + CLEAN;
const base = (source: string, extra: Partial<VerdictInputs> = {}): VerdictInputs => ({
  findings: [f({ requirement: "Price all CLINs per the schedule.", excerpt: "Price all CLINs.", citation: "B.1", curableInWindow: true })],
  bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, source, ...extra,
});
const on = <T>(fn: () => T): T => { process.env.AUDIT_SETASIDE_BACKSTOP = "true"; try { return fn(); } finally { delete process.env.AUDIT_SETASIDE_BACKSTOP; } };

// ── BRK-5: the set-aside is grounded by a lens on §L PROSE while the detector keys the clause-MATRIX row. The two
// textual homes share no word-run, so text anchoring failed and a proven-in-pool firm was capped to BWC. Program
// identity must suppress it.
{
  const prose = f({ requirement: "Offeror must be a small business under the assigned NAICS.",
    excerpt: "This acquisition is 100 percent set aside for small business concerns under NAICS 561720.",
    citation: "L.2", kind: "eligibility_bar", controllability: "bidder_cannot_move",
    requiredAttribute: "sb:total", curableInWindow: false });
  const profile = { closedWorld: true, satisfiedAttributes: ["sb:total"], held: ["sb:total"], name: "TEST: small business in the pool" } as any;
  const d = on(() => deriveVerdict(base(MATRIX, { findings: [prose], bidderProfile: profile })));
  ok(d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION", `BRK-5 prose-grounded set-aside + in-pool firm → committal (got ${d.verdict})`);
  ok(!/confirm your firm's size/i.test(d.reason), `BRK-5 no "confirm your size" caveat over a firm proven in the pool`);
}

// ── BRK-10: SAM records a set-aside but the document carries NO applicable clause-matrix row (SF1449, no matrix) and
// the lenses missed it. Before the fix the union's SAM half was structurally unreachable → clean BID over a pool.
{
  const noMatrix = base(CLEAN, { samSetAside: "SBA" });
  const d = on(() => deriveVerdict(noMatrix));
  ok(d.verdict === "BID_WITH_CAUTION", `BRK-10 SAM-only set-aside + no matrix + lens-miss → BWC, not clean BID (got ${d.verdict})`);
  const notices = setAsideBackstopNotices(CLEAN, "SBA");
  ok(notices.length === 1 && notices[0].requiredAttribute === "sb:total", `BRK-10 union yields the SAM program (${notices.map((n) => n.requiredAttribute).join(",")})`);
  const dOff = deriveVerdict(noMatrix);
  ok(dOff.verdict === "BID", `BRK-10 flag-OFF stays byte-identical BID (got ${dOff.verdict})`);
}

// ── BRK-10 + BRK-14: SAM program must NOT duplicate a matrix notice for the same program.
{
  const notices = setAsideBackstopNotices(MATRIX, "SBA");
  ok(notices.filter((n) => n.requiredAttribute === "sb:total").length === 1, `BRK-14 SAM program de-duped against the matrix notice (got ${notices.length} notice(s))`);
}

console.log(fail ? `\n❌ ${fail} FAILURE(S)` : "\n✅ ALL PASS");
process.exit(fail ? 1 : 0);
