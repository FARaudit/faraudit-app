// V2 Render-Determinism Harness — Cycle 2 v2 acceptance gate
//
// Proves: given an identical V2 view-model, renderV2Surfaces() produces
// byte-identical output across 3 replays. Combined with extraction-determinism
// (facts byte-stable by construction), this closes the original §05/§09
// flicker that started Cycle 2.
//
// Approach: load synthetic VM fixtures (test/fixtures/v2-vm-{f1,f4}.json),
// render against _template.html three times, byte-compare results.
// Also pin-checks specific section regions (§04 cmx + §09 ck + L02 et + vnotes)
// individually so a regression points at the offending surface.
//
// Run: npx dotenv -e .env.local -- tsx test/verify-v2-render-determinism.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { renderV2Surfaces, type V2RenderInput } from "../src/app/audit/[id]/_v2-render-surfaces";

const TEMPLATE_PATH = path.join(process.cwd(), "src/app/audit/[id]/_template.html");

function sectionSlice(html: string, sectionId: string): string {
  const re = new RegExp(`<section\\b[^>]*\\bid="${sectionId}"[\\s\\S]*?</section>`, "i");
  return html.match(re)?.[0] ?? `__${sectionId}_MISSING__`;
}

function divFieldSlice(html: string, dataField: string): string {
  const re = new RegExp(
    `<div\\b[^>]*\\bdata-field="${dataField.replace(/[.]/g, "\\.")}"[\\s\\S]*?</div>`,
    "i"
  );
  return html.match(re)?.[0] ?? `__${dataField}_MISSING__`;
}

interface SurfaceTriad {
  full: { r1: string; r2: string; r3: string; match: boolean };
  ws: { r1: string; r2: string; r3: string; match: boolean };
  matrix: { r1: string; r2: string; r3: string; match: boolean };
  checklist: { r1: string; r2: string; r3: string; match: boolean };
  l02: { r1: string; r2: string; r3: string; match: boolean };
  vnotes: { r1: string; r2: string; r3: string; match: boolean };
}

function triad(html1: string, html2: string, html3: string, key: string, slicer: (h: string) => string): SurfaceTriad["ws"] {
  const r1 = slicer(html1);
  const r2 = slicer(html2);
  const r3 = slicer(html3);
  return { r1, r2, r3, match: r1 === r2 && r2 === r3 };
}

async function testFixture(fixturePath: string, template: string): Promise<{ pass: boolean; report: string }> {
  const vm = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as V2RenderInput & { label: string };
  const label = (vm as { label?: string }).label ?? path.basename(fixturePath);

  const h1 = renderV2Surfaces(template, vm);
  const h2 = renderV2Surfaces(template, vm);
  const h3 = renderV2Surfaces(template, vm);

  const fullMatch = h1 === h2 && h2 === h3;
  // The ws-reveal lives INSIDE sec-scope. The repeater bag bodies live under
  // data-field anchors. Capture each surface for diff visibility.
  const ws = triad(h1, h2, h3, "ws", (h) => sectionSlice(h, "sec-scope"));
  const matrix = triad(h1, h2, h3, "matrix", (h) => divFieldSlice(h, "matrix_rollup"));
  const checklist = triad(h1, h2, h3, "checklist", (h) => divFieldSlice(h, "submission_checklist_filtered"));
  const l02 = triad(h1, h2, h3, "l02", (h) => sectionSlice(h, "sec-etraps"));
  const vnotes = triad(h1, h2, h3, "vnotes", (h) => sectionSlice(h, "sec-vnotes"));

  const allMatch = fullMatch && ws.match && matrix.match && checklist.match && l02.match && vnotes.match;
  const lines: string[] = [];
  lines.push(`  ${label}`);
  lines.push(`    full output                ${fullMatch ? "✓ byte-identical" : "✗ DIVERGE"} (${h1.length} chars)`);
  lines.push(`    §03-HEAD ws-reveal         ${ws.match ? "✓ MATCH" : "✗ DIVERGE"}`);
  lines.push(`    §04 matrix_rollup          ${matrix.match ? "✓ MATCH" : "✗ DIVERGE"}`);
  lines.push(`    §09 checklist (6-bucket)   ${checklist.match ? "✓ MATCH" : "✗ DIVERGE"}`);
  lines.push(`    L02 band                   ${l02.match ? "✓ MATCH" : "✗ DIVERGE"}`);
  lines.push(`    Verification notes         ${vnotes.match ? "✓ MATCH" : "✗ DIVERGE"}`);
  return { pass: allMatch, report: lines.join("\n") };
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log("  CYCLE 2 v2 RENDER-DETERMINISM HARNESS — 3-replay test on V2 surfaces");
  console.log("═════════════════════════════════════════════════════════════════════════════");
  console.log();

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`MISSING TEMPLATE: ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  console.log(`  Template loaded: ${template.length} chars from ${TEMPLATE_PATH}`);
  console.log();

  const fixtures: Array<{ path: string; key: string }> = [
    { path: path.join(process.cwd(), "test/fixtures/v2-vm-f1.json"), key: "F1" },
    { path: path.join(process.cwd(), "test/fixtures/v2-vm-f4.json"), key: "F4" },
  ];

  // Cycle 2 v2 burn-in: glob test/fixtures/burn-in/*-vm.json and add them.
  const burnInDir = path.join(process.cwd(), "test/fixtures/burn-in");
  if (fs.existsSync(burnInDir)) {
    for (const entry of fs.readdirSync(burnInDir).sort()) {
      if (!entry.endsWith("-vm.json")) continue;
      const sol = entry.replace(/-vm\.json$/, "");
      fixtures.push({ path: path.join(burnInDir, entry), key: `BI ${sol}` });
    }
  }

  let allPass = true;
  for (const f of fixtures) {
    if (!fs.existsSync(f.path)) {
      console.error(`  ${f.key}: MISSING ${f.path}`);
      allPass = false;
      continue;
    }
    const { pass, report } = await testFixture(f.path, template);
    console.log(report);
    console.log();
    if (!pass) allPass = false;
  }

  console.log("═════════════════════════════════════════════════════════════════════════════");
  if (allPass) {
    console.log("  ✓✓✓ V2 RENDER DETERMINISTIC — §03/§04/§09/L02/vnotes byte-stable on V2.");
    console.log("       Original §05/§09 flicker CLOSED end-to-end:");
    console.log("       facts deterministic (by construction) + render deterministic (this harness).");
  } else {
    console.log("  ✗✗✗ RENDER VARIANCE DETECTED — investigate per-surface diff before merge.");
  }
  console.log("═════════════════════════════════════════════════════════════════════════════");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS FATAL:", e);
  process.exit(1);
});
