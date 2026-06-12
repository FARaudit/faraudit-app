// FA-149 gate — graceful drain + orphan reclaim verification.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY)=" .env.local) && set +a && npx tsx test/verify-fa149-drain.ts
//
// Isolation: all fixtures use source='fa149_test' — the production worker
// claims ONLY source='user', so this suite can never race it. The worker
// module reads WORKER_SOURCE at import time; it is set below BEFORE import.
//
// Layers:
//   A — SIGTERM-mid-claim semantics: claim → releaseClaim() (the exact call
//       the signal handler makes) → row back to pending, attempts bumped.
//   B — hard-kill semantics: claim → backdate heartbeat (simulates SIGKILL'd
//       worker that stopped beating) → reclaimOrphans() → pending, attempts++.
//   C — poison-pill cap: third stale claim → failed, never re-pending.
//   D — handler wiring: spawn the real worker entry, SIGTERM it, assert the
//       drain log + clean exit 0.
// Pre-migration (heartbeat_at/attempts absent): B and C report BLOCKED, A and
// D still prove the drain path (release uses existing columns only).

process.env.WORKER_SOURCE = "fa149_test";

import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function insertFixture(extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await supabase
    .from("pending_audits")
    .insert({
      notice_id: "fa149-test-notice",
      title: "FA-149 drain/reclaim fixture",
      source: "fa149_test",
      status: "pending",
      ...extra
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture insert: ${error.message}`);
  return data.id as string;
}

async function rowState(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("pending_audits").select("*").eq("id", id).single();
  if (error) throw new Error(`rowState: ${error.message}`);
  return data;
}

async function main(): Promise<void> {
  const worker = await import("../agents/audit-worker/worker");
  const hasColumns = await worker.probeFa149Columns();
  console.log(`FA-149 columns (migration 20260612210000): ${hasColumns ? "PRESENT" : "ABSENT — B/C will report BLOCKED"}`);

  // ── A · SIGTERM-mid-claim: claim then release ──────────────────────────────
  const a = await insertFixture();
  const claimedA = await worker.claimNext();
  check("A1 claim acquires the fixture", claimedA?.id === a, `claimed ${claimedA?.id}`);
  let st = await rowState(a);
  check("A2 claimed row is processing with claimed_at", st.status === "processing" && !!st.claimed_at);
  const released = await worker.releaseClaim(claimedA!, "test: SIGTERM drain simulation");
  st = await rowState(a);
  check("A3 releaseClaim returns true", released);
  check("A4 row back to pending, claim cleared", st.status === "pending" && st.claimed_at === null, `status=${st.status} claimed_at=${st.claimed_at}`);
  if (hasColumns) {
    check("A5 attempts incremented on release", st.attempts === 1, `attempts=${st.attempts}`);
    check("A6 heartbeat cleared on release", st.heartbeat_at === null);
  }
  check("A7 release reason logged on row", String(st.error_message || "").includes("SIGTERM drain"));

  // ── B · hard-kill: stale heartbeat → reclaim ───────────────────────────────
  if (hasColumns) {
    const claimedB = await worker.claimNext(); // re-claims fixture A (attempts=1)
    check("B1 second claim acquires (attempt 2 incoming)", claimedB?.id === a);
    const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase.from("pending_audits").update({ heartbeat_at: staleIso }).eq("id", a);
    const reclaimed = await worker.reclaimOrphans();
    st = await rowState(a);
    check("B2 reclaimOrphans reclaimed exactly 1", reclaimed === 1, `reclaimed=${reclaimed}`);
    check("B3 row back to pending after dead-worker sim", st.status === "pending", `status=${st.status}`);
    check("B4 attempts=2 after reclaim", st.attempts === 2, `attempts=${st.attempts}`);
    check("B5 reclaim reason logged", String(st.error_message || "").includes("stale heartbeat"));

    // ── C · poison-pill cap: attempt 3 fails instead of re-pending ──────────
    const claimedC = await worker.claimNext();
    check("C1 third claim acquires", claimedC?.id === a);
    await supabase.from("pending_audits").update({ heartbeat_at: staleIso }).eq("id", a);
    await worker.reclaimOrphans();
    st = await rowState(a);
    check("C2 attempt cap → failed (not pending)", st.status === "failed", `status=${st.status}`);
    check("C3 cap reason logged", String(st.error_message || "").includes("attempt cap"));
    check("C4 processed_at stamped on cap-fail", !!st.processed_at);
  } else {
    console.log("BLOCKED · B/C (orphan reclaim + cap) — migration 20260612210000 not applied; rerun after CEO applies");
    failures++; // pre-migration this gate is NOT green — report honestly
  }

  // ── D · handler wiring: real entrypoint, real SIGTERM ──────────────────────
  const child = spawn("npx", ["tsx", "agents/audit-worker/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, WORKER_SOURCE: "fa149_test_empty", WORKER_POLL_MS: "2000" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let out = "";
  child.stdout.on("data", (d) => { out += String(d); });
  child.stderr.on("data", (d) => { out += String(d); });
  await new Promise<void>((resolve, reject) => {
    const bootTimeout = setTimeout(() => reject(new Error("worker boot timeout; output:\n" + out.slice(-800))), 60_000);
    const poll = setInterval(() => {
      if (/\[audit-worker\] up ·/.test(out)) { clearTimeout(bootTimeout); clearInterval(poll); resolve(); }
    }, 250);
  });
  check("D1 boot log shows drain handler registered", /drain handler registered/.test(out));
  child.kill("SIGTERM");
  const exitCode: number | null = await new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  check("D2 SIGTERM → drain log emitted", /SIGTERM received — draining/.test(out), out.slice(-400));
  check("D3 drain completes clean", /drain complete — exiting clean/.test(out));
  check("D4 exit code 0", exitCode === 0, `exit=${exitCode}`);

  // ── cleanup ────────────────────────────────────────────────────────────────
  await supabase.from("pending_audits").delete().eq("source", "fa149_test");
  console.log(failures === 0 ? "\nFA-149 gate: ALL PASS" : `\nFA-149 gate: ${failures} FAILURE(S)/BLOCKED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-149 gate crashed:", e.message); process.exit(2); });
