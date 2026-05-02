import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { borderBottom: "2pt solid #C9A84C", paddingBottom: 14, marginBottom: 22, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  brandGold: { color: "#C9A84C" },
  meta: { fontSize: 8, color: "#475569", textAlign: "right" },
  companyName: { fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 12, marginBottom: 4 },
  tagline: { fontSize: 10, color: "#475569", marginBottom: 18 },
  uei: { fontSize: 9, color: "#C9A84C", marginBottom: 18 },
  sectionEyebrow: { fontSize: 8, color: "#C9A84C", letterSpacing: 1.5, marginTop: 14, marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 },
  body: { fontSize: 10, color: "#0f172a", lineHeight: 1.5, marginBottom: 6 },
  small: { fontSize: 9, color: "#475569", lineHeight: 1.5, marginBottom: 4 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  pill: { fontSize: 9, padding: "2pt 8pt", border: "1pt solid #C9A84C", color: "#C9A84C", marginRight: 4, marginBottom: 4, borderRadius: 2 },
  pastRow: { borderLeft: "2pt solid #C9A84C", paddingLeft: 8, marginBottom: 8 },
  pageNum: { position: "absolute", bottom: 32, left: 56, right: 56, textAlign: "center", fontSize: 8, color: "#94a3b8" }
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
  const contactBits = [stmt.contact_name, stmt.contact_email, stmt.contact_phone, stmt.contact_website].filter(Boolean) as string[];

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
        {stmt.uei && <Text style={styles.uei}>UEI · {stmt.uei}{stmt.cage_code ? `   ·   CAGE · ${stmt.cage_code}` : ""}</Text>}

        <Text style={styles.sectionEyebrow}>CORE COMPETENCIES</Text>
        <Text style={styles.body}>{stmt.core_competencies || "—"}</Text>

        <Text style={styles.sectionEyebrow}>NAICS</Text>
        <View style={styles.pillRow}>
          {naics.length === 0 && <Text style={styles.small}>None registered.</Text>}
          {naics.map((n) => <Text key={n} style={styles.pill}>{n}</Text>)}
        </View>

        <Text style={styles.sectionEyebrow}>CERTIFICATIONS</Text>
        <View style={styles.pillRow}>
          {certs.length === 0 && <Text style={styles.small}>None recorded.</Text>}
          {certs.map((c) => <Text key={c} style={styles.pill}>{c}</Text>)}
        </View>

        <Text style={styles.sectionEyebrow}>DIFFERENTIATORS</Text>
        <Text style={styles.body}>{stmt.differentiators || "—"}</Text>

        <Text style={styles.sectionEyebrow}>PAST PERFORMANCE</Text>
        {past.length === 0 && <Text style={styles.small}>No prior contract awards on record.</Text>}
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

        <Text style={styles.sectionEyebrow}>CONTACT</Text>
        {contactBits.length === 0 && <Text style={styles.small}>No contact information set.</Text>}
        {contactBits.map((c, i) => <Text key={i} style={styles.body}>{c}</Text>)}
        {stmt.contact_address && <Text style={styles.small}>{stmt.contact_address}</Text>}

        <Text
          style={styles.pageNum}
          fixed
          render={({ pageNumber, totalPages }) => `${company} · ${generatedAt} · Page ${pageNumber} of ${totalPages}`}
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
