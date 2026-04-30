"use client";
import { useEffect, useState } from "react";

interface Opportunity {
  id: string;
  title: string;
  agency: string;
  naics: string;
  responseDeadline: string;
  setAside: string;
  solicitationNumber: string;
}

export default function SAMFeedPreview() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");

  useEffect(() => {
    fetch("/api/sam?naics=336413&limit=5")
      .then((r) => r.json())
      .then((data) => {
        setOpps(data.opportunities || []);
        setSource(data.source);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const daysUntil = (dateStr: string): number | null => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  };

  return (
    <div style={{ background: "#0A1628", border: ".5px solid #1e3a5f", borderRadius: "12px", padding: "24px", marginTop: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "10px", color: "#B5D4F4", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
            Live from SAM.gov
          </div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#e2e8f2" }}>Active solicitations — NAICS 336413</div>
        </div>
        <div
          style={{
            fontSize: "10px",
            padding: "3px 8px",
            borderRadius: "4px",
            background: source === "live" ? "rgba(16,185,129,.15)" : "rgba(245,158,11,.15)",
            color: source === "live" ? "#10B981" : "#F59E0B",
            fontWeight: 700
          }}
        >
          {source === "live" ? "● LIVE" : "● DEMO"}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#4a6a96", fontSize: "13px" }}>Loading solicitations...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {opps.map((opp) => {
            const days = daysUntil(opp.responseDeadline);
            return (
              <div
                key={opp.id}
                style={{ background: "#0D1F35", border: ".5px solid #1e3a5f", borderRadius: "8px", padding: "12px 14px", display: "flex", gap: "12px", alignItems: "flex-start" }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f2", marginBottom: "3px" }}>{opp.title}</div>
                  <div style={{ fontSize: "11px", color: "#4a6a96" }}>
                    {opp.agency} · {opp.solicitationNumber}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(183,212,244,.1)", color: "#B5D4F4", fontWeight: 700 }}>
                    {opp.setAside}
                  </div>
                  {days !== null && (
                    <div
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: days <= 7 ? "rgba(239,68,68,.15)" : days <= 14 ? "rgba(245,158,11,.15)" : "rgba(16,185,129,.15)",
                        color: days <= 7 ? "#FCA5A5" : days <= 14 ? "#FCD34D" : "#10B981",
                        fontWeight: 700
                      }}
                    >
                      {days}d left
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: "12px", fontSize: "11px", color: "#4a6a96" }}>
        {source === "demo" ? "⚠ Demo data shown. Register SAM_API_KEY for live feed." : `Showing ${opps.length} active small business solicitations.`}{" "}
        <a href="/audit" style={{ color: "#B5D4F4" }}>
          Run audit on any solicitation →
        </a>
      </div>
    </div>
  );
}
