import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { sniffImageType } from "@/lib/capability-statement-logo";
import { naicsLines } from "@/lib/capability-statement-naics";
import { orderForAgency, resolveAgency } from "@/lib/capability-statement-tailoring";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import React from "react";

/**
 * THE DOCUMENT MUST NOT FAIL TO DOWNLOAD BECAUSE OF A LOGO.
 *
 * Handing @react-pdf/renderer a URL makes it fetch during render, and a 404, a slow
 * bucket or a DNS blip then throws out of renderToBuffer — the customer clicks Download
 * PDF and gets a 500 for a decoration. The bytes are fetched here instead, with a
 * timeout, and a failure returns null so the statement renders without the logo.
 *
 * The bytes are re-sniffed even though the upload route already did. This URL is read
 * out of a database row, and the only thing that should ever reach a PDF renderer from
 * there is one of three image formats.
 */
async function fetchLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return null;
    return sniffImageType(buf) ? buf : null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 56, paddingBottom: 70, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { borderBottom: "2pt solid #378ADD", paddingBottom: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 3 },
  logo: { maxHeight: 44, maxWidth: 160, marginBottom: 8, objectFit: "contain" },
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

interface CapStmt {
  company_name?: string | null;
  logo_url?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  duns?: string | null;
  naics_codes?: string[];
  certifications?: string[];
  core_competencies?: string | null;
  differentiators?: string | null;
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

function CapDoc({ stmt, generatedAt, logo, agency }: { stmt: CapStmt; generatedAt: string; logo: Buffer | null; agency: string | null }): React.ReactElement {
  // No fallback. A capability statement is a document the customer sends to a
  // contracting officer under their own name; printing a placeholder on the letterhead
  // puts words in their mouth on government-facing paper. The GET refuses to render at
  // all when the name is unset, so this is never reached empty.
  const company = stmt.company_name as string;
  const naics = stmt.naics_codes || [];
  const certs = stmt.certifications || [];
  // Tailored editions reorder; they never filter and never add prose.
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
            {logo ? <Image src={logo} style={styles.logo} /> : null}
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
        {stmt.core_competencies ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CORE COMPETENCIES</Text>
            <Text style={styles.body}>{stmt.core_competencies}</Text>
          </View>
        ) : null}

        {certs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>CERTIFICATIONS</Text>
            <Text style={styles.body}>{certs.join(" · ")}</Text>
          </View>
        ) : null}

        {stmt.differentiators ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>DIFFERENTIATORS</Text>
            <Text style={styles.body}>{stmt.differentiators}</Text>
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

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: stmt } = await supabase
    .from("capability_statements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!stmt) return NextResponse.json({ error: "no capability statement saved yet" }, { status: 404 });

  // REFUSE rather than substitute. This document goes to a contracting officer under
  // the customer's name; rendering one headed with a placeholder is worse than not
  // rendering one at all, because the customer cannot see the letterhead before it is
  // sent on their behalf.
  if (!String((stmt as CapStmt).company_name || "").trim()) {
    return NextResponse.json(
      { error: "Add your company name before exporting — a capability statement is sent under it." },
      { status: 409 }
    );
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  // Validated against the record: an edition may only name an agency the customer has
  // a recorded award with, so a query string cannot invent relevance.
  const agency = resolveAgency((stmt as CapStmt).past_performance, req.nextUrl.searchParams.get("agency"));
  const logo = await fetchLogo((stmt as CapStmt).logo_url);
  const buffer = await renderToBuffer(<CapDoc stmt={stmt as CapStmt} generatedAt={generatedAt} logo={logo} agency={agency} />);
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const slug = String((stmt as CapStmt).company_name).replace(/[^A-Za-z0-9_-]+/g, "_");
  const edition = agency ? `-${agency.replace(/[^A-Za-z0-9]+/g, "_")}` : "";
  const filename = `${slug}${edition}-CapabilityStatement-${generatedAt}.pdf`;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
