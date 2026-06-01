import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import LandingClient from "./_components/landing-client";

// Auth-aware: signed-in visitors jump to /command-center; otherwise the
// Claude Design landing page renders. Renders are dynamic because we read
// the HTML file at request time — keeps the design source-of-truth in
// public/root-landing.html where it can be edited without a code build.
export const dynamic = "force-dynamic";

async function maybeRedirectToDashboard(): Promise<void> {
  try {
    const sb = await createServerClient();
    const {
      data: { user }
    } = await sb.auth.getUser();
    if (user) redirect("/command-center");
  } catch {
    /* never block the public landing on a transient auth-check error */
  }
}

interface LandingParts {
  style: string;
  body: string;
  script: string;
}

function extractParts(html: string): LandingParts {
  // First inline <style> block (the design's CSS tokens + rules)
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  // Last inline <script> block (the nav-scroll + reveal animation JS)
  const scriptMatches = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi));
  const scriptMatch = scriptMatches[scriptMatches.length - 1];
  // Everything between <body>...</body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  let body = bodyMatch ? bodyMatch[1] : html;
  // Strip inline <script> tags from body — they'd render as inert text via
  // dangerouslySetInnerHTML. LandingClient re-mounts them via useEffect.
  body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Also strip <template id="__bundler_thumbnail"> blocks (build artifact, not user-visible)
  body = body.replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "");

  return {
    style: styleMatch ? styleMatch[1] : "",
    body: body.trim(),
    script: scriptMatch ? scriptMatch[1] : ""
  };
}

export default async function HomePage() {
  await maybeRedirectToDashboard();

  const html = await readFile(
    path.join(process.cwd(), "public", "root-landing.html"),
    "utf8"
  );
  const parts = extractParts(html);

  return <LandingClient {...parts} />;
}
