// Compare what SAM.gov has (resourceLinks = attachment list) vs what's saved locally, per solicitation.
// SAM calls use the data.gov key (NOT Anthropic credits). Flags possible deletions / missing docs.
import { readdirSync } from "node:fs";
import { fetchSolicitationByNoticeId } from "@/lib/sam";

const SOLS = ["N4008526R0065","1240LP26Q0067","SPRDL125Q0030","AOCSSB26R0023","FA667024R0001","HM047626R0039","AOCSSB26R0039","FA487726B0001","1232SA26R0020","FA460026Q0047"];
const DIRS = ["ceo/Solicitation + Export Reviews","scripts/audit-ai/gold-sets"];
const subdirs = (d: string) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };

function localFiles(sol: string): string[] {
  const out: string[] = [];
  for (const base of DIRS) for (const e of subdirs(base)) {
    if (e.isFile() && e.name.includes(sol)) out.push(`${base}/${e.name}`);
    if (e.isDirectory()) for (const f of subdirs(`${base}/${e.name}`)) if (f.isFile() && (f.name.includes(sol) || e.name.includes(sol))) out.push(`${base}/${e.name}/${f.name}`);
  }
  return [...new Set(out)];
}

async function main() {
  console.log("SOL".padEnd(16), "SAM attach", "local", "deadline", "  title");
  for (const sol of SOLS) {
    const s = await fetchSolicitationByNoticeId(sol);
    const local = localFiles(sol).filter((f) => /\.pdf$/i.test(f)); // count source PDFs (not our .md/.txt/.html derivatives)
    const samN = s ? s.resourceLinks.length : "—";
    const flag = s ? (typeof samN === "number" && samN > local.length ? " ⚠ SAM>local" : samN === 0 ? " (SAM lists 0)" : " ok") : " ✗ not on SAM (closed/archived?)";
    console.log(sol.padEnd(16), String(samN).padEnd(10), String(local.length).padEnd(5), (s?.responseDeadLine?.slice(0,10) ?? "—").padEnd(8), "", (s?.title ?? "").slice(0,42), flag);
  }
}
main().catch((e) => { console.error("ERR", e?.message || e); process.exit(1); });
