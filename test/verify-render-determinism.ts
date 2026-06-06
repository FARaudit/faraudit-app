// Render-determinism harness — Brain ruling (2026-06-06).
//
// Replays the canonicalization layer against pinned audit_json fixtures from
// a previously-divergent set of SPRRA runs, and verifies the Cycle-1
// canonical surfaces are byte-identical across all fixtures. Live audit runs
// are NOT how we test determinism — fresh runs re-introduce model variance
// and burn tokens. Replay is the gate.
//
// Run:   npm run verify:render-determinism
// Exit:  0 = byte-stable on canonical surfaces · 1 = divergence detected
//
// Cycle-1 surfaces (under verification this commit, c33f8e1):
//   - verdict_word
//   - gate_card.verdict_text
//   - gate_card.lead_text
//   - gate_card.count_text
//   - days_to_deadline (modulo UTC midnight when fixtures span a day boundary)
//
// Cycle-2 surfaces (NOT yet canonicalized — divergence expected, informational
// only): §05 risk count, §09 submission_checklist count. Future commits add
// matrix_rollup + submission_checklist_filtered + dedup_risks and tighten the
// gate further; the same fixtures re-verify those without changing files.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildViewModel } from "../src/app/audit/[id]/_view-model";

const FIXTURE_DIR = join(__dirname, "fixtures");

function listFixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => /^sprra-run-[a-z]\.json$/i.test(f))
    .sort();
}

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

interface SurfaceCheck {
  label: string;
  pick: (vm: any) => string;
}

const CYCLE_1_SURFACES: SurfaceCheck[] = [
  { label: "verdict_word",              pick: (vm) => String(vm.verdict_word) },
  { label: "gate_card.verdict_text",    pick: (vm) => String(vm.gate_card?.verdict_text ?? "(undefined)") },
  { label: "gate_card.lead_text",       pick: (vm) => String(vm.gate_card?.lead_text ?? "(undefined)") },
  { label: "gate_card.count_text",      pick: (vm) => String(vm.gate_card?.count_text ?? "(undefined)") },
  { label: "days_to_deadline",          pick: (vm) => String(vm.days_to_deadline ?? "null") }
];

const CYCLE_2_REFERENCE: SurfaceCheck[] = [
  { label: "(Cycle-2) risks count",         pick: (vm) => String(vm.risks?.length ?? "?") },
  { label: "(Cycle-2) submission_checklist", pick: (vm) => String(vm.submission_checklist?.length ?? "?") }
];

function main(): void {
  const files = listFixtures();
  if (files.length < 2) {
    console.error(`FAIL · need at least 2 fixtures in ${FIXTURE_DIR}, found ${files.length}.`);
    process.exit(2);
  }

  const fixtures = files.map(loadFixture);
  const keys = files.map((f) => f.replace(/^sprra-run-/, "").replace(/\.json$/, ""));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vms = fixtures.map((row) => buildViewModel(row as any));

  console.log("");
  console.log("══════════════════════════════════════════════════════════════════════════════════");
  console.log(`  RENDER-DETERMINISM HARNESS  ·  ${files.length} fixtures from ${FIXTURE_DIR}`);
  console.log("══════════════════════════════════════════════════════════════════════════════════");
  console.log("  Fixtures (raw extraction JSON — divergent by design):");
  for (let i = 0; i < files.length; i++) {
    const f = fixtures[i] as Record<string, unknown>;
    const rec = String(f.recommendation ?? "?");
    const score = String(f.compliance_score ?? "?");
    const created = String(f.created_at ?? "?").slice(0, 19);
    console.log(`    ${keys[i].toUpperCase()}  ${files[i]}  ·  rec=${rec}  score=${score}  ·  ${created}`);
  }

  console.log("");
  console.log("──────────────────────────────────────────────────────────────────────────────────");
  console.log("  CYCLE-1 CANONICAL SURFACES — must match across all fixtures");
  console.log("──────────────────────────────────────────────────────────────────────────────────");

  let allMatch = true;
  for (const check of CYCLE_1_SURFACES) {
    const values = vms.map(check.pick);
    const match = values.every((v) => v === values[0]);
    if (!match) allMatch = false;
    const indicator = match ? "✓ MATCH " : "✗ DIVERGE";
    console.log("");
    console.log(`  ${indicator}  ${check.label}`);
    values.forEach((v, i) => {
      // Wrap long values for readability
      const wrapped = v.length > 90 ? v.slice(0, 87) + "…" : v;
      console.log(`        ${keys[i].toUpperCase()}: ${wrapped}`);
    });
  }

  console.log("");
  console.log("──────────────────────────────────────────────────────────────────────────────────");
  console.log("  CYCLE-2 SURFACES (informational — divergence expected this cycle)");
  console.log("──────────────────────────────────────────────────────────────────────────────────");
  for (const check of CYCLE_2_REFERENCE) {
    const values = vms.map(check.pick);
    const summary = values.map((v, i) => `${keys[i]}=${v}`).join("  ");
    console.log(`  ${check.label.padEnd(34)}  ${summary}`);
  }

  console.log("");
  console.log("══════════════════════════════════════════════════════════════════════════════════");
  if (allMatch) {
    console.log("  ✓ CYCLE-1 BYTE-STABLE  —  canonicalization absorbed all extraction variance.");
  } else {
    console.log("  ✗ CYCLE-1 DRIFT DETECTED  —  see DIVERGE rows. Canonicalization not yet absorbing.");
  }
  console.log("══════════════════════════════════════════════════════════════════════════════════");
  console.log("");

  process.exit(allMatch ? 0 : 1);
}

main();
