// Is AUDIT_SEVERITY_HONEST live? It gates dedupeByExcerpt, which is where review finding #5 lands.
// Render flags live on VERCEL (the render substrate), not Railway — [[feedback_render_flags_belong_on_vercel]].
const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD", TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";
(async () => {
  const token = process.env.VERCEL_TOKEN;
  if (!token) { console.error("VERCEL_TOKEN missing"); process.exit(1); }
  const j: any = await (await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const envs = (j.envs || j.env || []).filter((e: any) => typeof e.key === "string" && e.key.startsWith("AUDIT_") && Array.isArray(e.target) && e.target.includes("production"));
  const want = ["AUDIT_SEVERITY_HONEST", "AUDIT_EXCERPT_HEAD_REGROUND", "AUDIT_REPORT_V5", "AUDIT_CITATION_FIDELITY"];
  for (const k of want) {
    const e = envs.find((x: any) => x.key === k);
    console.log(`${k.padEnd(32)} ${e ? (e.type === "plain" ? `= ${e.value}` : `(${e.type}, value not readable)`) : "UNSET on Vercel production"}`);
  }
})();
