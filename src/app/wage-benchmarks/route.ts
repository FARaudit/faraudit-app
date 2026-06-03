import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/wage-benchmarks");

  const filePath = path.join(process.cwd(), "public", "wage-benchmarks.html");
  const html = await readFile(filePath, "utf8");

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, max-age=30, stale-while-revalidate=10" }
  });
}
