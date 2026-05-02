"use client";

import type { TabKey, TabSpec } from "./BdOsShell";

interface Props {
  tabs: TabSpec[];
  active: TabKey;
  onSelect: (k: TabKey) => void;
}

export default function TabNav({ tabs, active, onSelect }: Props) {
  return (
    <nav
      style={{
        display: "flex",
        borderBottom: "1px solid var(--bd-border)",
        background: "rgba(6,15,28,.8)",
        flexShrink: 0,
        overflowX: "auto"
      }}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            style={{
              padding: "12px 18px",
              fontFamily: "var(--bd-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: isActive ? "var(--gold2)" : "var(--t40)",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${isActive ? "var(--gold)" : "transparent"}`,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
              textTransform: "uppercase"
            }}
          >
            {t.dot && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background:
                    t.dot === "red" ? "var(--red)" :
                    t.dot === "gold" ? "var(--gold)" :
                    t.dot === "green" ? "var(--green)" :
                    "var(--blue)"
                }}
              />
            )}
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                style={{
                  fontFamily: "var(--bd-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 8,
                  ...(t.countTone === "red" && {
                    background: "rgba(220,38,38,.15)",
                    color: "var(--red)",
                    border: "1px solid rgba(220,38,38,.22)"
                  }),
                  ...(t.countTone === "gold" && {
                    background: "rgba(201,168,76,.1)",
                    color: "var(--gold)",
                    border: "1px solid rgba(201,168,76,.2)"
                  }),
                  ...(t.countTone === "green" && {
                    background: "rgba(74,222,128,.08)",
                    color: "var(--green)",
                    border: "1px solid rgba(74,222,128,.15)"
                  })
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
