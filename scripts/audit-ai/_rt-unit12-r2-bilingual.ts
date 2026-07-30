/**
 * R2 — the SHARPER over-fire: a BILINGUAL section whose ENGLISH half carries real
 * content but a foreign-language copy pads total non-ASCII ≥30%. If the English half
 * has NO obligation verb (a notice/definitions block) it reaches the valve, and the
 * foreign padding floors it → a section with real readable English → INCOMPLETE.
 * Also: does the foreign half ever push a section that SHOULD be covered_direct/
 * ungrounded off its path? (No — floor only runs when obligationSet is empty.)
 */
import { completenessOf, type SectionAttestation } from "../../src/lib/audit-orchestrator";
import { deriveVerdict } from "../../src/lib/audit-decide";
import { looksMojibake } from "../../src/lib/pdf-ocr";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

function met(t: string) {
  const c = [...t.replace(/\s+/g, "")]; let na = 0;
  for (const ch of c) if (ch.codePointAt(0)! > 0x7e) na++;
  return { len: c.length, na: na / c.length };
}
function runOne(label: string, text: string, floor: boolean) {
  process.env.AUDIT_OBLIGATION_GARBLE_FLOOR = floor ? "true" : "false";
  process.env.AUDIT_TXT_INGEST = "true";
  const ctx = { fullSource: text, sections: { J: text } } as AuditToolContext;
  const { covered, missing, attestations } = completenessOf(ctx, ["J"], [] as TypedFinding[], new Set(["J"]));
  const att = attestations.find((a: SectionAttestation) => a.section === "J");
  const d = deriveVerdict({ findings: [], bidderProfile: null, coverageComplete: missing.length === 0, verifierSound: true, conflict: false } as any);
  const m = met(text);
  console.log(`${label.padEnd(30)} floor=${floor?"ON ":"OFF"} len=${m.len} na=${(m.na*100).toFixed(0)}% mojibake=${looksMojibake(text)} status=${(att?.status??"?").padEnd(22)} → ${d.verdict}`);
}

// English NOTICE half (definitions/notice — NO shall/must so it reaches the valve) +
// a longer foreign copy. Realistic: a bilingual notice-to-offerors attachment.
const BILINGUAL_NOTICE = `SECTION J ATTACHMENT 9 — NOTICE TO OFFERORS (ENGLISH / 中文)
This attachment is provided for the convenience of offerors at the overseas place of
performance. In the event of any conflict between the two language versions, the English
version is the controlling version for all purposes under this contract.
本附件仅为在海外履约地点的投标人提供便利之用。如两种语言版本之间存在任何冲突，则以
英文版本为准，英文版本在本合同项下的所有目的中均为最终控制版本。所有投标人均应仔细
阅读本通知的全部内容，并在提交报价之前充分理解其中的所有条款、条件和相关要求事项。
如对本通知的任何部分有疑问，投标人应通过合同专员指定的方式及时提出书面询问。`;
console.log("BILINGUAL (EN notice, no verb + CN copy padding):");
runOne("BILINGUAL_NOTICE", BILINGUAL_NOTICE, false);
runOne("BILINGUAL_NOTICE", BILINGUAL_NOTICE, true);

const m = met(BILINGUAL_NOTICE);
console.log(`\n  → English half is readable & clean; foreign copy padding pushes na=${(m.na*100).toFixed(0)}% ≥30%.`);
console.log("  → If floor=ON flips this to INCOMPLETE, it is a genuine over-fire (real readable EN content).\n");
