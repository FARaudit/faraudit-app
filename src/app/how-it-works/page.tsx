"use client";
import { useState } from "react";
import Link from "next/link";
import type { Metadata } from "next";

// ── Tokens ──────────────────────────────────────────────
const NAVY    = "#0A1628";
const NAVY2   = "#0d1f35";
const BLUE    = "#378ADD";
const LIGHT   = "#B5D4F4";
const PALE    = "#E6F1FB";
const WHITE   = "#ffffff";
const TEXT    = "#1f2937";
const MUTED   = "#6b7280";
const SUBTLE  = "#9ca3af";
const BORDER  = "#e5e7eb";
const BORDER2 = "#d1d5db";
const GREEN_BG  = "#dcfce7"; const GREEN_TXT  = "#166534";
const AMBER_BG  = "#fef3c7"; const AMBER_TXT  = "#92400e";
const RED_BG    = "#fee2e2"; const RED_TXT    = "#991b1b";
const SURFACE   = "#f9fafb"; const SURFACE2   = "#f3f4f6";

// ── Types ────────────────────────────────────────────────
type Badge = "trap"|"req"|"ref";
type Sev   = "P0"|"P1"|"P2";
interface Clause { num:string; title:string; badge:Badge }
interface Risk   { title:string; sev:Sev; desc:string; action:string }
interface Stage  {
  num:string; label:string; fa:boolean;
  title:string; sub:string;
  col1:string[]; col2:string[];
  faNote:string; faHeadline:string|null;
  outputs:string[]; outcomes:string[];
  clauses:Clause[]; risks:Risk[];
}

