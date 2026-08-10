// THE DOCUMENT, SEPARATE FROM THE ROUTE THAT SERVES IT.
//
// Extracted so a test can actually RENDER it. Everything in the suite up to this point
// was static analysis of source text: it would have caught a deleted call, and it would
// not have caught @react-pdf/renderer throwing at render time, or a dependency upgrade
// changing what a valid document is. A route that 500s on every download stayed green.
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import React from "react";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { naicsLines } from "@/lib/capability-statement-naics";
import { orderForAgency } from "@/lib/capability-statement-tailoring";
import { resolveCompetencies, resolveDifferentiators } from "@/lib/capability-statement-sections";
import { imageSize, fitWithin, LOGO_BOX } from "@/lib/capability-statement-logo";

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

const styles = StyleSheet.create({
  page: { padding: 56, paddingBottom: 70, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { borderBottom: "2pt solid #378ADD", paddingBottom: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 3 },

  naicsEyebrow: { fontSize: 7, color: "#94a3b8", letterSpacing: 1.1, marginBottom: 1 },
  meta: { fontSize: 8, color: "#475569", textAlign: "right" },
  contactGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  contactCol: { flexDirection: "column", flexGrow: 1, flexBasis: 0 },
  contactColRight: { flexDirection: "column", flexGrow: 1, flexBasis: 0 },
  contactLine: { fontSize: 9, color: "#0f172a", lineHeight: 1.5, marginBottom: 2 },
  contactLineRight: { fontSize: 9, color: "#0f172a", lineHeight: 1.5, marginBottom: 2, textAlign: "right" },
  section: { marginBottom: 12 },
  sectionEyebrow: { fontSize: 8, color: "#378ADD", letterSpacing: 1.5, marginBottom: 4 },
  body: { fontSize: 10, color: "#0f172a", lineHeight: 1.5 },
  small: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
  pastRow: { borderLeft: "2pt solid #378ADD", paddingLeft: 8, marginBottom: 8 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8" }
});


export function CapDoc({ stmt, generatedAt, logo, agency }: { stmt: CapStmt; generatedAt: string; logo: Buffer | null; agency: string | null }): React.ReactElement {
  // No fallback. A capability statement is a document the customer sends to a
  // contracting officer under their own name; printing a placeholder on the letterhead
  // puts words in their mouth on government-facing paper. The GET refuses to render at
  // all when the name is unset, so this is never reached empty.
  const company = stmt.company_name as string;
  const naics = stmt.naics_codes || [];
  const certs = stmt.certifications || [];
  // Same resolver as the Word export and the page, so the three cannot disagree about one
  // profile: structured when it exists, the prose column when it does not.
  const comps = resolveCompetencies(stmt).items;
  const difs = resolveDifferentiators(stmt).items;
  // Tailored editions reorder; they never filter and never add prose.
  // Explicit width and height from the image's own dimensions. react-pdf does not honour
  // maxHeight/maxWidth the way a browser does, so a 1024px-square favicon filled the page.
  const logoBox = logo ? fitWithin(imageSize(logo), LOGO_BOX.width, LOGO_BOX.height) : null;
  const past = orderForAgency(stmt.past_performance || [], agency);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* THE CUSTOMER'S NAME IS THE LETTERHEAD. This document is sent to a
            contracting officer under their company's name; ours sitting above it reads
            like an invoice tool printing its own logo larger than the biller's. The
            FARaudit credit lives in the footer. */}
        <View style={styles.header} fixed>
          <View>
            {/* Absent when there is no logo, and absent when the fetch failed — never a
                placeholder mark the customer did not choose. */}
            {logo && logoBox ? <Image src={logo} style={{ width: logoBox.width, height: logoBox.height, marginBottom: 8 }} /> : null}
            <Text style={{ fontSize: 8, color: "#475569", letterSpacing: 1.2 }}>CAPABILITY STATEMENT</Text>
            <Text style={styles.brand}>{company}</Text>
          </View>
          <View style={styles.meta}>
            <Text>{generatedAt}</Text>
            {/* A statement about which edition this is, not a claim about the firm. */}
            {agency ? <Text style={{ marginTop: 2 }}>Prepared for {agency}</Text> : null}
          </View>
        </View>

        <View style={styles.contactGrid}>
          <View style={styles.contactCol}>
            {stmt.uei && <Text style={styles.contactLine}>UEI · {stmt.uei}</Text>}
            {stmt.cage_code && <Text style={styles.contactLine}>CAGE · {stmt.cage_code}</Text>}
            {/* One line per code with its 13 CFR 121.201 title, primary marked — the
                primary is the code the firm's size standard is judged against. An
                unknown code prints alone rather than with a guessed title. */}
            {naicsLines(naics).length > 0 ? (
              <View style={{ marginBottom: 2 }}>
                <Text style={styles.naicsEyebrow}>NAICS</Text>
                {naicsLines(naics).map((l) => (
                  <Text key={l.code} style={styles.contactLine}>
                    <Text style={{ fontWeight: 700 }}>{l.code}</Text>
                    {l.title ? `  ${l.title}` : ""}
                    {l.primary ? "  (primary)" : ""}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.contactColRight}>
            {stmt.contact_name && <Text style={styles.contactLineRight}>{stmt.contact_name}</Text>}
            {stmt.contact_email && <Text style={styles.contactLineRight}>{stmt.contact_email}</Text>}
            {stmt.contact_phone && <Text style={styles.contactLineRight}>{formatPhone(stmt.contact_phone)}</Text>}
            {stmt.contact_website && <Text style={styles.contactLineRight}>{stmt.contact_website}</Text>}
            {stmt.contact_address && <Text style={styles.contactLineRight}>{stmt.contact_address}</Text>}
          </View>
        </View>

        {/* A SECTION WITH NOTHING IN IT IS NOT PRINTED. An eyebrow over an em dash
            reads to a contracting officer as "asked and answered: nothing" — and on
            CERTIFICATIONS, "None recorded." is a statement about the firm's standing
            that the absence of a row does not support. Omit the heading instead. */}
        {comps.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CORE COMPETENCIES</Text>
            {comps.map((c, i) => (
              <View key={i} wrap={false}>
                <Text style={styles.body}>{[c.k, c.h].filter(Boolean).join(" — ")}</Text>
                {c.b ? <Text style={styles.body}>{c.b}</Text> : null}
                {c.s ? <Text style={styles.body}>{c.s}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {certs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CERTIFICATIONS</Text>
            <Text style={styles.body}>{certs.join(" · ")}</Text>
          </View>
        ) : null}

        {difs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>DIFFERENTIATORS</Text>
            {difs.map((d, i) => (
              <View key={i} wrap={false}>
                <Text style={styles.body}>{d.h}</Text>
                {d.b ? <Text style={styles.body}>{d.b}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Our product marketing does not belong in a document the customer sends to a
            contracting officer, so an empty section is simply absent. A row with no
            title and no notice id identifies no contract and is skipped rather than
            printed as a dash. */}
        {past.filter((p) => p.title || p.notice_id).length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>PAST PERFORMANCE</Text>
          {past.filter((p) => p.title || p.notice_id).slice(0, PAST_PERFORMANCE_EXPORT_LIMIT).map((p, i) => (
            <View key={i} style={styles.pastRow} wrap={false}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>{p.title || p.notice_id}</Text>
              <Text style={styles.small}>
                {p.agency || ""}{p.naics_code ? ` · NAICS ${p.naics_code}` : ""}
                {p.contract_value ? ` · ${p.contract_value}` : ""}
                {p.period ? ` · ${p.period}` : ""}
              </Text>
            </View>
          ))}
          {/* The customer read a longer list on screen, so the document says it is
              sending a selection. It does NOT print a total: this route reads the
              persisted row, which is already capped, so any "of N" it stated would be
              a number it cannot actually stand behind. */}
          {past.filter((p) => p.title || p.notice_id).length > PAST_PERFORMANCE_EXPORT_LIMIT ? (
            <Text style={{ fontSize: 8, color: "#94a3b8", marginTop: 2 }}>
              {`Showing the ${PAST_PERFORMANCE_EXPORT_LIMIT} most recent awards. Full past performance available on request.`}
            </Text>
          ) : null}
        </View>
        ) : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber }) => `${company}  |  Page ${pageNumber}  |  Confidential`}
        />
      </Page>
    </Document>
  );
}
