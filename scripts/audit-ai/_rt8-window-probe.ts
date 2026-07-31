// Would a character-window scan around the subject work for P0-B? Measure on the REAL source before choosing,
// because a window wide enough to reach a line-broken obligation may also reach unrelated clause-table text.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("raw_pdf_text").eq("id","61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const src=String((data as any).raw_pdf_text||"");
  const re=/site\s+visit/gi; let m; const hits:number[]=[];
  while((m=re.exec(src))) hits.push(m.index);
  console.log(`"site visit" occurrences: ${hits.length}`);
  for (const w of [80,150,250,400]) {
    let fired=0; const why:string[]=[];
    for (const h of hits) {
      const win=src.slice(Math.max(0,h-w), h+w);
      const om=I.OBLIGATION_MARKER.exec(win);
      if (om) { fired++; if(why.length<2) why.push(om[0]); }
    }
    console.log(`  window ±${w}: ${fired}/${hits.length} occurrences hit an obligation marker  ${fired?`(e.g. ${JSON.stringify(why)})`:"-> gate would still FIRE"}`);
  }
})();
