import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const PLAN_CONFIG = {
  design_partner: { label: "Design Partner", price_monthly: 1250, price_annual: 15000 },
  standard:       { label: "Standard",       price_monthly: 2500, price_annual: 30000 }
} as const;

type PlanTier = keyof typeof PLAN_CONFIG;

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const full_name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";

  // TODO: user profile table needed — until then, default tier comes from user_metadata.plan_tier
  const tierFromMeta = typeof meta.plan_tier === "string" ? (meta.plan_tier as PlanTier) : "design_partner";
  const plan_tier: PlanTier = tierFromMeta in PLAN_CONFIG ? tierFromMeta : "design_partner";
  const plan = PLAN_CONFIG[plan_tier];

  return NextResponse.json({
    email: user.email || "",
    full_name,
    plan_tier,
    plan_label: plan.label,
    plan_price_monthly: plan.price_monthly,
    plan_price_annual: plan.price_annual
  });
}
