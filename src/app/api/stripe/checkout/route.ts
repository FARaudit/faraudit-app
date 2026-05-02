import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRICE_BY_TIER: Record<string, string | undefined> = {
  design_partner: process.env.STRIPE_PRICE_FA_DESIGN_PARTNER,
  standard: process.env.STRIPE_PRICE_FA_STANDARD,
  growth: process.env.STRIPE_PRICE_FA_GROWTH
};

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Checkout offline. Email jose@faraudit.com to onboard." }, { status: 503 });
  }

  let body: { tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const tier = String(body.tier || "").toLowerCase();
  const priceId = PRICE_BY_TIER[tier];
  if (!priceId) {
    return NextResponse.json({ error: `Unknown tier: ${tier || "(missing)"}` }, { status: 400 });
  }

  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin = req.headers.get("origin") || "https://faraudit.com";

  // Reuse the existing Stripe customer if we already have one stored.
  let customerId: string | undefined;
  const { data: existingSub } = await sb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingSub?.stripe_customer_id) customerId = existingSub.stripe_customer_id;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,
      customer_email: customerId ? undefined : (user.email ?? undefined),
      client_reference_id: user.id,
      success_url: `${origin}/home?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { tier, user_id: user.id }
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
