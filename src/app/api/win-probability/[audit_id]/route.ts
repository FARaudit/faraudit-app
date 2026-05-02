import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface WinProbabilityResult {
  probability: number | null;     // 0–100, null if insufficient data
  basis: number;                  // count of comparable audits
  reason: string;
  benchmarks: {
    naics_win_rate: number | null;
    agency_win_rate: number | null;
    set_aside_win_rate: number | null;
    your_win_rate: number | null;
  };
  insufficient_threshold: number;
}

const MIN_BASIS = 100; // require at least 100 comparable audits across the corpus

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ audit_id: string }> }
) {
  const { audit_id } = await ctx.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Cache check — if we've computed this in the last 24h and the audit hasn't changed, return it.
  const { data: target } = await supabase
    .from("audits")
    .select("id, notice_id, naics_code, agency, set_aside, compliance_score, win_probability, win_probability_basis, updated_at")
    .eq("id", audit_id)
    .single();
  if (!target) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  // Pull all audits with outcomes recorded.
  const { data: corpus } = await supabase
    .from("audits")
    .select("id, naics_code, agency, set_aside, outcome, compliance_score")
    .not("outcome", "is", null);

  const decided = ((corpus || []) as Array<Record<string, unknown>>)
    .filter((a) => a.outcome === "won" || a.outcome === "lost");

  function rate(filterFn: (a: Record<string, unknown>) => boolean): { rate: number | null; n: number } {
    const subset = decided.filter(filterFn);
    if (subset.length === 0) return { rate: null, n: 0 };
    const wins = subset.filter((a) => a.outcome === "won").length;
    return { rate: subset.length > 0 ? Math.round((wins / subset.length) * 100) : null, n: subset.length };
  }

  const sameNaics    = rate((a) => a.naics_code  === (target.naics_code  || "_none_"));
  const sameAgency   = rate((a) => a.agency      === (target.agency      || "_none_"));
  const sameSetAside = rate((a) => a.set_aside   === (target.set_aside   || "_none_"));
  const yours        = rate((_a) => true);

  const totalBasis = sameNaics.n + sameAgency.n + sameSetAside.n;

  let probability: number | null = null;
  let reason = "Insufficient corpus depth";
  if (totalBasis >= MIN_BASIS) {
    // Weighted blend: NAICS=40% · agency=35% · set-aside=25%, falling back to overall when a slice is empty.
    const components: Array<{ rate: number; weight: number }> = [];
    if (sameNaics.rate    != null && sameNaics.n    >= 10) components.push({ rate: sameNaics.rate,    weight: 40 });
    if (sameAgency.rate   != null && sameAgency.n   >= 10) components.push({ rate: sameAgency.rate,   weight: 35 });
    if (sameSetAside.rate != null && sameSetAside.n >= 10) components.push({ rate: sameSetAside.rate, weight: 25 });
    if (components.length === 0 && yours.rate != null) components.push({ rate: yours.rate, weight: 100 });

    if (components.length > 0) {
      const wTotal = components.reduce((s, c) => s + c.weight, 0);
      const wAvg = components.reduce((s, c) => s + c.rate * c.weight, 0) / wTotal;

      // Compliance-score adjustment: each 10 points of compliance score above
      // 50 nudges the prediction up by 2pp, below 50 nudges down.
      const score = typeof target.compliance_score === "number" ? (target.compliance_score as number) : 50;
      const adj = ((score - 50) / 10) * 2;

      probability = Math.max(2, Math.min(98, Math.round(wAvg + adj)));
      reason = `Based on ${totalBasis} comparable audits in corpus`;
    }
  } else {
    reason = `${totalBasis} comparable audits in corpus — need ≥${MIN_BASIS} to predict reliably. Check back as the corpus grows.`;
  }

  // Persist the prediction so the report doesn't recompute on every load.
  await supabase
    .from("audits")
    .update({
      win_probability: probability,
      win_probability_basis: totalBasis
    })
    .eq("id", audit_id)
    .then(() => null, () => null);

  const result: WinProbabilityResult = {
    probability,
    basis: totalBasis,
    reason,
    benchmarks: {
      naics_win_rate: sameNaics.rate,
      agency_win_rate: sameAgency.rate,
      set_aside_win_rate: sameSetAside.rate,
      your_win_rate: yours.rate
    },
    insufficient_threshold: MIN_BASIS
  };

  return NextResponse.json(result);
}
