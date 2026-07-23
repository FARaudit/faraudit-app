// $0 pin for the notice-body UPDATE-stack resolver (Card #477 ruling 2, flag AUDIT_DEADLINE_UPDATE_STACK).
// Run: AUDIT_DEADLINE_UPDATE_STACK=true npx tsx src/lib/audit-deadline-update-stack.test.ts
//
// Pins the 6a67c0f1 regression: the plain firstDate() scan harvested "6-24-2026" from a FILENAME ("RFI Questions
// 6-24-2026") and rendered it as the offer-due date. The resolver must (a) read the UPDATE stack newest-first, (b) never
// treat an "UPDATE NN – <date>" dateline as a due date, (c) report the reset ("new due date will be provided") with the
// last stated date (08 Jul 2026, spelled-out) demoted. Flag OFF ⇒ status "none" (byte-identical: no caller acts).

export {}; // force MODULE scope — env is set before the dynamic import in main(), so there's no top-level import stmt
let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// The REAL 6a67c0f1 SAM notice body (verbatim, newline-free, newest-first).
const BODY = `This posting is for Tinker AFB - MAC BOA Holders ONLY . UPDATE 03-July 7, 2026 1) Soliciation amendment attached as document: Solicitation-FA8137326R0033-amendment 2) New due date for proposals will be provided when the new information is recieved and provided to all contractors. 3) Reach out to SrA Dorothy Inoa with any questions. This posting is for Tinker AFB - MAC BOA Holders ONLY . UPDATE 02- June 24, 2026 1) RFI's and their responses have been posted in the attached document labeled: RFI Questions 6-24-2026 2) Proposal Response Date: 08 July 2026 at 2PM CST. 3) Send proposals to SrA Dorothy Inoa This posting is for Tinker AFB - MAC BOA Holders ONLY . UPDATE 01 - May 28, 2026 1) Site Visit was held and concluded on May 28, 2026. 2) RFIs are due on Thursday June 04, 2026 COB. 3) Sign in sheet has been added.`;

async function main() {
  process.env.AUDIT_DEADLINE_UPDATE_STACK = "true";
  const { resolveNoticeBodyDeadline } = await import("./audit-deadline-extract");

  console.log("── flag ON · the 6a67c0f1 reset case ──");
  const r = resolveNoticeBodyDeadline(BODY);
  assert(r.status === "reset_tbd", `status = reset_tbd (got ${r.status})`);
  assert(r.date === null, "controlling date is null (a new date will be provided)");
  assert(r.lastStated?.date === "2026-07-08", `last stated = 2026-07-08 08-Jul (got ${r.lastStated?.date}) — spelled-out date parsed`);
  assert(!/2026-06-24|6-24|June\s*24/.test(r.note) || /UPDATE 02/.test(r.note), "note does NOT surface 24-Jun as a due date");
  assert(/RESET/.test(r.note) && /latest amendment/.test(r.note), "note names the reset + verify-against-amendment");
  assert(/2026-07-08/.test(r.note), "note carries the last-stated 08-Jul date");

  console.log("\n── the RFI-filename date is never harvested as a due date ──");
  assert(r.date !== "2026-06-24" && r.lastStated?.date !== "2026-06-24", "6-24-2026 (RFI filename) is NOT captured as any due date");

  console.log("\n── a STATED (non-reset) newest update → status=stated ──");
  const stated = resolveNoticeBodyDeadline(`Base text. UPDATE 02- June 24, 2026 1) Proposal Response Date: 08 July 2026 at 2PM CST. UPDATE 01 - May 28, 2026 1) Site Visit concluded.`);
  assert(stated.status === "stated" && stated.date === "2026-07-08", `newest stated date wins (got ${stated.status}/${stated.date})`);

  console.log("\n── no UPDATE stack → none (no false capture) ──");
  const plain = resolveNoticeBodyDeadline(`This is a plain synopsis with no update blocks and an incidental 6-24-2026 filename reference.`);
  assert(plain.status === "none" && plain.date === null, "no UPDATE markers → status none");

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — notice-body UPDATE-stack resolver pin`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