// ── Stage data ───────────────────────────────────────────
const STAGES: Stage[] = [
  {
    num:"00", label:"Govt need\nidentified", fa:false,
    title:"Government requirement identified",
    sub:"Agency determines a need · Program office begins planning",
    col1:["Program office defines the requirement","Budget allocated in PPBE cycle","Market research initiated — FAR Part 10","Acquisition strategy developed internally"],
    col2:["Statement of Objectives (SOO) drafted","NAICS code and size standard assigned","Set-aside determination made","Estimated contract value established"],
    faNote:"FARaudit is not yet involved. This stage is entirely internal to the government agency.",
    faHeadline:null, outputs:[], outcomes:[], clauses:[], risks:[],
  },
  {
    num:"01", label:"Pre-Sol\nSynopsis", fa:true,
    title:"Pre-Solicitation Synopsis",
    sub:"FAR 5.203 · Public notice on SAM.gov · The starting gun",
    col1:["CO posts formal public notice to SAM.gov","Industry begins positioning for competition","Small business office reviews set-aside determination","Estimated value and timeline published publicly"],
    col2:["Contract type announced (FFP, T&M, Cost-Plus)","NAICS code and size standard confirmed","Anticipated solicitation release date provided","CO contact name and email posted"],
    faNote:"Synopsis Scanner detects notices at 06:15 CT daily across 9 defense NAICS codes. Analyzes contract type, set-aside eligibility, urgency score 0–100. Generates a strategic CO contact email — a precise, intelligent single-question inquiry that positions the contractor as an industry subject matter expert. This is the 60–90 day head start no competitor offers.",
    faHeadline:"60–90 days before the solicitation drops",
    outputs:["Synopsis analysis","CO contact email","Preparation calendar","Urgency score 0–100","NAICS eligibility check"],
    outcomes:["60–90 day head start","CO relationship established","Teaming strategy formed"],
    clauses:[
      {num:"FAR 5.203",title:"Publicizing Contract Actions — requires agency to post pre-solicitation notice",badge:"ref"},
      {num:"FAR Part 10",title:"Market Research — agency uses RFI/Synopsis to gauge industry capability",badge:"ref"},
    ],
    risks:[
      {title:"Missed synopsis — competition starts without you",sev:"P1",desc:"If the Synopsis posts and you don't respond within the first week, competitors establish the CO relationship first. Late engagement is visible to the CO and signals low interest.",action:"FARaudit action: Synopsis Scanner fires same day. Urgency score flags response window. CO email drafted and ready within minutes of detection."},
    ],
  },
  {
    num:"02", label:"Sources Sought\n/ RFI", fa:true,
    title:"Sources Sought · Request for Information",
    sub:"Agency shapes the requirement · Maximum contractor influence window",
    col1:["Agency gauges market capability and interest","Identifies qualified and interested vendors","Refines performance standards and specifications","Tests pricing structure and feasibility assumptions"],
    col2:["Technical capabilities and approach requested","Rough pricing data and cost drivers collected","SOW and PWS language still actively being written","Evaluation factor weights not yet determined"],
    faNote:"RFI Scanner monitors 9 defense NAICS codes daily. Ranks every notice by influence score. RFI Response Drafter produces a solution-first strategic response: unconsidered risks the agency missed, agency terminology mirrored precisely, performance standards proposed from industry best practice.",
    faHeadline:"Where contractor language enters the government SOW",
    outputs:["Ranked RFI feed (9 NAICS)","Strategic response draft","Unconsidered risk analysis","Agency terminology alignment","Performance standard proposals"],
    outcomes:["Language written into final SOW","SME positioning with agency","Pricing structure influence","Evaluation criteria shaped"],
    clauses:[
      {num:"FAR 10.002",title:"Procedures for Market Research — governs Sources Sought notices",badge:"ref"},
      {num:"FAR 52.215-3",title:"Request for Information or Solicitation for Planning Purposes",badge:"ref"},
    ],
    risks:[
      {title:"RFI response leads with company history",sev:"P0",desc:"Agencies reading RFI responses don't care about past performance at this stage — they're evaluating technical understanding. A history-first response signals the contractor doesn't understand the requirement.",action:"FARaudit action: Response Drafter is hard-coded to lead with solution approach and unconsidered risk identification. Company history never appears in the first paragraph."},
      {title:"Failing to identify unconsidered risks",sev:"P1",desc:"The most influential RFI responses identify a technical constraint, pricing risk, or feasibility challenge the agency hasn't mentioned. This positions the contractor as a subject matter expert.",action:"FARaudit action: RFI Drafter explicitly analyzes the notice for gaps and produces 2–3 unconsidered risk flags with specific mitigation recommendations."},
    ],
  },
  {
    num:"03", label:"Solicitation\nDrops", fa:true,
    title:"Solicitation released",
    sub:"RFQ / RFP / IFB posted to SAM.gov · Competition clock starts",
    col1:["CO releases full solicitation to SAM.gov","Question window opens — typically 7–14 days","Site visit scheduled if applicable","Offerors begin proposal and pricing development"],
    col2:["Section B — CLINs, quantities, pricing structure","Section C — SOW, PWS, or SOO","Section H — special contract requirements","Section L — instructions to offerors","Section M — evaluation factors and weights"],
    faNote:"Full three-call audit engine. Pre-step: SOW/PWS/SOO Classifier reads Section C and determines document type — SOW (task-based, compliance-first), PWS (outcome-based, innovation opportunity), or SOO (propose your own approach). This changes the entire bid strategy before a single clause is checked. Call 1: CLIN structure, quantity ambiguities, FOB conflicts, pricing traps. Call 2: FAR/DFARS compliance. Call 3: DFARS trap detection.",
    faHeadline:"Three-call architecture — no token truncation on large IDIQs",
    outputs:["SOW/PWS/SOO classification + bid strategy","CLIN ambiguity flags with citations","Full FAR/DFARS compliance report","DFARS trap list with severity ratings","KO clarification email draft"],
    outcomes:["Zero pricing surprises at award","Compliance confirmed before submission","Clarification questions filed within window"],
    clauses:[
      {num:"252.223-7008",title:"Prohibition of Hexavalent Chromium — disqualification trap on coatings and primers",badge:"trap"},
      {num:"252.204-7018",title:"Prohibition on Covered Defense Telecom Equipment — supply chain requirement",badge:"trap"},
      {num:"252.204-7021",title:"CMMC Requirements — cybersecurity certification for certain contracts",badge:"trap"},
      {num:"252.225-7060",title:"Prohibition on Xinjiang Uyghur Autonomous Region Procurements",badge:"trap"},
      {num:"52.219-14",title:"Limitations on Subcontracting — 50% self-performance rule on supply contracts",badge:"req"},
      {num:"52.225-1",title:"Buy American — domestic end product certification required",badge:"req"},
    ],
    risks:[
      {title:"CLIN quantity ambiguity — \"Set of 2 · 80 Each\"",sev:"P0",desc:"CLIN 0001 reads \"INTAKE PLUGS (SET OF 2) — 80 Each.\" Does \"80 Each\" mean 80 sets (160 plugs) or 80 individual plugs (40 sets)? A 2x margin exposure on the entire CLIN.",action:"FARaudit action: CLIN ambiguities flagged in Call 1 with specific clarification question to CO drafted and ready to send within the question window."},
      {title:"FOB designation conflict between CLINs and Note 7",sev:"P0",desc:"CLIN 0001 shows Government Destination while CLINs 0002/0003 show Contractor Destination. Note 7 states FOB Destination. Contractor who ships to the wrong DoDAAC pays freight out of pocket.",action:"FARaudit action: FOB conflict flagged in Call 1. KO clarification email includes explicit FOB question with contract section citations."},
      {title:"Hexavalent chromium in coating supply chain",sev:"P1",desc:"DFARS 252.223-7008 prohibits delivery of items containing hexavalent chromium without specific written approval. Many standard aerospace primers contain hex-chrome.",action:"FARaudit action: DFARS 252.223-7008 flagged in Call 3 with specific supplier verification checklist and written confirmation requirement."},
    ],
  },
  {
    num:"04", label:"Proposal\nDevelopment", fa:true,
    title:"Proposal development",
    sub:"Contractor builds technical and price volumes",
    col1:["Estimator prices each CLIN line item","Technical team writes approach narrative","Compliance matrix completed against Section L","Past performance references compiled"],
    col2:["BOE (Basis of Estimate) developed per CLIN","Labor categories and loaded rates applied","Material, subcontract, and ODC costs built up","Subcontracting plan drafted if 52.219-9 required"],
    faNote:"The audit report drives every pricing decision. CLIN quantity ambiguities are resolved before the estimator opens a spreadsheet. Document type classification determines proposal strategy: a SOW gets a compliance matrix; a PWS gets an outcome innovation narrative; an SOO gets a full contractor-authored PWS.",
    faHeadline:"Audit report drives pricing — before the spreadsheet opens",
    outputs:["CLIN-level pricing guidance with resolved ambiguities","Section L compliance checklist","Section M factor weights and response outline","Risk-adjusted BOE inputs","Document type bid strategy brief"],
    outcomes:["Defensible, competition-ready pricing","Proposal directly addresses evaluation criteria","No compliance deficiencies at submission"],
    clauses:[
      {num:"52.215-14",title:"Integrity of Unit Prices — cost or pricing data certification requirements",badge:"req"},
      {num:"52.219-9",title:"Small Business Subcontracting Plan — required if subcontracting planned",badge:"req"},
    ],
    risks:[
      {title:"Proposing to wrong document type — SOO treated as SOW",sev:"P1",desc:"A contractor who receives a SOO and writes a compliance-first task-based proposal has misread the requirement. The agency wants an industry-designed solution.",action:"FARaudit action: SOW/PWS/SOO Classifier identifies document type in the pre-step. Bid strategy brief explicitly states the required proposal approach before any clause checking."},
    ],
  },
  {
    num:"05", label:"Submission", fa:true,
    title:"Quote / proposal submitted",
    sub:"Delivered to CO by deadline · In English · In USD",
    col1:["Offeror submits by stated deadline — no exceptions","Email to both CO contacts confirmed sent","SAM.gov registration current and active","All representations and certifications signed"],
    col2:["SF 1449 or applicable form completed","Pricing in USD only (FAR 52.214-35)","English language only (FAR 52.214-34)","Buy American certificate completed (52.225-4)","Covered telecom representation completed (252.204-7017)"],
    faNote:"Pre-submission checklist derived directly from the audit report. Every clause with an offeror action flagged and confirmed complete before submission. Deadline, email addresses to both CO contacts, currency and language requirements all extracted and verified.",
    faHeadline:"Pre-submission compliance checklist — zero gaps",
    outputs:["Pre-submission compliance checklist","Both CO email addresses confirmed","Deadline and time zone verified","Reps and certs completion status","Product information checklist"],
    outcomes:["On-time delivery confirmed","Compliant package — no administrative rejection","SAM registration verified active"],
    clauses:[
      {num:"52.214-34",title:"Submission of Offers in the English Language — mandatory",badge:"req"},
      {num:"52.214-35",title:"Submission of Offers in the U.S. Currency — mandatory",badge:"req"},
      {num:"52.204-7",title:"System for Award Management Registration — must be current at submission",badge:"req"},
    ],
    risks:[
      {title:"Submitting after local deadline (CDT vs EDT confusion)",sev:"P0",desc:"Solicitation states 12:00 PM CDT. A contractor in the Eastern time zone who reads this as noon Eastern submits one hour late. Late submissions are rejected without exception.",action:"FARaudit action: Deadline flagged with explicit time zone — no ambiguity."},
    ],
  },
  {
    num:"06", label:"Evaluation", fa:true,
    title:"Government evaluation",
    sub:"LPTA or Best Value · Technical acceptability determined first",
    col1:["CO evaluates technical volumes for acceptability","Price reasonableness determined vs. IGE","Responsibility determination — SAM, FAPIIS checked","Award decision finalized and documented"],
    col2:["Technical rating: Acceptable / Unacceptable only","Lowest priced technically acceptable = best value","Past performance evaluated if Section M requires","Price vs. independent government estimate compared"],
    faNote:"Section M factors extracted in Call 1 and mapped to Section L instructions. Proposal section outline includes explicit alignment between each Section M factor and its corresponding Section L response requirement. Technical unacceptability due to a missed Section M factor is an LPTA disqualification regardless of price.",
    faHeadline:"Section M alignment — no missed evaluation factors",
    outputs:["Section M factor alignment map","Technical acceptability checklist","Competitive positioning report"],
    outcomes:["No technical unacceptability","Evaluation factor coverage confirmed","Competitive position documented"],
    clauses:[
      {num:"FAR 15.305",title:"Proposal Evaluation — technical evaluation factors and procedures",badge:"ref"},
      {num:"52.219-6",title:"Notice of Total Small Business Set-Aside — eligibility verified at evaluation",badge:"req"},
    ],
    risks:[
      {title:"Technical unacceptability due to missed Section M factor",sev:"P0",desc:"This is an LPTA solicitation. The evaluation is binary: Acceptable or Unacceptable. Any proposal that fails to address a mandatory Section M technical factor is rejected without price consideration.",action:"FARaudit action: Section M factors extracted in Call 1 and mapped to Section L. Proposal section outline includes explicit alignment for every factor."},
    ],
  },
  {
    num:"07", label:"Award", fa:true,
    title:"Contract award · Performance begins",
    sub:"Purchase Order or Contract issued · WAWF invoicing active",
    col1:["CO issues award — purchase order or contract","Contractor accepts and countersigns","Performance period begins per Section F","WAWF invoicing registration confirmed active"],
    col2:["Contract number assigned — document and store","DoDAAC codes verified for payment routing","Delivery schedule tracked against Section F","Modification requests tracked for scope impact"],
    faNote:"Post-award compliance monitoring. WAWF payment routing codes verified against contract. Delivery schedule tracked against Section F. Contract modifications analyzed for scope and pricing impact. FARaudit flags the recompete timeline 180 days before estimated contract expiration.",
    faHeadline:"Post-award compliance + recompete intelligence",
    outputs:["WAWF routing code verification","Delivery schedule tracker","Modification impact analysis","Recompete alert (180 days out)"],
    outcomes:["On-time invoicing — no payment delays","Delivery compliance maintained","Next competition preparation started early"],
    clauses:[
      {num:"252.232-7006",title:"WAWF Payment Instructions — Combo document type for fixed-price deliverables",badge:"req"},
      {num:"252.232-7003",title:"Electronic Submission of Payment Requests — mandatory WAWF use",badge:"req"},
      {num:"5352.242-9000",title:"Contractor Access to Air Force Installations — base pass requirement",badge:"req"},
    ],
    risks:[
      {title:"Wrong WAWF document type — payment delay",sev:"P1",desc:"Fixed-price line items requiring shipment must use Combo document type in WAWF. Using Invoice 2in1 for a physical deliverable triggers a payment rejection and restarts the 30-day payment clock.",action:"FARaudit action: WAWF routing data table extracted from contract. Document type Combo confirmed for all physical CLINs."},
    ],
  },
];

