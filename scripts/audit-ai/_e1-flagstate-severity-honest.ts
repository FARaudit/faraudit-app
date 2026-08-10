// Is AUDIT_SEVERITY_HONEST live? It gates dedupeByExcerpt, which is where review finding #5 lands.
// Render flags live on VERCEL (the render substrate), not Railway — [[feedback_render_flags_belong_on_vercel]].
// This one already told the truth about unreadable vars — it is the model the others were fixed to. Its only defect
// was echoing the value itself (Rule 32); it now prints the `=== "true"` outcome and the byte length instead.
import { classifyEnv, equals, describe, type RawVercelEnv } from "./vercel-env-state";

const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD", TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
(async () => {
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN missing"); process.exit(1); }
  const j: any = await (await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const envs = (j.envs || j.env || []) as RawVercelEnv[];
  const want = ["AUDIT_SEVERITY_HONEST", "AUDIT_EXCERPT_HEAD_REGROUND", "AUDIT_REPORT_V5", "AUDIT_CITATION_FIDELITY"];
  for (const k of want) {
    const state = classifyEnv(envs, k);
    const isTrue = equals(state, "true");
    console.log(`${k.padEnd(32)} ${describe(state)} · === "true": ${isTrue === null ? "UNKNOWABLE" : isTrue}`);
  }
})();
