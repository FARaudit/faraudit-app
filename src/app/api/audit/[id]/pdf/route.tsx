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
  noticeId: { fontSize: 11, color: "#C9A84C", marginTop: 14, marginBottom: 4 },
  title: { fontSize: 16, color: "#0f172a", marginBottom: 6 },
  agency: { fontSize: 9, color: "#475569", marginBottom: 18 },
  scoreLine: { flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 12 },
  scorePill: { fontSize: 11, fontWeight: 700, padding: "4pt 10pt", border: "1pt solid", borderRadius: 2 },
  sectionEyebrow: { fontSize: 8, color: "#C9A84C", letterSpacing: 1.5, marginTop: 14, marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 },
  body: { fontSize: 10, color: "#0f172a", lineHeight: 1.5, marginBottom: 6 },
  small: { fontSize: 9, color: "#475569", lineHeight: 1.5, marginBottom: 4 },
  riskRow: { borderLeft: "3pt solid #94a3b8", paddingLeft: 8, marginBottom: 6, paddingVertical: 4 },
  riskRowP0: { borderLeftColor: "#EF4444" },
  riskRowP1: { borderLeftColor: "#F59E0B" },
  riskRowP2: { borderLeftColor: "#10B981" },
  riskHead: { flexDirection: "row", gap: 8, marginBottom: 2 },
  riskTag: { fontSize: 8, fontWeight: 700, paddingHorizontal: 4 },
  clauseRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: "0.5pt solid #e2e8f0", paddingVertical: 3 },
  clauseText: { fontSize: 9, color: "#0f172a" },
  clauseTag: { fontSize: 8, color: "#475569" },
  pageNum: { position: "absolute", bottom: 32, left: 56, right: 56, textAlign: "center", fontSize: 8, color: "#94a3b8" }
});

interface PrioritizedRisk {
  text: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  citation?: string;
  recommended_action?: string;
}

function asList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || /^(none|n\/a)$/i.test(s)) return [];
    return [s];
  }
  return [];
}

function deriveRisks(risks: Record<string, unknown>): PrioritizedRisk[] {
  if (Array.isArray(risks.prioritized_risks)) {
    return (risks.prioritized_risks as PrioritizedRisk[]).filter((r) => r && typeof r.text === "string");
  }
  const out: PrioritizedRisk[] = [];
  const push = (arr: unknown, priority: PrioritizedRisk["priority"], category: string) => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) if (typeof r === "string" && r.trim()) out.push({ text: r, priority, category });
  };
  push(risks.top_3_risks, "P0", "Deal-breaker");
  push(risks.technical_risks, "P1", "Technical");
  push(risks.schedule_risks, "P1", "Schedule");
  push(risks.price_risks, "P1", "Price");
  push(risks.evaluation_risks, "P2", "Evaluation");
  return out;
}

interface AuditDocProps {
  audit: Record<string, unknown>;
  generatedAt: string;
}

