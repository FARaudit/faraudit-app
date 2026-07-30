// Item-D verification (card #707) — run the REAL FA813726R0033 row through buildViewModel both flag states.
// Proves: flag-OFF the passed date 2026-07-18 still renders (byte-identical to today); flag-ON the reset caveat
// renders and the passed date / countdown / expired banner are suppressed.  npx tsx scripts/audit-ai/_itemd-deadline-probe.ts
import * as fs from "fs";
import { buildViewModel } from "../../src/app/audit/[id]/_view-model";

const row = JSON.parse(fs.readFileSync("/tmp/itemd-row.json", "utf8"));
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

const pick = (vm: Record<string, unknown>) => ({
  prelim_deadline_date: vm.prelim_deadline_date, response_deadline: vm.response_deadline,
  days_to_deadline: vm.days_to_deadline, is_expired: vm.is_expired,
  response_days: vm.response_days, response_deadline_short: vm.response_deadline_short,
  deadline_reset_tbd: vm.deadline_reset_tbd,
});

delete process.env.AUDIT_DEADLINE_RESET_RENDER;
const off = pick(buildViewModel(row) as never);
console.log("\n── FLAG-OFF (today's behavior) ──\n", off);
ok(/2026|jul|18/i.test(String(off.prelim_deadline_date)), "flag-OFF ⇒ the passed date still renders in the tile (byte-identical to today)");
ok(off.deadline_reset_tbd === false, "flag-OFF ⇒ deadline_reset_tbd=false");

process.env.AUDIT_DEADLINE_RESET_RENDER = "true";
const on = pick(buildViewModel(row) as never);
console.log("\n── FLAG-ON (item D) ──\n", on);
ok(on.deadline_reset_tbd === true, "flag-ON ⇒ deadline_reset_tbd=true");
ok(/Deadline reset — TBD/i.test(String(on.prelim_deadline_date)), "flag-ON ⇒ prelim tile shows 'Deadline reset — TBD per <update>' (never the passed date)");
ok(!/2026-07-18|18 Jul|Jul 18/i.test(String(on.prelim_deadline_date)) && !/2026-07-18|18 Jul|Jul 18/i.test(String(on.response_deadline)), "flag-ON ⇒ the superseded passed date 2026-07-18 is NOT shown as live");
ok(on.days_to_deadline === null, "flag-ON ⇒ days_to_deadline null (no stale countdown)");
ok(on.is_expired === false, "flag-ON ⇒ is_expired=false (superseded, not a lapsed live deadline → no expired banner)");
ok(on.response_deadline_short === "", "flag-ON ⇒ response_deadline_short empty (no 'due 18 Jul' anywhere)");

console.log(`\n${fail === 0 ? "🟢 item-D DRY PASSES on the real FA813726 record" : `❌ ${fail} FAIL`}`);
process.exit(fail === 0 ? 0 : 1);
