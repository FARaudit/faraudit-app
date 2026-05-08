import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface WinProbabilityResult {
  probability: number | null;     // 0–100, null only when basis === 0
  basis: number;                  // count of comparable outcomes
  confidence: "directional" | "tight"; // tight when basis ≥ HIGH_CONFIDENCE_BASIS
  reason: string;
  benchmarks: {
    naics_win_rate: number | null;
    agency_win_rate: number | null;
    set_aside_win_rate: number | null;
    your_win_rate: number | null;
  };
  insufficient_threshold: number;
}

// Confidence threshold — below this we still compute and surface a probability,
// but the response carries `confidence: "directional"` so the UI can mark it.
// Previously this was a hard floor that returned probability=null until the
// corpus reached 100 outcomes; that meant every brand-new account saw a "—"
// for months even after logging 5–10 outcomes that already say something
// useful. Show "—" only when there's literally nothing to compute from.
const HIGH_CONFIDENCE_BASIS = 100;

interface OutcomeRow {
  outcome: string;                          // 'awarded' | 'lost'
  margin_estimated_pct: number | null;
  audits: {
    naics_code: string | null;
    agency: string | null;
    set_aside: string | null;
  } | null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ audit_id: string }> }
) {
  const { audit_id } = await ctx.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: target } = await supabase
    .from("audits")
    .select("id, notice_id, naics_code, agency, set_aside, compliance_score, win_probability, win_probability_basis, updated_at")
    .eq("id", audit_id)
    .single();
  if (!target) return NextResponse.json({ error: "audit not found" }, { status: 404 });

  // Pull from audit_outcomes (Layer 3 corpus) joined to audits for the slice
  // dimensions (naics/agency/set-aside live on audits). RLS on audit_outcomes
  // restricts to user_id = auth.uid(), so this is your personal corpus —
  // benchmarks are honest about your own track record, not cross-customer.
  // Future: a SECURITY DEFINER aggregator function can return cross-customer
  // rates without exposing individual rows. Not needed until corpus warrants.
  const { data: corpusRaw } = await supabase
    .from("audit_outcomes")
    .select("outcome, margin_estimated_pct, audits!inner(naics_code, agency, set_aside)")
    .in("outcome", ["awarded", "lost"]);

  const corpus = ((corpusRaw || []) as unknown) as OutcomeRow[];

  function rate(filterFn: (a: OutcomeRow) => boolean): { rate: number | null; n: number } {
    const subset = corpus.filter(filterFn);
    if (subset.length === 0) return { rate: null, n: 0 };
    const wins = subset.filter((a) => a.outcome === "awarded").length;
    return { rate: Math.round((wins / subset.length) * 100), n: subset.length };
  }

  const sameNaics    = rate((a) => a.audits?.naics_code === (target.naics_code || "_none_"));
  const sameAgency   = rate((a) => a.audits?.agency     === (target.agency     || "_none_"));
  const sameSetAside = rate((a) => a.audits?.set_aside  === (target.set_aside  || "_none_"));
  const yours        = rate(() => true);

  const totalBasis = sameNaics.n + sameAgency.n + sameSetAside.n;

  let probability: number | null = null;
  let reason: string;
  let confidence: "directional" | "tight" = "directional";
  if (totalBasis > 0) {
    // Match component to the strongest available slice. Below the per-slice
    // floor (n>=10) we relax to anything ≥1 so a brand-new account with a
    // few outcomes still sees a directional number instead of "—".
    const slicesUsable = (n: number) => n >= 10;
    const slicesDirectional = (n: number) => n >= 1;
    const components: Array<{ rate: number; weight: number }> = [];

    if (totalBasis >= HIGH_CONFIDENCE_BASIS) {
      if (sameNaics.rate    != null && slicesUsable(sameNaics.n))    components.push({ rate: sameNaics.rate,    weight: 40 });
      if (sameAgency.rate   != null && slicesUsable(sameAgency.n))   components.push({ rate: sameAgency.rate,   weight: 35 });
      if (sameSetAside.rate != null && slicesUsable(sameSetAside.n)) components.push({ rate: sameSetAside.rate, weight: 25 });
      if (components.length === 0 && yours.rate != null) components.push({ rate: yours.rate, weight: 100 });
    } else {
      // Directional path — accept thinner slices, fall back to overall rate.
      if (sameNaics.rate    != null && slicesDirectional(sameNaics.n))    components.push({ rate: sameNaics.rate,    weight: 40 });
      if (sameAgency.rate   != null && slicesDirectional(sameAgency.n))   components.push({ rate: sameAgency.rate,   weight: 35 });
      if (sameSetAside.rate != null && slicesDirectional(sameSetAside.n)) components.push({ rate: sameSetAside.rate, weight: 25 });
      if (components.length === 0 && yours.rate != null) components.push({ rate: yours.rate, weight: 100 });
    }

    if (components.length > 0) {
      const wTotal = components.reduce((s, c) => s + c.weight, 0);
      const wAvg = components.reduce((s, c) => s + c.rate * c.weight, 0) / wTotal;

      // Compliance-score adjustment: each 10 points above 50 = +2pp, below 50 = -2pp.
      const score = typeof target.compliance_score === "number" ? (target.compliance_score as number) : 50;
      const compAdj = ((score - 50) / 10) * 2;

      // Margin-signal adjustment: if the user logs estimated margin on their
      // outcomes, the median estimated margin nudges the prediction by ±3pp.
      // Higher margins (≥20%) → slight uplift; thin margins (≤5%) → slight drag.
      // Conservative weighting; overridden by compliance-score for now.
      const marginsLogged = corpus
        .map((a) => a.margin_estimated_pct)
        .filter((m): m is number => typeof m === "number" && Number.isFinite(m));
      let marginAdj = 0;
      if (marginsLogged.length >= 10) {
        const sorted = [...marginsLogged].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (median >= 20) marginAdj = 3;
        else if (median <= 5) marginAdj = -3;
      }

      probability = Math.max(2, Math.min(98, Math.round(wAvg + compAdj + marginAdj)));
      confidence = totalBasis >= HIGH_CONFIDENCE_BASIS ? "tight" : "directional";
      reason = totalBasis >= HIGH_CONFIDENCE_BASIS
        ? `Based on ${totalBasis} outcomes in your audit_outcomes corpus`
        : `Directional · ${totalBasis} outcomes logged so far. Tightens automatically once you log ≥${HIGH_CONFIDENCE_BASIS}.`;
    } else {
      reason = `${totalBasis} outcomes in corpus but no slice has comparable rows yet`;
    }
  } else {
    reason = "No outcomes logged yet — mark audits AWARDED or LOST to seed the model.";
  }

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
    confidence,
    reason,
    benchmarks: {
      naics_win_rate: sameNaics.rate,
      agency_win_rate: sameAgency.rate,
      set_aside_win_rate: sameSetAside.rate,
      your_win_rate: yours.rate
    },
    insufficient_threshold: HIGH_CONFIDENCE_BASIS
  };

  return NextResponse.json(result);
}
