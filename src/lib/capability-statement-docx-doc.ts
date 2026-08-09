// THE DOCUMENT, SEPARATE FROM THE ROUTE THAT SERVES IT. Extracted so a test can render
// it — see the note in capability-statement-pdf-doc.tsx for why source-grepping was not
// coverage.
import {
  Document, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel, ImageRun
} from "docx";
import { PAST_PERFORMANCE_EXPORT_LIMIT } from "@/lib/capability-statement-limits";
import { formatPhone } from "@/lib/capability-statement-format";
import { naicsLines } from "@/lib/capability-statement-naics";
import { orderForAgency } from "@/lib/capability-statement-tailoring";
import { imageSize, fitWithin, sniffImageType, LOGO_BOX } from "@/lib/capability-statement-logo";

const INK = "0F172A";
const MUTE = "475569";
const ACCENT = "378ADD";

export interface CapStmt {
  company_name?: string | null;
  logo_url?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  naics_codes?: string[];
  certifications?: string[];
  core_competencies?: string | null;
  differentiators?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_website?: string | null;
  contact_address?: string | null;
  past_performance?: Array<{
    notice_id?: string | null;
    title?: string | null;
    agency?: string | null;
    period?: string | null;
    contract_value?: string | number | null;
  }>;
}

const eyebrow = (text: string) =>
  new Paragraph({
    spacing: { before: 260, after: 90 },
    children: [new TextRun({ text, bold: true, size: 16, color: ACCENT, characterSpacing: 30 })]
  });

const body = (text: string) =>
  new Paragraph({
    spacing: { after: 110 },
    children: [new TextRun({ text, size: 21, color: INK })]
  });

export function buildDocx(stmt: CapStmt, agency: string | null, logo: Buffer | null = null): Document {
  const company = String(stmt.company_name || "").trim();
  const children: Paragraph[] = [];

  // The customer's name is the letterhead. Ours appears nowhere on this document.
  // THE WORD EXPORT NEVER HAD A LOGO. It was added to the page, the PDF and the pasted
  // copy and simply not carried across to this builder. Sized from the image's own
  // dimensions, same box as the PDF, so the two documents match.
  const kind = logo ? sniffImageType(logo) : null;
  if (logo && kind) {
    const box = fitWithin(imageSize(logo), LOGO_BOX.width, LOGO_BOX.height);
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new ImageRun({
        data: logo,
        type: kind.ext === "jpg" ? "jpg" : kind.ext === "webp" ? "png" : "png",
        transformation: { width: box.width, height: box.height }
      })]
    }));
  }

  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: "CAPABILITY STATEMENT", size: 15, color: MUTE, characterSpacing: 40 })]
  }));
  // A statement about which edition this is, not a claim about the firm.
  if (agency) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `Prepared for ${agency}`, size: 15, color: MUTE })]
    }));
  }
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
    children: [new TextRun({ text: company, bold: true, size: 40, color: INK })]
  }));

  const ids: string[] = [];
  if (stmt.uei) ids.push(`UEI ${stmt.uei}`);
  if (stmt.cage_code) ids.push(`CAGE ${stmt.cage_code}`);
  if (ids.length) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [new TextRun({ text: ids.join("   ·   "), size: 19, color: MUTE })]
    }));
  }

  const lines = naicsLines(stmt.naics_codes);
  if (lines.length) {
    children.push(new Paragraph({
      spacing: { before: 80, after: 30 },
      children: [new TextRun({ text: "NAICS", size: 15, color: MUTE, characterSpacing: 30 })]
    }));
    for (const l of lines) {
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: l.code, bold: true, size: 19, color: INK }),
          ...(l.title ? [new TextRun({ text: `  ${l.title}`, size: 19, color: INK })] : []),
          ...(l.primary ? [new TextRun({ text: "  PRIMARY", size: 14, color: ACCENT, characterSpacing: 20 })] : [])
        ]
      }));
    }
  }

  const certs = (stmt.certifications || []).filter(Boolean);
  if (certs.length) {
    children.push(eyebrow("CERTIFICATIONS"));
    children.push(body(certs.join("  ·  ")));
  }

  // AN EMPTY SECTION IS ABSENT. A heading over nothing tells a contracting officer
  // "asked and answered: nothing", which is a claim the absence of data does not support.
  if (stmt.core_competencies) {
    children.push(eyebrow("CORE COMPETENCIES"));
    for (const p of String(stmt.core_competencies).split(/\n+/).filter((x) => x.trim())) children.push(body(p.trim()));
  }
  if (stmt.differentiators) {
    children.push(eyebrow("DIFFERENTIATORS"));
    for (const p of String(stmt.differentiators).split(/\n+/).filter((x) => x.trim())) children.push(body(p.trim()));
  }

  // Reordered for the edition, never filtered — the point is which work leads.
  const past = orderForAgency(stmt.past_performance || [], agency).filter((p) => p.title || p.notice_id);
  if (past.length) {
    children.push(eyebrow("PAST PERFORMANCE"));
    for (const p of past.slice(0, PAST_PERFORMANCE_EXPORT_LIMIT)) {
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: String(p.title || p.notice_id), bold: true, size: 21, color: INK })]
      }));
      // An absent award value contributes nothing — never a dash, never a zero.
      const meta = [p.agency, p.notice_id, p.period, p.contract_value].filter(Boolean).join("  ·  ");
      if (meta) {
        children.push(new Paragraph({
          spacing: { after: 110 },
          children: [new TextRun({ text: meta, size: 18, color: MUTE })]
        }));
      }
    }
    if (past.length > PAST_PERFORMANCE_EXPORT_LIMIT) {
      children.push(new Paragraph({
        spacing: { after: 110 },
        children: [new TextRun({
          text: `Showing the ${PAST_PERFORMANCE_EXPORT_LIMIT} most recent awards. Full past performance available on request.`,
          size: 16, color: MUTE, italics: true
        })]
      }));
    }
  }

  const contact = [
    stmt.contact_name, stmt.contact_email, formatPhone(stmt.contact_phone) || null,
    stmt.contact_address, stmt.contact_website
  ].filter((x) => x && String(x).trim());
  if (contact.length) {
    children.push(eyebrow("CONTACT"));
    for (const c of contact) children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: String(c), size: 21, color: INK })]
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1", space: 8 } },
    children: [new TextRun({ text: `${company}  ·  Confidential`, size: 15, color: "94A3B8" })]
  }));

  return new Document({
    creator: company,
    title: `${company} — Capability Statement`,
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }]
  });
}
