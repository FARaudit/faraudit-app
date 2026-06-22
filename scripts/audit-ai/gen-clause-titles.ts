// Regenerate src/lib/clause-titles.generated.json from the official eCFR (Title
// 48 = FAR/DFARS/agency supplements). Deterministic facts, $0. Re-run when eCFR
// updates. Usage: npx tsx scripts/audit-ai/gen-clause-titles.ts
import fs from "fs";
async function main() {
  const titles: any = await (await fetch("https://www.ecfr.gov/api/versioner/v1/titles.json")).json();
  const date = (titles.titles || []).find((x: any) => x.number === 48)?.latest_issue_date;
  console.log("eCFR Title 48 issue date:", date);
  const struct: any = await (await fetch(`https://www.ecfr.gov/api/versioner/v1/structure/${date}/title-48.json`)).json();
  const out: Record<string, string> = {};
  const re = /^\d{2,3}\.\d{3,4}(?:-\d+)?$/;
  const walk = (n: any): void => {
    if (!n || typeof n !== "object") return;
    if (n.type === "section") {
      const id = String(n.identifier || "").trim();
      if (re.test(id)) {
        let t = String(n.label_description || "").trim();
        if (!t) t = String(n.label || "").replace(new RegExp("^§*\\s*" + id.replace(/[.\-]/g, (m) => "\\" + m) + "\\s*"), "").trim();
        t = t.replace(/\s+/g, " ").trim().replace(/\.$/, "");
        if (t.length > 2) out[id] = t;
      }
    }
    for (const c of n.children || []) walk(c);
  };
  walk(struct);
  fs.writeFileSync("src/lib/clause-titles.generated.json", JSON.stringify(out, null, 0));
  console.log("wrote", Object.keys(out).length, "clause titles → src/lib/clause-titles.generated.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
