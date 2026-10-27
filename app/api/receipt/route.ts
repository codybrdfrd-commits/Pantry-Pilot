import { NextResponse } from "next/server";
import { readReceipt } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

type Media = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const OK = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** multipart/form-data: 1-4 `images` of one receipt → { store, items } (not saved; the page merges and saves) */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Add a photo of your receipt." }, { status: 400 });
  if (files.length > 4) return NextResponse.json({ error: "Use up to 4 photos for one receipt." }, { status: 400 });
  const images: { data: Buffer; mediaType: Media }[] = [];
  for (const f of files) {
    if (!OK.has(f.type)) return NextResponse.json({ error: `${f.name} isn't a JPEG, PNG, WebP or GIF.` }, { status: 400 });
    const data = Buffer.from(await f.arrayBuffer());
    if (data.length > 5 * 1024 * 1024) return NextResponse.json({ error: `${f.name} is over 5 MB.` }, { status: 400 });
    images.push({ data, mediaType: f.type as Media });
  }
  try {
    const out = await readReceipt(images);
    if (!out.is_receipt) return NextResponse.json({ error: "That doesn't look like a receipt. Try a clearer photo of the whole receipt." }, { status: 422 });
    if (out.items.length === 0) return NextResponse.json({ error: "No food items found on that receipt." }, { status: 422 });
    return NextResponse.json({ store: out.store, items: out.items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: `Couldn't read the receipt: ${(err as Error).message}` }, { status: 500 });
  }
}
