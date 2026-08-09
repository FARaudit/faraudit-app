import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 56, paddingBottom: 70, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { borderBottom: "2pt solid #378ADD", paddingBottom: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  brandGold: { color: "#378ADD" },
  meta: { fontSize: 8, color: "#475569", textAlign: "right" },
  companyName: { fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 8, marginBottom: 10 },
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

function CapDoc({ stmt, generatedAt }: { stmt: CapStmt; generatedAt: string }): React.ReactElement {
  // No fallback. A capability statement is a document the customer sends to a
  // contracting officer under their own name; printing a placeholder on the letterhead
  // puts words in their mouth on government-facing paper. The GET refuses to render at
  // all when the name is unset, so this is never reached empty.
  const company = stmt.company_name as string;
  const naics = stmt.naics_codes || [];
  const certs = stmt.certifications || [];
  const past = stmt.past_performance || [];

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>FAR<Text style={styles.brandGold}>audit</Text></Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 3 }}>Capability Statement</Text>
          </View>
          <View style={styles.meta}>
            <Text>{generatedAt}</Text>
          </View>
        </View>

        <Text style={styles.companyName}>{company}</Text>

        <View style={styles.contactGrid}>
          <View style={styles.contactCol}>
            {stmt.uei && <Text style={styles.contactLine}>UEI · {stmt.uei}</Text>}
            {stmt.cage_code && <Text style={styles.contactLine}>CAGE · {stmt.cage_code}</Text>}
            {naics.length > 0 && <Text style={styles.contactLine}>NAICS · {naics.join(", ")}</Text>}
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
          render={({ pageNumber }) => `FARaudit Federal Contract Intelligence  |  Page ${pageNumber}  |  Confidential`}
        />
      </Page>
    </Document>
  );
}

export async function GET(_req: NextRequest) {
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
  const buffer = await renderToBuffer(<CapDoc stmt={stmt as CapStmt} generatedAt={generatedAt} />);
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const slug = String((stmt as CapStmt).company_name).replace(/[^A-Za-z0-9_-]+/g, "_");
  const filename = `FARaudit-${slug}-CapabilityStatement-${generatedAt}.pdf`;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
