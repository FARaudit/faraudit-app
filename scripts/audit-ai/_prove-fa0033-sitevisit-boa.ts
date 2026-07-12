import { loadRunRecord } from "./run-record-io";
async function emit(flags: Record<string,string>) {
  for (const k of ["AUDIT_NOTICE_BODY_ELIG_FLOOR","AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE","AUDIT_NOTICE_BODY_BOA_EMIT"]) delete process.env[k];
  Object.assign(process.env, flags);
  const mod = await import("../../src/lib/audit-orchestrator?ts=" + Math.random().toString(36).slice(2)); // fresh module read of env
  const rec = loadRunRecord("scripts/audit-ai/run-records/FA813726R0033.66897b8a-0e19-4669-9bc2-541cf31dabe9.run-record.json");
  const full = (rec.input as any).fullSource as string;
  return (mod as any).emitNoticeBodyEligBarFindings(full, [], (rec.input as any).noticeBodyText ?? null);
}
(async () => {
  // env is read at call-time (process.env.X === "true"), so a single import suffices; set per-scenario.
  const { emitNoticeBodyEligBarFindings } = await import("../../src/lib/audit-orchestrator");
  const rec = loadRunRecord("scripts/audit-ai/run-records/FA813726R0033.66897b8a-0e19-4669-9bc2-541cf31dabe9.run-record.json");
  const full = (rec.input as any).fullSource as string;
  const run = (flags: Record<string,string>) => {
    for (const k of ["AUDIT_NOTICE_BODY_ELIG_FLOOR","AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE","AUDIT_NOTICE_BODY_BOA_EMIT"]) delete process.env[k];
    Object.assign(process.env, flags);
    return emitNoticeBodyEligBarFindings(full, [], (rec.input as any).noticeBodyText ?? null);
  };
  const show = (label: string, fs: any[]) => {
    console.log(`\n── ${label} — ${fs.length} findings ──`);
    for (const f of fs) console.log(`  [${f.lens}] ${(f.requirement||"").slice(0,170)}`);
  };

  show("BASELINE (all OFF) — must be inert", run({}));
  show("ELIG_FLOOR only (no new flags)", run({ AUDIT_NOTICE_BODY_ELIG_FLOOR: "true" }));
  show("ELIG_FLOOR + SITEVISIT_CONCLUDED_NOTICEWIDE (site-visit staleness fix)", run({ AUDIT_NOTICE_BODY_ELIG_FLOOR: "true", AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE: "true" }));
  show("ELIG_FLOOR + BOA_EMIT (BOA-holder emitter)", run({ AUDIT_NOTICE_BODY_ELIG_FLOOR: "true", AUDIT_NOTICE_BODY_BOA_EMIT: "true" }));
  show("ALL new flags ON (both fixes together)", run({ AUDIT_NOTICE_BODY_ELIG_FLOOR: "true", AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE: "true", AUDIT_NOTICE_BODY_BOA_EMIT: "true" }));
})();
