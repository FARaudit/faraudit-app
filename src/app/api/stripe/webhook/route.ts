import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook handler. Verifies signature, then writes/upserts the
// subscriptions row using the service-role admin client so we don't depend
// on a logged-in user session inside the webhook.

interface SubscriptionUpdate {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  tier: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  raw_event: Record<string, unknown>;
  updated_at: string;
}

function tierFromMetadata(meta: Record<string, string | undefined> | null | undefined): string | null {
  return (meta && typeof meta.tier === "string") ? meta.tier : null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !apiKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const stripe = new Stripe(apiKey);
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.warn("[stripe/webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "admin client unavailable" }, { status: 503 });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.client_reference_id as string) || (session.metadata?.user_id as string);
      const tier = tierFromMetadata(session.metadata);
      if (!userId) {
        console.warn("[stripe/webhook] checkout.session.completed missing user_id");
        return NextResponse.json({ ok: true, skipped: "no user_id" });
      }

      const subId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
      const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);

      if (!subId) {
        return NextResponse.json({ ok: true, skipped: "no subscription id on session" });
      }

      // Pull the full subscription so we know period_end + status accurately.
      const subResp = await stripe.subscriptions.retrieve(subId);
      const sub = subResp as unknown as Stripe.Subscription & { current_period_end?: number };
      const update: SubscriptionUpdate = {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        tier,
        status: sub.status,
        current_period_end: typeof sub.current_period_end === "number" ? new Date(sub.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        raw_event: { type: event.type, id: event.id, livemode: event.livemode },
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("subscriptions")
        .upsert(update, { onConflict: "user_id" });
      if (error) console.error("[stripe/webhook] upsert failed:", error.message);

      return NextResponse.json({ ok: true });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      // Find the user by stripe_customer_id; if we never saw the customer
      // (sub created before our schema landed), skip gracefully.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
      if (!existing?.user_id) {
        return NextResponse.json({ ok: true, skipped: "unknown customer" });
      }

      const update: SubscriptionUpdate = {
        user_id: existing.user_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        tier: tierFromMetadata(sub.metadata as Record<string, string | undefined>),
        status: sub.status,
        current_period_end: typeof sub.current_period_end === "number" ? new Date(sub.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        raw_event: { type: event.type, id: event.id, livemode: event.livemode },
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("subscriptions")
        .upsert(update, { onConflict: "user_id" });
      if (error) console.error("[stripe/webhook] upsert failed:", error.message);

      return NextResponse.json({ ok: true });
    }

    // Other events — log + ignore.
    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
