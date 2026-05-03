import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createServerClient } from "@/lib/supabase-server";

export async function GET() {
  const sbAuth = await createServerClient();
  const {
    data: { user }
  } = await sbAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
