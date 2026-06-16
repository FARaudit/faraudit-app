// FA-170 gate — multi-FILE UPLOAD assembly (form-first selection).
//
// Pure-logic assertions (NO disk, NO LLM) on the five group uploads that the
// 2026-06-16 audits each truncated to ONE file (the attachment) with no banner:
//   1. HM047626R0039   (Solicitation + SOW)
//   2. AOCSSB26R0039   (Solicitation + C/H/L/M)            ← 5 files
//   3. FA487726B0001   (Solicitation + SOW)                 ← SF-1442 IFB
//   4. 1232SA26R0020   (SF-30 Amendment + Project Desc)     ← no base form
//   5. FA460026Q0047   (Solicitation + PWS)
//
// Filenames + byte sizes are the verbatim uploads (URL-encoded "+", as the
// browser delivered them). The fix must: decode names, pick the SOLICITATION
// (not the first attachment) as the form, and plan ALL files within budget.

import { test, expect } from '@playwright/test';
import {
  planDocumentOrder,
  applyBudget,
  prettifyUploadName,
  type AttachmentManifestEntry,
} from '../../src/lib/sam-attachments';

const mk = (name: string, sizeBytes: number): AttachmentManifestEntry => ({
  name: prettifyUploadName(name),         // mirror assembleUploadedDocumentSet
  sizeBytes,
  resourceId: name,
  url: '',
});

const GROUP1 = [
  mk('1. HM047626R0039 - Solicitation.pdf', 273341),
  mk('1. HM047626R0039 - Attachment+1_Statement+of+Work.pdf', 440345),
];
const GROUP2 = [
  mk('2. AOCSSB26R0039 - Solicitation.pdf', 319018),
  mk('2. AOCSSB26R0039 - C.+Statement+of+Work.pdf', 706218),
  mk('2. AOCSSB26R0039 - H.+Special+Contract+Requirements.pdf', 338879),
  mk('2. AOCSSB26R0039 - L.+Instructions+Conditions+and+Notices+to+Offerors.pdf', 237215),
  mk('2. AOCSSB26R0039 - M.+Evaluation+Factors+for+Award.pdf', 180406),
];
const GROUP3 = [
  mk('3. FA487726B00010002  - Solicitation+-+FA487726B0001+-+Revised+20260512.pdf', 628152),
  mk('3. FA487726B00010002  - Attachment+3+-+Statement+of+Work.pdf', 1793450),
];
const GROUP4 = [
  mk('4. 1232SA26R0020 - Solicitiaton - Sol_1232SA26R0020_Amd_0001.pdf', 87262),
  mk('4. 1232SA26R0020 - Tornado+Repairs+-+Project+Description.pdf', 1253839),
];
const GROUP5 = [
  mk('5. FA460026Q0047  - Solicitation+-+FA460026Q0047.pdf', 529129),
  mk('5. FA460026Q0047  - Attachment+1+-+PWS+-+04.15.26+final.pdf', 166636),
];

const form = (files: AttachmentManifestEntry[]) =>
  planDocumentOrder(files, null).find((e) => e.role === 'form')?.name ?? null;

test('UP-1 group1: Solicitation is the form, not the SOW', () => {
  expect(form(GROUP1)).toMatch(/Solicitation/i);
  expect(form(GROUP1)).not.toMatch(/Statement of Work/i);
});

test('UP-2 group2 (5 files): Solicitation is the form; C/H/L/M are attachments', () => {
  const plan = planDocumentOrder(GROUP2, null);
  expect(form(GROUP2)).toMatch(/Solicitation/i);
  // exactly one form; the work statement (C) is NOT the form
  expect(plan.filter((e) => e.role === 'form')).toHaveLength(1);
  expect(plan.find((e) => /Statement of Work/i.test(e.name))?.role).not.toBe('form');
});

test('UP-3 group3 (SF-1442 IFB): Solicitation is the form, not the SOW', () => {
  expect(form(GROUP3)).toMatch(/Solicitation/i);
  expect(form(GROUP3)).not.toMatch(/Statement of Work/i);
});

test('UP-4 group4: no base form (only SF-30 amendment + project desc) → form_identified false', () => {
  const plan = planDocumentOrder(GROUP4, null);
  expect(form(GROUP4)).toBeNull();                                  // honest: no form present
  expect(plan.some((e) => e.role === 'amendment')).toBe(true);     // the Amd is recognized
});

test('UP-5 group5: Solicitation is the form, not the PWS', () => {
  expect(form(GROUP5)).toMatch(/Solicitation/i);
  expect(form(GROUP5)).not.toMatch(/PWS/i);
});

test('UP-6 every group fits the budget — ALL files ingested (none silently dropped)', () => {
  for (const g of [GROUP1, GROUP2, GROUP3, GROUP4, GROUP5]) {
    const { ingest, skipped } = applyBudget(planDocumentOrder(g, null));
    expect(ingest).toHaveLength(g.length);   // every file survives byte/doc budget
    expect(skipped).toHaveLength(0);
  }
});
