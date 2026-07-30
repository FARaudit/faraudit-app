// Fire the PRODUCTION refetch route as the demo user (front-door path — mirrors the one-click
// re-run button). Mints a demo session via the existing magiclink flow (_mint-demo-cookie.ts
// pattern), then POST /api/audit/<id>/refetch with {"force":true} so the current engine re-runs.
// Usage: npx tsx scripts/audit-ai/_demo-refetch.ts <audit-id> [host]   (host defaults to www.faraudit.com)
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const URL0 = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIT_ID = process.argv[2];
const HOST = process.argv[3] ?? "www.faraudit.com";
if (!AUDIT_ID) { console.error("usage: _demo-refetch.ts <audit-id> [host]"); process.exit(1); }

(async () => {
  const admin = createClient(URL0, SR, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: "demo@faraudit.com" });
  if (e1) { console.error("GENLINK ERR", e1.message); process.exit(1); }
  const tokenHash = (link as any).properties?.hashed_token;
  const anon = createClient(URL0, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (e2 || !v.session) { console.error("VERIFY ERR", e2?.message); process.exit(1); }
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL0, ANON, { cookies: {
    getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => { jar[name] = value; }),
  }});
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token });
  let cookieHeader = Object.entries(jar).map(([n, val]) => `${n}=${val}`).join("; ");
  // Protected preview deployments: exchange a _vercel_share token (env VERCEL_SHARE) for the
  // _vercel_jwt bypass cookie, then ride it alongside the app session cookies.
  const share = process.env.VERCEL_SHARE;
  if (share) {
    const ex = await fetch(`https://${HOST}/?_vercel_share=${share}`, { redirect: "manual" });
    const setc = ex.headers.get("set-cookie") ?? "";
    const jwt = setc.match(/_vercel_jwt=([^;]+)/)?.[1];
    if (jwt) { cookieHeader += `; _vercel_jwt=${jwt}`; console.log("preview bypass cookie acquired"); }
    else console.log(`WARN: no _vercel_jwt from share exchange (HTTP ${ex.status})`);
  }
  console.log(`session minted for ${v.session.user.email} · firing refetch on ${AUDIT_ID} …`);
  const t0 = Date.now();
  const res = await fetch(`https://${HOST}/api/audit/${AUDIT_ID}/refetch`, {
    method: "POST",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
    signal: AbortSignal.timeout(295_000),
  });
  const body = await res.text();
  console.log(`HTTP ${res.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
  try { console.log(JSON.stringify(JSON.parse(body), null, 1).slice(0, 2000)); } catch { console.log(body.slice(0, 2000)); }
})();
