// $0 — CERT-5 stress-test candidate discovery from the live pipeline (pending_audits). Biddable = deadline in future.
// Buckets by the two catastrophic-error archetypes: (1) false-BID trap signals, (2) false-INELIGIBLE trap signals.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const nowIso = "2026-07-24T00:00:00Z";
  const { data, error } = await admin
    .from("pending_audits")
    .select("solicitation_number, notice_id, title, agency, naics_code, set_aside, incumbent_name, document_type, source, status, response_deadline, created_at, audit_id")
    .gte("response_deadline", nowIso)
    .order("response_deadline", { ascending: true })
    .limit(200);
  if (error) { console.error("ERR", error.message); process.exit(1); }
  const rows = data || [];
  console.log(`biddable rows (deadline ≥ ${nowIso.slice(0,10)}): ${rows.length}`);

  // source distribution
  const bySource: Record<string, number> = {};
  for (const r of rows) bySource[r.source ?? "?"] = (bySource[r.source ?? "?"] || 0) + 1;
  console.log("by source:", JSON.stringify(bySource));

  const setaside = (r: any) => (r.set_aside ?? "").toUpperCase();
  const isSetAside = (r: any) => /SBA|WOSB|EDWOSB|SDVOSB|8A|8\(A\)|HZC|HUBZONE|SDB|VSA/.test(setaside(r));
  const socioSetAside = (r: any) => /WOSB|EDWOSB|SDVOSB|8A|8\(A\)|HZC|HUBZONE|VSA/.test(setaside(r)); // cert-gated (not plain total-SB)
  const dod = (r: any) => /DEFENSE|AIR FORCE|ARMY|NAVY|DLA|MARINE|DEFENSE LOGISTICS/i.test(r.agency ?? "");

  // ARCHETYPE 1 — false-BID trap: full&open OR has incumbent (experience lock), esp. DoD/DLA hardware or recompete.
  const falseBid = rows.filter((r) => (!isSetAside(r) || r.incumbent_name) && r.response_deadline);
  // ARCHETYPE 2 — false-INELIGIBLE trap: cert-gated socioeconomic set-aside, DoD (scary clause load), biddable.
  const falseInelig = rows.filter((r) => socioSetAside(r));

  const show = (label: string, list: any[]) => {
    console.log(`\n=== ${label} (${list.length}) ===`);
    for (const r of list.slice(0, 15)) {
      console.log(`  ${r.solicitation_number ?? "?"} | ${(r.title ?? "").slice(0, 52)}`);
      console.log(`     agency=${(r.agency ?? "").slice(0,40)} naics=${r.naics_code} setaside=${r.set_aside ?? "-"} incumbent=${r.incumbent_name ?? "-"} due=${(r.response_deadline ?? "").slice(0,10)} src=${r.source} audit=${r.audit_id ? "done" : "-"}`);
    }
  };
  show("ARCHETYPE 1 · false-BID trap (full&open / incumbent-lock)", falseBid);
  show("ARCHETYPE 2 · false-INELIGIBLE trap (cert-gated set-aside)", falseInelig);
})();
