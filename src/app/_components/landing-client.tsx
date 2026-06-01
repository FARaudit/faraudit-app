"use client";

import { useEffect } from "react";

/**
 * LandingClient — renders the Claude Design root-landing HTML as a hydrated
 * React component. The HTML is read server-side from public/root-landing.html
 * by the parent page.tsx, then extracted into three parts and passed here:
 *
 *   - style:  inline <style> block content (the design's CSS tokens + rules)
 *   - body:   markup between <body>...</body>, minus inline <script> tags
 *   - script: inline <script> content (nav-scroll + reveal animations)
 *
 * We re-mount the script via a <script> element in useEffect so the
 * animation handlers actually attach. dangerouslySetInnerHTML alone would
 * inject the script tag but the browser would NOT execute it.
 *
 * Replaces the prior 379-line custom React landing. The previous version
 * is preserved in git history at HEAD~ for rollback reference.
 */

interface LandingClientProps {
  style: string;
  body: string;
  script: string;
}

export default function LandingClient({ style, body, script }: LandingClientProps) {
  useEffect(() => {
    if (!script) return;
    const tag = document.createElement("script");
    tag.textContent = script;
    document.body.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, [script]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
