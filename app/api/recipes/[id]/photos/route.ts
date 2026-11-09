import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRecipe, setRecipeImages } from "@/lib/recipes";
import { blobAuthFrom, deleteImages, saveImage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX_PHOTOS = 12;

/** Add photos: multipart `images` (1-6) → { images } */
export async function POST(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const recipe = await getRecipe(id);
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const files = (await req.formData()).getAll("images").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  if (files.length > 6) return NextResponse.json({ error: "Add up to 6 photos at a time." }, { status: 400 });
  if (recipe.images.length + files.length > MAX_PHOTOS)
    return NextResponse.json({ error: `A recipe can have up to ${MAX_PHOTOS} photos. Remove one first.` }, { status: 400 });

  const auth = blobAuthFrom(req);
  const added: string[] = [];
  for (const f of files) {
    const ext = EXT[f.type];
    if (!ext) return NextResponse.json({ error: `${f.name} isn't a JPEG, PNG, WebP or GIF.` }, { status: 400 });
    const data = Buffer.from(await f.arrayBuffer());
    if (data.length > 5 * 1024 * 1024) return NextResponse.json({ error: `${f.name} is over 5 MB.` }, { status: 400 });
    const name = `${crypto.randomUUID()}.${ext}`;
    await saveImage(name, data, f.type, auth);
    added.push(name);
  }
  // A recipe without photos gets the new one as its cover; otherwise new photos go to the end.
  const images = [...recipe.images, ...added];
  await setRecipeImages(id, images);
  return NextResponse.json({ images });
}

/** Reorder or remove: { images } must be a subset of the current photos; the first is the cover. */
export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const recipe = await getRecipe(id);
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { images?: unknown };
  const wanted = Array.isArray(body.images) ? body.images.map(String) : null;
  if (!wanted || wanted.some((n) => !recipe.images.includes(n)) || new Set(wanted).size !== wanted.length)
    return NextResponse.json({ error: "Those photos don't belong to this recipe." }, { status: 400 });
  await setRecipeImages(id, wanted);
  const removed = recipe.images.filter((n) => !wanted.includes(n));
  if (removed.length) await deleteImages(removed, blobAuthFrom(req));
  return NextResponse.json({ images: wanted });
}
