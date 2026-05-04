"use client";

// Phone graceful-landing advisory (Prompt 15). Renders only at viewport widths
// under 768px and only once per session (sessionStorage dismiss flag). Mounts
// in app/layout.tsx between AuthShell and the route content. SSR-safe — first
// render is null, banner appears after hydration if both viewport + dismiss
// checks pass. No layout shift on desktop because the entire component is
// gated behind the post-mount check.

import { useEffect, useState } from "react";

const STORAGE_KEY = "faraudit-mobile-advisory-dismissed";

export default function MobileAdvisory() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 768) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* private mode · still show the banner */
    }
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        background: "rgba(201,168,76,0.10)",
        borderBottom: "1px solid rgba(201,168,76,0.28)",
        padding: "10px 14px",
        fontSize: 12,
        lineHeight: 1.5,
        color: "#E2E8F2",
        fontFamily: "Inter, system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        gap: 10
      }}
    >
      <span style={{ flex: 1 }}>
        FARaudit is built for tablet and desktop.{" "}
        <strong style={{ color: "#C9A84C" }}>Open on iPad or laptop</strong> for full Intelligence access.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.55)",
          cursor: "pointer",
          fontSize: 20,
          lineHeight: 1,
          padding: 4,
          flexShrink: 0
        }}
      >
        ×
      </button>
    </div>
  );
}
