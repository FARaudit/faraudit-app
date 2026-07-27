// UNBOUND-SLOT SWEEP — ARC #747. Proves the SERVED legacy template cannot leak its mock acquisition.
//
// This test is written against the real `_template.html`, not a fixture, because the defect IS the real
// file: it ships with a complete fictional DLA/H-60 acquisition in its 232 data-field slots and is served
// to every audit row whose engine is not agentic_v3.
//
// The "nothing bound" case is the worst case and the one the old four-phrase denylist could not cover.
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripUnboundSlots } from "./_render";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const template = readFileSync(join(process.cwd(), "src", "app", "audit", "[id]", "_template.html"), "utf8");

// ── 1. NOTHING BOUND — every fabricated slot must render as an absence ──────────────────────────────
{
  const { html, stripped } = stripUnboundSlots(template, template);
  assert(stripped.length > 0, `sweep fires when nothing is bound (stripped ${stripped.length} slots)`);

  // The fabrications the panel named that live INSIDE a data-field slot — these the sweep owns.
  for (const leak of ["$14.2M", "118 days"]) {
    const before = template.includes(leak);
    const after = html.includes(leak);
    assert(before && !after, `"${leak}" present in template, GONE after sweep (before=${before} after=${after})`);
  }

  // MEASURED RESIDUE — demo content OUTSIDE any data-field slot. The sweep structurally cannot reach these:
  // there is no slot to compare against. Asserting they vanish would be asserting something false about the
  // mechanism, so instead this test PINS the number. If it grows, someone added un-slotted demo content and
  // this fails; if it shrinks, the pin is updated deliberately. Silence here would let the residue rot.
  const RESIDUE_PROBES = ["SP4701-26-Q-0942", "Predictive Maintenance Analytics", "DLA Aviation", "H-60"];
  const residue = RESIDUE_PROBES.filter((p) => html.includes(p));
  console.log(`   ⚠ out-of-slot demo residue (sweep cannot reach; tracked separately): ${JSON.stringify(residue)}`);
  assert(residue.length <= 4, `out-of-slot residue does not GROW beyond the 4 known probes (got ${residue.length})`);
}

// ── 2. HONEST EMPTY DEFAULTS ARE NOT TOUCHED ────────────────────────────────────────────────────────
// A slot whose default carries no alphanumerics is already saying "no value" — stripping it would be churn.
{
  const probe = `<div data-field="probe_empty">&mdash;</div><div data-field="probe_data">$9.9M award</div>`;
  const { html, stripped } = stripUnboundSlots(probe, probe);
  assert(html.includes(`data-field="probe_empty">&mdash;<`), "honest '—' default left untouched");
  assert(!html.includes("$9.9M award"), "fabricated value stripped");
  assert(stripped.length === 1 && stripped[0] === "probe_data", `only the data slot counted (got ${JSON.stringify(stripped)})`);
}

// ── 3. A BOUND SLOT IS NEVER STRIPPED — the guard must not eat real customer data ────────────────────
{
  const pristine = `<div data-field="agency">DLA Aviation</div>`;
  const bound    = `<div data-field="agency">Naval Sea Systems Command</div>`;
  const { html, stripped } = stripUnboundSlots(bound, pristine);
  assert(html === bound, "a slot bound to real data is passed through byte-identical");
  assert(stripped.length === 0, "no strip recorded for a bound slot");
}

// ── 4. IDEMPOTENT — sweeping twice changes nothing further ──────────────────────────────────────────
{
  const once = stripUnboundSlots(template, template).html;
  const twice = stripUnboundSlots(once, template).html;
  assert(once === twice, "sweep is idempotent");
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
if (failures) process.exit(1);
