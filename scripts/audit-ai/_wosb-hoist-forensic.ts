// $0 — is the SF-1449 block-10 label at ingest line 1 a HOIST BY US, or pdf-parse's faithful content-stream order?
// The red-team asserted "our extractor hoisted WOMEN-OWNED SMALL BUSINESS (WOSB) to the first content line".
// If true, we own a bug. If it is pdf-parse emitting the PDF's own order, there is nothing in our code to fix —
// and the REAL defect is the separate one: block-10 VALUES are dropped while labels survive.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("raw_pdf_text").eq("id","583df921-9cd9-4fd9-b56a-4f49aee62eb2").single();
  const lines=((data as any).raw_pdf_text as string).split("\n");
  console.log("=== ingest lines 0-12 ===");
  for(let i=0;i<13;i++) console.log(String(i).padStart(3), JSON.stringify(lines[i]));

  console.log("\n=== every SF-1449 BLOCK-10 style label, and whether its VALUE followed ===");
  // Block 10 is the set-aside checkbox row. Its sibling labels are the ones to test for the same drop.
  const B10 = ["WOMEN-OWNED SMALL","SMALL BUSINESS","HUBZONE","8(A)","SERVICE-DISABLED","EDWOSB","SET ASIDE","SIZE STANDARD"];
  for (const lbl of B10) {
    const i = lines.findIndex(l => l.toUpperCase().includes(lbl));
    if (i < 0) { console.log(`  ${lbl.padEnd(22)} ABSENT from ingest`); continue; }
    const after = lines.slice(i+1, i+4).map(x=>x.trim()).filter(Boolean).join(" | ").slice(0,70);
    console.log(`  ${lbl.padEnd(22)} L${String(i).padStart(4)}  next: ${after || "(nothing)"}`);
  }

  console.log("\n=== the VALUES the red-team says are dropped ===");
  for (const [what, re] of [["SET ASIDE percentage", /SET ASIDE:\s*\d+\s*%/i],
                            ["a bare 100 % near SET ASIDE", /SET ASIDE[^\n]{0,20}100/i],
                            ["SIZE STANDARD dollar value", /SIZE STANDARD[^\n]{0,40}\$?\s*[\d,]{5,}/i],
                            ["9,500,000 anywhere", /9,?500,?000/]] as Array<[string,RegExp]>) {
    const m = re.exec((data as any).raw_pdf_text);
    console.log(`  ${what.padEnd(30)} ${m ? "PRESENT: "+JSON.stringify(m[0].slice(0,50)) : "ABSENT from ingest"}`);
  }
})();
