import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Federal Register API — proposed rules from defense-related agencies.
// 30-90 day advance warning before rules finalize. Free, no key required.
// Docs: https://www.federalregister.gov/developers/documentation/api/v1
const BASE = "https://www.federalregister.gov/api/v1/documents.json";

interface FedRegDoc {
  document_number: string;
  title: string;
  abstract: string | null;
  publication_date: string;
  effective_on: string | null;
  comments_close_on: string | null;
  document_type: string;
  agency_names: string[];
  html_url: string;
  pdf_url: string | null;
  citation: string | null;
}

interface ProposedRule {
  document_number: string;
  title: string;
  abstract: string | null;
  publication_date: string;
  comments_close_on: string | null;
  effective_on: string | null;
  agencies: string[];
  citation: string | null;
  url: string;
  affects_clauses: string[];
  days_to_comment: number | null;
}

const DEFENSE_AGENCIES = [
  "defense-acquisition-regulations-system",
  "defense-department",
  "navy-department",
  "air-force-department",
  "army-department"
];

function extractClauses(text: string): string[] {
  const out = new Set<string>();
  const rx = /((?:FAR|DFARS|PGI)\s*\d+\.\d+(?:-\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    out.add(m[1].toUpperCase().replace(/\s+/g, " "));
  }
  return Array.from(out);
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 30-day forward window — capture rules that just published with comment periods open.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const params = new URLSearchParams();
  params.set("conditions[publication_date][gte]", ninetyDaysAgo);
  params.set("conditions[publication_date][lte]", today);
  params.set("conditions[type][]", "PRORULE");
  for (const a of DEFENSE_AGENCIES) {
    params.append("conditions[agencies][]", a);
  }
  params.set("per_page", "50");
  params.set("order", "newest");
  params.set("fields[]", "document_number");
  params.append("fields[]", "title");
  params.append("fields[]", "abstract");
  params.append("fields[]", "publication_date");
  params.append("fields[]", "effective_on");
  params.append("fields[]", "comments_close_on");
  params.append("fields[]", "document_type");
  params.append("fields[]", "agency_names");
  params.append("fields[]", "html_url");
  params.append("fields[]", "pdf_url");
  params.append("fields[]", "citation");

  let res: Response;
  try {
    res = await fetch(`${BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 21600 }
    });
  } catch {
    return NextResponse.json({ rules: [], reason: "Federal Register API timeout" });
  }
  if (!res.ok) {
    return NextResponse.json({ rules: [], reason: `Federal Register API error ${res.status}` });
  }

  let data: { results?: FedRegDoc[] } = {};
  try { data = await res.json(); } catch { return NextResponse.json({ rules: [] }); }

  const now = Date.now();
  const rules: ProposedRule[] = (data.results || []).map((d) => {
    const txt = `${d.title} ${d.abstract || ""}`;
    const closeDate = d.comments_close_on ? new Date(d.comments_close_on).getTime() : null;
    return {
      document_number: d.document_number,
      title: d.title,
      abstract: d.abstract,
      publication_date: d.publication_date,
      comments_close_on: d.comments_close_on,
      effective_on: d.effective_on,
      agencies: d.agency_names || [],
      citation: d.citation,
      url: d.html_url,
      affects_clauses: extractClauses(txt),
      days_to_comment: closeDate ? Math.ceil((closeDate - now) / 86400_000) : null
    };
  });

  return NextResponse.json({ rules, fetched_at: new Date().toISOString() });
}
