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

// ── PATCH: the PERSON, and only the person ──────────────────────────────────────────────
// Settings owns the person; the COMPANY (name, UEI, CAGE, DUNS, NAICS, certifications,
// address, website) lives in `capability_statements` and is edited on its own tab. One
// record, one editor — two writers on one company row is how a verified field forks.
//
// Until the profile table in the GET TODO exists, the person's name lives in Supabase auth
// user_metadata, which is the same place GET already reads it from. No new store, no
// migration, and no second source of truth for a name.
//
// `email` is NOT writable here: it is the auth identity and changing it needs a verification
// round-trip. `plan_tier` is NOT writable here: billing is not a customer-editable field.
// Both are rejected explicitly rather than silently ignored — a save that reports success
// while dropping a field is the failure this page already had.
export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 }); }
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  const READ_ONLY = ["email", "plan_tier", "plan_label", "plan_price_monthly", "plan_price_annual"];
  const rejected = READ_ONLY.filter((k) => k in patch);
  if (rejected.length) {
    return NextResponse.json(
      { error: `Not editable here: ${rejected.join(", ")}`, rejected },
      { status: 400 },
    );
  }

  if (!("full_name" in patch)) {
    return NextResponse.json({ error: "Nothing to update", editable: ["full_name"] }, { status: 400 });
  }
  if (typeof patch.full_name !== "string") {
    return NextResponse.json({ error: "full_name must be a string" }, { status: 400 });
  }
  const full_name = patch.full_name.trim();
  if (full_name.length > 120) {
    return NextResponse.json({ error: "full_name is longer than 120 characters" }, { status: 400 });
  }

  const { data, error } = await supabase.auth.updateUser({ data: { full_name } });
  // A write that fails must SAY so. The page reported "✓ Saved" over a no-op for months.
  if (error || !data?.user) {
    return NextResponse.json({ error: error?.message || "Profile update failed" }, { status: 502 });
  }

  // Echo what was actually persisted, read back from the returned user — not from the
  // request body. Echoing the input would report success for a write that never landed.
  const savedMeta = (data.user.user_metadata || {}) as Record<string, unknown>;
  const persisted = typeof savedMeta.full_name === "string" ? savedMeta.full_name : "";
  if (persisted !== full_name) {
    return NextResponse.json({ error: "Profile update did not persist", expected: full_name, persisted }, { status: 502 });
  }

  return NextResponse.json({ email: data.user.email || "", full_name: persisted });
}
