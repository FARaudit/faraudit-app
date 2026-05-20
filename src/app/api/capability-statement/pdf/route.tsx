import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 56, paddingBottom: 70, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { borderBottom: "2pt solid #C9A84C", paddingBottom: 14, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  brandGold: { color: "#C9A84C" },
  meta: { fontSize: 8, color: "#475569", textAlign: "right" },
  companyName: { fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 8, marginBottom: 10 },
  contactGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  contactCol: { flexDirection: "column", flexGrow: 1, flexBasis: 0 },
  contactColRight: { flexDirection: "column", flexGrow: 1, flexBasis: 0 },
  contactLine: { fontSize: 9, color: "#0f172a", lineHeight: 1.5, marginBottom: 2 },
  contactLineRight: { fontSize: 9, color: "#0f172a", lineHeight: 1.5, marginBottom: 2, textAlign: "right" },
  section: { marginBottom: 12 },
  sectionEyebrow: { fontSize: 8, color: "#C9A84C", letterSpacing: 1.5, marginBottom: 4 },
  body: { fontSize: 10, color: "#0f172a", lineHeight: 1.5 },
  small: { fontSize: 9, color: "#475569", lineHeight: 1.5 },
  pastRow: { borderLeft: "2pt solid #C9A84C", paddingLeft: 8, marginBottom: 8 },
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
  const company = stmt.company_name || "Your Company";
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
            {stmt.contact_phone && <Text style={styles.contactLineRight}>{stmt.contact_phone}</Text>}
            {stmt.contact_website && <Text style={styles.contactLineRight}>{stmt.contact_website}</Text>}
            {stmt.contact_address && <Text style={styles.contactLineRight}>{stmt.contact_address}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CORE COMPETENCIES</Text>
          <Text style={styles.body}>{stmt.core_competencies || "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CERTIFICATIONS</Text>
          <Text style={styles.body}>{certs.length > 0 ? certs.join(" · ") : "None recorded."}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>DIFFERENTIATORS</Text>
          <Text style={styles.body}>{stmt.differentiators || "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>PAST PERFORMANCE</Text>
          {past.length === 0 && <Text style={styles.small}>Past performance populates automatically as you win contracts through FARaudit.</Text>}
          {past.slice(0, 12).map((p, i) => (
            <View key={i} style={styles.pastRow} wrap={false}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>{p.title || p.notice_id || "—"}</Text>
              <Text style={styles.small}>
                {p.agency || "—"}{p.naics_code ? ` · NAICS ${p.naics_code}` : ""}
                {p.contract_value ? ` · ${p.contract_value}` : ""}
                {p.period ? ` · ${p.period}` : ""}
              </Text>
            </View>
          ))}
        </View>

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

  const generatedAt = new Date().toISOString().slice(0, 10);
  const buffer = await renderToBuffer(<CapDoc stmt={stmt as CapStmt} generatedAt={generatedAt} />);
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const slug = String(((stmt as CapStmt).company_name) || "capability").replace(/[^A-Za-z0-9_-]+/g, "_");
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
