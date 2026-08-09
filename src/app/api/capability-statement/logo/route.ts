import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { sniffImageType, LOGO_MAX_BYTES, LOGO_BUCKET } from "@/lib/capability-statement-logo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The company logo on the customer's capability statement.
 *
 * THE OBJECT PATH IS DERIVED FROM THE SESSION, NEVER FROM THE REQUEST. This route holds
 * the service-role client to write to storage, which bypasses row-level security, so the
 * only thing standing between one customer and another's logo is that the path is built
 * here from `user.id`. Nothing in the body influences where the file lands.
 */
function objectPath(userId: string, ext: string): string {
  // A random component so the bucket cannot be walked by guessing user ids. The bucket
  // is public-read by design (the pasted copy has to resolve for a contracting officer
  // with no account), so unguessable is the property that matters, not unreadable.
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${userId}/${nonce}.${ext}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "storage is not configured" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file was sent" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json(
      { error: `That logo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.` },
      { status: 413 }
    );
  }

  // THE BYTES DECIDE THE TYPE, NOT THE HEADER. A caller sets Content-Type and the
  // filename; neither is evidence of what the file is. An SVG renamed to .png would
  // otherwise be stored and later served from our origin, and SVG carries script.
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return NextResponse.json(
      { error: "That file is not a PNG, JPEG or WebP image. SVG is not accepted." },
      { status: 415 }
    );
  }

  const path = objectPath(user.id, sniffed.ext);
  const { error: upErr } = await admin.storage.from(LOGO_BUCKET).upload(path, bytes, {
    contentType: sniffed.mime,
    upsert: false,
    cacheControl: "31536000"
  });
  if (upErr) {
    return NextResponse.json({ error: `Could not store the logo: ${upErr.message}` }, { status: 502 });
  }

  const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const logoUrl = pub?.publicUrl;
  if (!logoUrl) {
    await admin.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Could not resolve the stored logo's address." }, { status: 502 });
  }

  // The row is written through the USER's client so row-level security still decides
  // which record may be touched — the admin client is used for storage only.
  const previous = await currentLogo(supabase, user.id);
  const { data: saved, error: saveErr } = await supabase
    .from("capability_statements")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("logo_url")
    .maybeSingle();

  // A ZERO-ROW UPDATE IS A 2xx. Without the .select() above, a customer with no
  // statement row yet would get "saved" and no logo, so the absence of a returned row
  // is treated as the failure it is — and the orphaned object is cleaned up.
  if (saveErr || !saved) {
    await admin.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: saveErr?.message || "Save your company name first — there is no statement to attach a logo to yet." },
      { status: saveErr ? 502 : 409 }
    );
  }

  await removeObject(admin, previous);
  return NextResponse.json({ logo_url: saved.logo_url });
}

export async function DELETE(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const previous = await currentLogo(supabase, user.id);
  const { data: saved, error } = await supabase
    .from("capability_statements")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!saved) return NextResponse.json({ error: "no statement on file" }, { status: 404 });

  const admin = getAdminClient();
  if (admin) await removeObject(admin, previous);
  return NextResponse.json({ logo_url: null });
}

async function currentLogo(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("capability_statements")
    .select("logo_url")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.logo_url as string | null) ?? null;
}

/**
 * Deletes the previous object so replacing a logo five times does not leave five files
 * behind. Only paths inside this bucket are touched, and only the trailing
 * `<user>/<nonce>.<ext>` is used — a stored value pointing anywhere else is left alone
 * rather than being turned into a delete against an arbitrary path.
 */
async function removeObject(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  url: string | null
): Promise<void> {
  if (!url) return;
  const marker = `/${LOGO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return;
  const path = url.slice(at + marker.length).split("?")[0];
  if (!/^[0-9a-f-]+\/[0-9a-f]+\.(png|jpg|webp)$/i.test(path)) return;
  await admin.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
}
