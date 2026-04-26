import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ status: "shell", solicitations: [], note: "Supabase env vars not set yet" });
  }
  const { data, error } = await supabase
    .from("solicitations")
    .select("*")
    .order("posted_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ solicitations: data });
}
