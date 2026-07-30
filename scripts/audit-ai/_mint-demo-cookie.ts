import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import * as fs from "fs";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
(async () => {
  const admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: "demo@faraudit.com" });
  if (e1) { console.log("GENLINK ERR", e1.message); process.exit(1); }
  const tokenHash = (link as any).properties?.hashed_token;
  const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (e2 || !v.session) { console.log("VERIFY ERR", e2?.message); process.exit(1); }
  const jar: Record<string,string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: {
    getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => { jar[name] = value; }),
  }});
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token });
  const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: "www.faraudit.com", path: "/", httpOnly: false, secure: true, sameSite: "Lax" as const }));
  fs.writeFileSync("/tmp/_cab_cookies.json", JSON.stringify(cookies));
  console.log(`minted ${cookies.length} cookie(s) for demo@faraudit.com → /tmp/_cab_cookies.json (session user=${v.session.user.email})`);
})();
