// THE DOCUMENT, SEPARATE FROM THE ROUTE THAT SERVES IT.
//
// Extracted so a test can actually RENDER it. Everything in the suite up to this point
// was static analysis of source text: it would have caught a deleted call, and it would
// not have caught @react-pdf/renderer throwing at render time, or a dependency upgrade
// changing what a valid document is. A route that 500s on every download stayed green.
import { Document } from "@react-pdf/renderer";
import React from "react";
import { registerCapabilityFonts } from "@/lib/capability-statement-fonts";
import { PlatePage } from "@/lib/capability-statement-plate";

export interface CapStmt {

  company_name?: string | null;
  logo_url?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  duns?: string | null;
  naics_codes?: string[];
  certifications?: string[];
  core_competencies?: string | null;
  differentiators?: string | null;
  core_competencies_json?: unknown;
  differentiators_json?: unknown;
  contact_name?: string | null;
  /** Optional. The design consumes it when present and drops the whole clause when it is
   *  absent — the comma belongs to the title, so a null one cannot leave a trailing comma. */
  contact_title?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_website?: string | null;
  contact_address?: string | null;
  past_performance?: Array<{
    notice_id?: string | null;
    title?: string | null;
    agency?: string | null;
    naics_code?: string | null;
    contract_value?: string | number | null;
    period?: string | null;
  }>;
}



export function CapDoc({ stmt, generatedAt, logo, agency }: { stmt: CapStmt; generatedAt: string; logo: Buffer | null; agency: string | null }): React.ReactElement {
  // THE SPEC PLATE IS THE DOCUMENT. Registered first: react-pdf resolves families at render
  // time, and a page composed before the faces exist is laid out against the fallback and
  // keeps those metrics. Registration is idempotent and reports whether the faces are real,
  // so a substituted document is a logged fact rather than a silent one.
  registerCapabilityFonts();
  // Refuses for the same reason the old body did — a letterhead is not a placeholder.
  if (!stmt || !String(stmt.company_name || "").trim()) {
    throw new Error("capability statement has no company name — refusing to render a letterhead");
  }
  return (
    <Document>
      <PlatePage stmt={stmt} generatedAt={generatedAt} logo={logo} agency={agency} />
    </Document>
  );
}
