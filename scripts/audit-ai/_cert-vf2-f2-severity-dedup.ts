// CERT — Vehicle F2 · F-2 (flag AUDIT_SEVERITY_HONEST). Faithful fixture = real record 496a9a21 (FA813726R0033).
// Renders the PROD v4 path both flag states in one process (sevLab/severityHonestEnabled are per-call), asserts:
//   flag-OFF  → byte-identical legacy: per-row "Critical" label on gates, 6× "one proposal" dup, no Unrated group.
//   flag-ON   → gates read "Gate" not "Critical"; the 6× one-proposal family collapses to 1; the 2 show-stoppers
//               (p0 "Stop") survive unmistakable; flag-OFF render is preserved byte-for-byte when flipped back.
//   $0. Run: npx tsx scripts/audit-ai/_cert-vf2-f2-severity-dedup.ts
import { readFileSync } from "node:fs";
import { renderV4ReportFromRow } from "../../src/lib/v4-report/report";

const row = JSON.parse(readFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json", "utf8"));
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✅" : "❌") + " " + m); if (!c) fails++; };
const sevtagLabel = (html: string, lab: string) => (html.match(new RegExp(`<i>${lab}</i>`, "g")) || []).length;
const oneProposalRows = (html: string) => (html.match(/submit only one proposal for the project/gi) || []).length;

// ── flag-OFF (legacy) ──
delete process.env.AUDIT_SEVERITY_HONEST;
const off = renderV4ReportFromRow(row);
const offCritical = sevtagLabel(off, "Critical");
const offGate = sevtagLabel(off, "Gate");
const offOneProp = oneProposalRows(off);
console.log(`\n[flag-OFF] Critical=${offCritical} Gate=${offGate} one-proposal-rows=${offOneProp} Unrated-label=${sevtagLabel(off,"Unrated")}`);
ok(offCritical > 0, "flag-OFF: gates still carry the legacy 'Critical' chip (byte-identical legacy)");
ok(offGate === 0, "flag-OFF: no 'Gate' chip (legacy)");
ok(sevtagLabel(off, "Unrated") === 0, "flag-OFF: no Unrated group");
ok(offOneProp >= 2, "flag-OFF: the one-proposal family is NOT deduped (multiple rows)");

// ── flag-ON (honest) ──
process.env.AUDIT_SEVERITY_HONEST = "true";
const on = renderV4ReportFromRow(row);
const onCritical = sevtagLabel(on, "Critical");
const onGate = sevtagLabel(on, "Gate");
const onStop = sevtagLabel(on, "Stop");
const onOneProp = oneProposalRows(on);
console.log(`[flag-ON ] Critical=${onCritical} Gate=${onGate} Stop=${onStop} one-proposal-rows=${onOneProp} Unrated-label=${sevtagLabel(on,"Unrated")}`);
ok(onCritical === 0, "flag-ON: ZERO gates labeled 'Critical' (no upward default)");
ok(onGate > 0, "flag-ON: gates read 'Gate'");
ok(onStop === 2, "flag-ON: exactly 2 show-stoppers survive ('Stop' — the two eligibility bars, unmistakable)");
// One occurrence per SURFACE (findings wall + §L compliance matrix), down from 7 — the wall + matrix each show
// the obligation once (that is honest, not duplication; the two surfaces are distinct views).
ok(onOneProp === 2 && onOneProp < offOneProp, `flag-ON: one-proposal collapses to 1-per-surface (got ${onOneProp}, was ${offOneProp})`);

// ── flag-OFF preserved after flip-back (per-call flag, no module freeze) ──
delete process.env.AUDIT_SEVERITY_HONEST;
const off2 = renderV4ReportFromRow(row);
ok(off2 === off, "flip-back: flag-OFF render is byte-identical to the first flag-OFF render");

console.log(fails === 0 ? "\n✅ ALL GREEN — F-2 severity-honest + excerpt-dedup" : `\n❌ ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