// ── Competitor data ──────────────────────────────────────
const COMP_ROWS = [
  ["Pre-Sol Synopsis monitoring","✓","✗","✗"],
  ["CO contact email generation","✓","✗","✗"],
  ["Sources Sought / RFI feed","✓","✗","✗"],
  ["RFI response drafting","✓","✗","✗"],
  ["SOW/PWS/SOO classification","✓","✗","✗"],
  ["CLIN ambiguity detection","✓","Partial","✗"],
  ["FAR/DFARS compliance check","✓","Partial","✗"],
  ["DFARS trap detection","✓","Partial","✗"],
  ["KO clarification email","✓","✗","✗"],
  ["Post-award WAWF routing","✓","✗","✗"],
  ["Recompete alerting","✓","✗","✗"],
];

const COMPANIES = [
  {name:"FARaudit",    active:[1,2,3,4,5,6,7]},
  {name:"GovWin / Deltek", active:[3,4,5]},
  {name:"GovTribe",    active:[3]},
  {name:"Manual process", active:[3,4,5]},
];


// ── Sub-components ───────────────────────────────────────
function OverviewPanel({ s }: { s: Stage }) {
  const col = (lbl: string, items: string[]) => (
    <div>
      <div style={{fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:SUBTLE,marginBottom:10,fontWeight:700}}>{lbl}</div>
      {items.map((it,i) => (
        <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`0.5px solid #f3f4f6`,alignItems:"flex-start"}}>
          <div style={{width:4,height:4,borderRadius:"50%",background:BORDER2,flexShrink:0,marginTop:7}} />
          <div style={{fontSize:12,color:TEXT,lineHeight:1.55}}>{it}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
      {col("What's happening", s.col1)}
      {col("Key documents & actions", s.col2)}
    </div>
  );
}

function FARauditPanel({ s }: { s: Stage }) {
  if (!s.fa) return (
    <div style={{background:SURFACE,border:`0.5px solid ${BORDER2}`,borderRadius:8,padding:"14px 16px",fontSize:13,color:MUTED,fontStyle:"italic"}}>
      {s.faNote}
    </div>
  );
  return (
    <div style={{background:PALE,border:`0.5px solid ${LIGHT}`,borderRadius:8,padding:"16px 18px"}}>
      <div style={{display:"inline-flex",background:NAVY,color:LIGHT,fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" as const,padding:"3px 10px",borderRadius:4,marginBottom:10}}>FARaudit</div>
      {s.faHeadline && <div style={{fontSize:14,fontWeight:600,color:NAVY,marginBottom:8}}>{s.faHeadline}</div>}
      <div style={{fontSize:13,color:"#1e40af",lineHeight:1.7,marginBottom:14}}>{s.faNote}</div>
      {s.outputs.length > 0 && <>
        <div style={{fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:SUBTLE,marginBottom:8,fontWeight:700}}>Outputs</div>
        <div style={{display:"flex",flexWrap:"wrap" as const,gap:6,marginBottom:10}}>
          {s.outputs.map((o,i) => <span key={i} style={{fontSize:11,background:WHITE,border:`0.5px solid ${LIGHT}`,borderRadius:12,padding:"4px 11px",color:"#185FA5",fontWeight:600}}>{o}</span>)}
        </div>
      </>}
      {s.outcomes.length > 0 && <>
        <div style={{fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:SUBTLE,marginBottom:8,marginTop:10,fontWeight:700}}>Outcomes</div>
        <div style={{display:"flex",flexWrap:"wrap" as const,gap:6}}>
          {s.outcomes.map((o,i) => <span key={i} style={{fontSize:11,background:GREEN_BG,color:GREEN_TXT,borderRadius:10,padding:"4px 11px",fontWeight:600}}>{o}</span>)}
        </div>
      </>}
    </div>
  );
}

function ClausesPanel({ s }: { s: Stage }) {
  if (!s.clauses.length) return <div style={{fontSize:13,color:MUTED,fontStyle:"italic",padding:"4px 0"}}>No active clauses at this stage.</div>;
  const badgeStyle = (b: Badge) => {
    if (b==="trap") return {background:RED_BG,color:RED_TXT};
    if (b==="req")  return {background:AMBER_BG,color:AMBER_TXT};
    return {background:SURFACE2,color:MUTED};
  };
  const badgeLabel = {trap:"TRAP",req:"Required action",ref:"Reference"};
  return <>
    {s.clauses.map((c,i) => (
      <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:`0.5px solid ${BORDER}`,alignItems:"flex-start",fontSize:12}}>
        <div style={{fontFamily:"JetBrains Mono, monospace",fontSize:11,color:"#185FA5",fontWeight:600,minWidth:120,flexShrink:0}}>{c.num}</div>
        <div style={{color:TEXT,lineHeight:1.5,flex:1}}>{c.title}</div>
        <div style={{fontSize:10,padding:"2px 7px",borderRadius:8,fontWeight:600,flexShrink:0,...badgeStyle(c.badge)}}>{badgeLabel[c.badge]}</div>
      </div>
    ))}
  </>;
}

function RisksPanel({ s, openRisk, setOpenRisk }: { s: Stage; openRisk: number|null; setOpenRisk: (i:number|null)=>void }) {
  if (!s.risks.length) return <div style={{fontSize:13,color:MUTED,fontStyle:"italic",padding:"4px 0"}}>No flagged risks at this stage.</div>;
  const sevStyle = (sv: Sev) => {
    if (sv==="P0") return {background:RED_BG,color:RED_TXT};
    if (sv==="P1") return {background:AMBER_BG,color:AMBER_TXT};
    return {background:GREEN_BG,color:GREEN_TXT};
  };
  return <>
    {s.risks.map((r,i) => (
      <div key={i} style={{border:`0.5px solid ${BORDER2}`,borderRadius:8,marginBottom:10,overflow:"hidden"}}>
        <div onClick={() => setOpenRisk(openRisk===i ? null : i)}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:SURFACE,cursor:"pointer"}}>
          <div style={{fontSize:13,fontWeight:600,color:TEXT}}>{r.title}</div>
          <div style={{fontSize:10,padding:"2px 8px",borderRadius:8,fontWeight:700,...sevStyle(r.sev)}}>{r.sev}</div>
        </div>
        {openRisk===i && (
          <div style={{padding:"12px 14px",borderTop:`0.5px solid ${BORDER}`,fontSize:12,color:MUTED,lineHeight:1.65}}>
            {r.desc}
            <div style={{marginTop:8,padding:"8px 10px",background:PALE,borderRadius:6,fontSize:11,color:"#1e40af",fontWeight:500}}>{r.action}</div>
          </div>
        )}
      </div>
    ))}
  </>;
}

