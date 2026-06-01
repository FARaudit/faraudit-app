import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("pipeline")
      .select("*")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pipeline: data ?? [] });
  } catch (err) {
    console.error("[api/pipeline]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