function AuditDoc({ audit, generatedAt }: AuditDocProps): React.ReactElement {
  const noticeId = (audit.notice_id as string) || "—";
  const title = (audit.title as string) || "Untitled solicitation";
  const agency = (audit.agency as string) || "—";
  const naics = (audit.naics_code as string) || "";
  const setAside = (audit.set_aside as string) || "";
  const score = typeof audit.compliance_score === "number" ? (audit.compliance_score as number) : 0;
  const recommendation = (audit.recommendation as string) || "—";
  const docType = (audit.document_type as string) || "Other";
  const bidRecommendation = (audit.bid_recommendation as string) || "";
  const overviewJson = (audit.overview_json as Record<string, unknown>) || {};
  const compJson = (audit.compliance_json as Record<string, unknown>) || {};
  const risksJson = (audit.risks_json as Record<string, unknown>) || {};
  const farClauses = asList(compJson.far_clauses);
  const dfarsClauses = asList(compJson.dfars_clauses);
  const risks = deriveRisks(risksJson);
  const summary = String(overviewJson.summary || "");
  const notes = (audit.notes as string) || "";

  const verdictColor = recommendation === "PROCEED" ? "#10B981" : recommendation === "DECLINE" ? "#EF4444" : "#F59E0B";

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>FAR<Text style={styles.brandGold}>audit</Text></Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 3 }}>Federal Contract Intelligence Report</Text>
          </View>
          <View style={styles.meta}>
            <Text>{generatedAt}</Text>
            <Text>{noticeId}</Text>
          </View>
        </View>

        <Text style={styles.noticeId}>{noticeId} · {docType}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.agency}>
          {agency}{naics ? ` · NAICS ${naics}` : ""}{setAside ? ` · ${setAside}` : ""}
        </Text>

        <View style={styles.scoreLine}>
          <Text style={[styles.scorePill, { color: verdictColor, borderColor: verdictColor }]}>
            {recommendation === "PROCEED" ? "BID" : recommendation === "DECLINE" ? "DECLINE" : "CAUTION"}
          </Text>
          <Text style={[styles.scorePill, { color: "#0f172a", borderColor: "#94a3b8" }]}>SCORE {score}/100</Text>
        </View>

        <Text style={styles.sectionEyebrow}>SECTION 1 · CLASSIFICATION</Text>
        <Text style={styles.sectionTitle}>Document type: {docType}</Text>
        <Text style={styles.body}>{(audit.document_type_rationale as string) || "No rationale recorded."}</Text>

        <Text style={styles.sectionEyebrow}>SECTION 2 · OVERVIEW</Text>
        <Text style={styles.sectionTitle}>Solicitation summary</Text>
        <Text style={styles.body}>{summary || "No overview summary."}</Text>

        <Text style={styles.sectionEyebrow}>SECTION 3 · COMPLIANCE</Text>
        <Text style={styles.sectionTitle}>FAR ({farClauses.length}) · DFARS ({dfarsClauses.length})</Text>
        {farClauses.slice(0, 30).map((c, i) => (
          <View key={`far-${i}`} style={styles.clauseRow}>
            <Text style={styles.clauseText}>{c}</Text>
            <Text style={styles.clauseTag}>FAR</Text>
          </View>
        ))}
        {dfarsClauses.slice(0, 30).map((c, i) => (
          <View key={`dfars-${i}`} style={styles.clauseRow}>
            <Text style={styles.clauseText}>{c}</Text>
            <Text style={styles.clauseTag}>DFARS</Text>
          </View>
        ))}

        <Text style={styles.sectionEyebrow}>SECTION 4 · RISKS</Text>
        <Text style={styles.sectionTitle}>P0 · P1 · P2 register ({risks.length})</Text>
        {risks.length === 0 && <Text style={styles.small}>No risks surfaced.</Text>}
        {risks.map((r, i) => {
          const lvl = r.priority;
          const rowStyle = [styles.riskRow, lvl === "P0" ? styles.riskRowP0 : lvl === "P1" ? styles.riskRowP1 : styles.riskRowP2];
          return (
            <View key={i} style={rowStyle} wrap={false}>
              <View style={styles.riskHead}>
                <Text style={[styles.riskTag, { color: lvl === "P0" ? "#EF4444" : lvl === "P1" ? "#F59E0B" : "#10B981" }]}>{r.priority}</Text>
                <Text style={[styles.riskTag, { color: "#475569" }]}>{r.category}</Text>
                {r.citation && <Text style={[styles.riskTag, { color: "#C9A84C" }]}>{r.citation}</Text>}
              </View>
              <Text style={styles.body}>{r.text}</Text>
              {r.recommended_action && <Text style={styles.small}>Action: {r.recommended_action}</Text>}
            </View>
          );
        })}

        <Text style={styles.sectionEyebrow}>SECTION 5 · RECOMMENDATION</Text>
        <Text style={styles.sectionTitle}>{recommendation} · {score}/100</Text>
        <Text style={styles.body}>{bidRecommendation || "No recommendation rationale recorded."}</Text>

        {notes && (
          <>
            <Text style={styles.sectionEyebrow}>SECTION 7 · TEAM NOTES</Text>
            <Text style={styles.sectionTitle}>Internal annotations</Text>
            <Text style={styles.body}>{notes}</Text>
          </>
        )}

        <Text
          style={styles.pageNum}
          fixed
          render={({ pageNumber, totalPages }) => `${noticeId} · Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: audit, error } = await supabase.from("audits").select("*").eq("id", id).single();
  if (error || !audit) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  const generatedAt = new Date().toISOString().slice(0, 10);
  const buffer = await renderToBuffer(<AuditDoc audit={audit as Record<string, unknown>} generatedAt={generatedAt} />);
  // Copy into a fresh ArrayBuffer so the body type satisfies BodyInit cleanly
  // across Node.js Buffer + Uint8Array<ArrayBufferLike> generic shifts in newer TS lib.
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);

  const noticeId = String((audit as Record<string, unknown>).notice_id ?? "audit").replace(/[^A-Za-z0-9_-]+/g, "_");
  const filename = `FARaudit-${noticeId}-${generatedAt}.pdf`;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
