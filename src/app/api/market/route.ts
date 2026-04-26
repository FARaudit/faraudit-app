import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ status: "shell", marketSnapshot: null, note: "Supabase env vars not set yet" });
  }
  const { data, error } = await supabase
    .from("market_snapshots")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshot: data?.[0] ?? null });
}