// ── Main component ───────────────────────────────────────
export default function HowItWorksPage() {
  const [view, setView]         = useState<"lifecycle"|"competitor">("lifecycle");
  const [cur, setCur]           = useState(1);
  const [innerTab, setInnerTab] = useState(0);
  const [openRisk, setOpenRisk] = useState<number|null>(null);

  const s = STAGES[cur];
  const pct = Math.round((cur / (STAGES.length - 1)) * 100);

  const goTo = (i: number) => { setCur(i); setInnerTab(0); setOpenRisk(null); };
  const nav  = (d: number) => goTo(Math.max(0, Math.min(STAGES.length - 1, cur + d)));

  return (
    <div style={{fontFamily:"Manrope, system-ui, sans-serif",background:"#f0f4f8",color:TEXT,minHeight:"100vh"}}>

      {/* NAV */}
      <nav style={{background:NAVY,borderBottom:`1px solid rgba(255,255,255,0.08)`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1060,margin:"0 auto",padding:"0 20px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <Link href="/" style={{textDecoration:"none",fontSize:20,fontWeight:800,letterSpacing:"-0.02em",color:"#e2e8f2"}}>
            FAR<span style={{color:BLUE}}>audit</span>
          </Link>
          <div style={{display:"flex",gap:24,alignItems:"center"}}>
            <Link href="/how-it-works" style={{fontSize:13,color:LIGHT,textDecoration:"none",fontWeight:600}}>How it works</Link>
            <Link href="/pricing" style={{fontSize:13,color:"#94a3b8",textDecoration:"none"}}>Pricing</Link>
            <Link href="/sign-in" style={{fontSize:13,color:"#94a3b8",textDecoration:"none"}}>Sign in</Link>
            <Link href="/access.html" style={{fontSize:13,fontWeight:700,background:BLUE,color:WHITE,textDecoration:"none",padding:"7px 16px",borderRadius:6}}>Request Access</Link>
          </div>
        </div>
      </nav>

      <div style={{maxWidth:1060,margin:"0 auto",padding:"32px 20px 64px"}}>

        {/* HEADER */}
        <div style={{marginBottom:28}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:NAVY,color:LIGHT,fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase" as const,padding:"4px 12px",borderRadius:4,marginBottom:14}}>
            Federal Contract Intelligence
          </div>
          <h1 style={{fontSize:26,fontWeight:700,color:NAVY,marginBottom:8,lineHeight:1.25}}>The complete acquisition lifecycle</h1>
          <p style={{fontSize:14,color:MUTED,lineHeight:1.7,maxWidth:620}}>
            From the first government signal to contract award. Click any stage to explore what's happening, what FARaudit does, and every compliance requirement.
          </p>
        </div>

        {/* VIEW TOGGLE */}
        <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap" as const}}>
          {(["lifecycle","competitor"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",border:`0.5px solid ${BORDER2}`,
                background: view===v ? NAVY : WHITE,
                color: view===v ? "#e2e8f2" : MUTED,
                transition:"all 0.15s"}}>
              {v==="lifecycle" ? "Lifecycle explorer" : "Competitive gap map"}
            </button>
          ))}
        </div>

        {/* ── VIEW 1: LIFECYCLE ── */}
        {view==="lifecycle" && <>
          {/* Progress */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:SUBTLE,fontWeight:500,letterSpacing:"0.04em"}}>Stage {cur+1} of {STAGES.length}</span>
              <span style={{fontSize:11,color:SUBTLE,fontWeight:500}}>{pct}%</span>
            </div>
            <div style={{height:3,background:BORDER,borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",background:NAVY,borderRadius:2,width:`${pct}%`,transition:"width 0.35s ease"}} />
            </div>
          </div>

          {/* Stage Rail */}
          <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`0.5px solid ${BORDER2}`,marginBottom:16,background:WHITE}}>
            {STAGES.map((st,i) => (
              <div key={i} onClick={() => goTo(i)}
                style={{flex:1,padding:"10px 3px 8px",textAlign:"center" as const,cursor:"pointer",
                  borderRight: i<STAGES.length-1 ? `0.5px solid ${BORDER}` : "none",
                  background: i===cur ? NAVY : i<cur ? SURFACE2 : WHITE,
                  transition:"background 0.15s"}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.06em",marginBottom:3,
                  color: i===cur ? LIGHT : SUBTLE}}>{st.num}</div>
                <div style={{fontSize:9,lineHeight:1.3,
                  color: i===cur ? "#e2e8f2" : MUTED,
                  fontWeight: i===cur ? 600 : 400}}>
                  {st.label.split("\n").map((l,j) => <span key={j}>{l}{j===0 && st.label.includes("\n") && <br/>}</span>)}
                </div>
                <div style={{width:5,height:5,borderRadius:"50%",margin:"4px auto 0",
                  background: st.fa ? (i===cur ? BLUE : BORDER2) : "transparent"}} />
              </div>
            ))}
          </div>

          {/* Stage Card */}
          <div style={{border:`0.5px solid ${BORDER2}`,borderRadius:12,overflow:"hidden",background:WHITE,marginBottom:14}}>
            {/* Card header */}
            <div style={{padding:"18px 22px 14px",background: s.fa ? NAVY : "#3d3d3a"}}>
              <div style={{fontSize:10,color:LIGHT,letterSpacing:"0.1em",textTransform:"uppercase" as const,marginBottom:6,fontWeight:700}}>Stage {s.num}</div>
              <div style={{fontSize:20,fontWeight:700,color:"#e2e8f2",marginBottom:4}}>{s.title}</div>
              <div style={{fontSize:12,color:LIGHT,opacity:0.85}}>{s.sub}</div>
            </div>

            {/* Inner tabs */}
            <div style={{display:"flex",borderBottom:`0.5px solid ${BORDER}`,background:WHITE}}>
              {["Overview","FARaudit","Clauses","Risks"].map((t,i) => (
                <button key={i} onClick={() => setInnerTab(i)}
                  style={{flex:1,padding:"10px 8px",fontSize:11,fontWeight:500,cursor:"pointer",textAlign:"center" as const,
                    color: innerTab===i ? "#185FA5" : MUTED,
                    background: innerTab===i ? PALE : "transparent",
                    border:"none",borderBottom: innerTab===i ? `2px solid #185FA5` : "2px solid transparent",
                    transition:"all 0.15s"}}>
                  {t}
                  {i===3 && s.risks.length>0 && <span style={{background:RED_BG,color:RED_TXT,fontSize:9,padding:"1px 5px",borderRadius:8,marginLeft:4}}>{s.risks.length}</span>}
                  {i===2 && s.clauses.length>0 && <span style={{background:SURFACE2,color:MUTED,fontSize:9,padding:"1px 5px",borderRadius:8,marginLeft:4}}>{s.clauses.length}</span>}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div style={{padding:"20px 22px"}}>
              {innerTab===0 && <OverviewPanel s={s} />}
              {innerTab===1 && <FARauditPanel s={s} />}
              {innerTab===2 && <ClausesPanel s={s} />}
              {innerTab===3 && <RisksPanel s={s} openRisk={openRisk} setOpenRisk={setOpenRisk} />}
            </div>
          </div>

          {/* Nav buttons */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={() => nav(-1)} disabled={cur===0}
              style={{padding:"8px 20px",fontSize:12,borderRadius:6,cursor:cur===0?"default":"pointer",fontWeight:600,border:`0.5px solid ${BORDER2}`,background:"transparent",color:MUTED,opacity:cur===0?0.3:1}}>
              ← Previous
            </button>
            <span style={{fontSize:12,color:SUBTLE}}>Stage {cur+1} of {STAGES.length}</span>
            <button onClick={() => nav(1)} disabled={cur===STAGES.length-1}
              style={{padding:"8px 20px",fontSize:12,borderRadius:6,cursor:cur===STAGES.length-1?"default":"pointer",fontWeight:600,border:`0.5px solid ${NAVY}`,background:NAVY,color:"#e2e8f2",opacity:cur===STAGES.length-1?0.3:1}}>
              Next stage →
            </button>
          </div>
        </>}

        {/* ── VIEW 2: COMPETITOR MAP ── */}
        {view==="competitor" && <>
          <div style={{fontSize:15,fontWeight:700,color:NAVY,marginBottom:14}}>Where competitors enter vs. where FARaudit starts</div>

          {/* Timeline strip */}
          <div style={{marginBottom:32}}>
            <div style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:12,marginBottom:4}}>
              <div/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4}}>
                {STAGES.map((st,i) => (
                  <div key={i} style={{fontSize:9,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.04em",textAlign:"center" as const,color:SUBTLE}}>
                    {st.num}<br/>{st.label.split("\n")[0]}
                  </div>
                ))}
              </div>
            </div>
            {COMPANIES.map((c,ci) => (
              <div key={ci} style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:12,alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:TEXT,textAlign:"right" as const}}>{c.name}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4}}>
                  {STAGES.map((_,i) => (
                    <div key={i} style={{height:32,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,
                      background: c.active.includes(i) ? (c.name==="FARaudit" ? NAVY : RED_BG) : SURFACE2,
                      color: c.active.includes(i) ? (c.name==="FARaudit" ? LIGHT : RED_TXT) : SUBTLE}}>
                      {c.active.includes(i) ? (c.name==="FARaudit" ? "Active" : "Partial") : "—"}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",border:`0.5px solid ${BORDER2}`,borderRadius:8,overflow:"hidden",fontSize:12,marginBottom:14}}>
            {["Capability","FARaudit","Generic AI","Manual"].map((h,i) => (
              <div key={i} style={{background: i===0 ? NAVY : BLUE,color:"#e2e8f2",padding:"10px 12px",fontWeight:700,fontSize:11}}>{h}</div>
            ))}
            {COMP_ROWS.map((row,ri) => row.map((cell,ci) => (
              <div key={`${ri}-${ci}`} style={{padding:"9px 12px",borderBottom:`0.5px solid ${BORDER}`,borderRight: ci<3 ? `0.5px solid ${BORDER}` : "none",
                fontWeight: ci===0 ? 500 : 600,
                color: cell==="✓" ? GREEN_TXT : cell==="✗" ? RED_TXT : cell==="Partial" ? AMBER_TXT : TEXT,
                background: ci===1 ? "rgba(24,95,165,0.05)" : WHITE}}>
                {cell}
              </div>
            )))}
          </div>

          {/* Moat */}
          <div style={{background:PALE,border:`0.5px solid ${LIGHT}`,borderRadius:8,padding:"14px 18px"}}>
            <div style={{fontSize:12,fontWeight:700,color:NAVY,marginBottom:8}}>The competitive moat</div>
            {["Stages 01–02 are exclusively FARaudit. No competitor monitors Pre-Sol Synopses or drafts RFI responses at scale.",
              "SOW/PWS/SOO Classifier changes the bid strategy output — not just a compliance check.",
              "Three-call audit architecture handles large IDIQ solicitations without token truncation. Single-call tools fail at scale."].map((m,i) => (
              <div key={i} style={{fontSize:12,color:"#1e40af",padding:"4px 0",lineHeight:1.5,display:"flex",gap:8}}>
                <span style={{color:"#16a34a",fontWeight:700}}>→</span>{m}
              </div>
            ))}
          </div>
        </>}

      </div>
    </div>
  );
}
