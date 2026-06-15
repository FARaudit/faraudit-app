// FA-119 Phase 2 gate — work-statement-aware document selection.
//
// Pure-logic assertions on the two RECORDED manifests (NO SAM fetch, NO LLM).
// The governing work statement must SURVIVE applyBudget instead of being
// starved out of the 5-doc/15MB budget by trivial small files (sign-in sheets,
// tiny DID forms). Pre-fix, the size-ascending fill dropped the work statement
// on both collapsed audits; the control kept its PWS only because it had ≤5
// files total.
//
// Fixtures are the persisted compliance_json.ingestion.files[] arrays measured
// from audits 168805f6 (tornado 1232SA26R0020, 18 files) and d062ab22
// (ballistic FA460026Q0047 control, 4 files) — names + bytes verbatim.

import { test, expect } from '@playwright/test';
import {
  planDocumentOrder,
  applyBudget,
  MAX_DOCS,
  MAX_TOTAL_INLINE_BYTES,
  type AttachmentManifestEntry,
} from '../../src/lib/sam-attachments';

const mk = (name: string, sizeBytes: number | null): AttachmentManifestEntry => ({
  name,
  sizeBytes,
  resourceId: name,
  url: `https://example.test/${encodeURIComponent(name)}`,
});

// 1232SA26R0020 — tornado (collapsed pre-fix). 18 files.
const TORNADO: AttachmentManifestEntry[] = [
  mk('1232SA26R0020.pdf', 511629),
  mk('Sol_1232SA26R0020_Amd_0001.pdf', 87262),
  mk('Attachment 1 Ft. Pierce Final Drawing SetPart-1.pdf', 21898353),
  mk('Attachment 10 Leesburg Farm Asbestos Survey - Report.pdf', 11534368),
  mk('Attachment 11 Photos.zip', 17597583),
  mk('Attachment 12 Solicitation Requests for Information.pdf', 351598),
  mk('Attachment 2 Ft. Pierce Final Drawing SetPart-2.pdf', 22588497),
  mk('Attachment 3 Ft. Pierce Final Drawing SetPart-3.pdf', 21818069),
  mk('Attachment 4 Ft. Pierce Final Drawing SetPart-4.pdf', 18187170),
  mk('Attachment 5 Ft Pierce Final Specifications.pdf', 2333023),
  mk('Attachment 6 Wage Determination UPDATED.pdf', 171211),
  mk('Attachment 7 As Builts.zip', 11035056),
  mk('Attachment 8 Horticultural Research Lab Hazardous Material Survey Report - compressed.pdf', 23212737),
  mk('Attachment 9 USDA Picos Research Farm Hazardous Material Survey Report.pdf', 15111614),
  mk('Sign-in Sheet_Main Site_USHRL-Fort Pierce.pdf', 231756),
  mk('Sign-in Sheet_PICOS Site_USHRL-Fort Pierce.pdf', 333631),
  mk('Sign-in Sheet_Whitmore Site_USHRL-Leesburg.pdf', 217403),
  mk('Tornado Repairs - Project Description.pdf', 1253839),
];

// FA460026Q0047 — ballistic (CLEAN CONTROL, call3 ok). 4 files.
const BALLISTIC: AttachmentManifestEntry[] = [
  mk('Solicitation - FA460026Q0047.pdf', 529129),
  mk('Attach 3_ EAL.pdf', 3621531),
  mk('Attachment 1 - PWS - 04.15.26 final.pdf', 166636),
  mk('Attch 2_Wage Determination 13MAY26.pdf', 257570),
];

const tornadoIngest = () => applyBudget(planDocumentOrder(TORNADO, '1232SA26R0020')).ingest;
const ballisticIngest = () => applyBudget(planDocumentOrder(BALLISTIC, 'FA460026Q0047')).ingest;

test('WS-1 tornado: the work statement (Project Description) is INGESTED, not dropped to overflow', () => {
  const names = tornadoIngest().map((e) => e.name);
  expect(names.some((n) => /Project Description/i.test(n))).toBe(true);
});

test('WS-2 tornado: the 2 sign-in sheets do NOT both rank ahead of the work statement', () => {
  const ingest = tornadoIngest();
  const wsIdx = ingest.findIndex((e) => /Project Description/i.test(e.name));
  expect(wsIdx).toBeGreaterThanOrEqual(0); // ingested at all
  const signInsAhead = ingest.slice(0, wsIdx).filter((e) => /Sign-in Sheet/i.test(e.name)).length;
  expect(signInsAhead).toBeLessThan(2);
});

test('WS-3 ballistic control: PWS still ingested (no regression)', () => {
  const names = ballisticIngest().map((e) => e.name);
  expect(names.some((n) => /\bPWS\b/i.test(n))).toBe(true);
});

test('WS-4 budget constants honored (≤5 docs / ≤15MB) on both manifests', () => {
  for (const ingest of [tornadoIngest(), ballisticIngest()]) {
    const totalBytes = ingest.reduce((s, e) => s + (e.sizeBytes ?? 0), 0);
    expect(ingest.length).toBeLessThanOrEqual(MAX_DOCS);
    expect(totalBytes).toBeLessThanOrEqual(MAX_TOTAL_INLINE_BYTES);
  }
});
