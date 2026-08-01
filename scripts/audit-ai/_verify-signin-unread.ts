// RED-TEAM P0#2: claims FA813726R0033's sign-in sheet (the attendance record) was INGESTED and went
// UNREAD across all 16 runs — so branch 1's "unverifiable firm fact" premise is false. Single-source
// claim; verify before building on it.
export {};
import { readdirSync, readFileSync } from "node:fs";
const D = "scripts/audit-ai/run-records";
const files = readdirSync(D).filter((f) => f.startsWith("FA813726R0033") && f.endsWith(".json") && !/panel-findings-bank/.test(f));
let ingested = 0, cited = 0, noDocList = 0;
const SIGNIN = /sign[\s-]?in\s*sheet|attendance\s*(?:roster|sheet|record|list)|sign[\s-]?in\s*log/i;
for (const f of files) {
  let o: any; try { o = JSON.parse(readFileSync(`${D}/${f}`, "utf8")); } catch { continue; }
  const src = String(o?.input?.fullSource ?? "");
  // is the sign-in sheet NAMED in the ingested source at all?
  const named = SIGNIN.test(src);
  // is there a document list, and does it carry the sheet?
  const docs: string[] = (o?.input?.documents ?? o?.input?.docs ?? o?.input?.attachments ?? []).map((d: any) => String(d?.name ?? d?.filename ?? d));
  if (!docs.length) noDocList++;
  const inDocs = docs.filter((d) => SIGNIN.test(d));
  if (named || inDocs.length) ingested++;
  // does ANY finding cite it?
  const fnd: any[] = o?.result?.inputs?.findings ?? [];
  const hits = fnd.filter((x) => SIGNIN.test(`${x?.requirement ?? ""} ${x?.excerpt ?? ""} ${x?.citation ?? ""}`));
  if (hits.length) { cited++; console.log(`   CITED in ${f.slice(0, 40)}: ${String(hits[0].requirement).slice(0, 90)}`); }
}
console.log(`\nFA813726R0033 run-records examined: ${files.length}`);
console.log(`   sign-in sheet NAMED in the ingested source : ${ingested}`);
console.log(`   records with NO document list captured     : ${noDocList}`);
console.log(`   records where ANY finding cites it         : ${cited}`);
// show the sentence
const first = files.map((f) => { try { return JSON.parse(readFileSync(`${D}/${f}`, "utf8")); } catch { return null; } }).find(Boolean);
const s = String(first?.input?.fullSource ?? "").replace(/\s+/g, " ");
const m = SIGNIN.exec(s);
if (m) console.log(`\n   source says: "…${s.slice(Math.max(0, (m.index ?? 0) - 150), (m.index ?? 0) + 170)}…"`);
