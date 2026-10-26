import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { extractRecipeFromImages } from "@/lib/claude";
import { createRecipe, listRecipes } from "@/lib/recipes";
import { blobAuthFrom, saveImage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

type Media = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const TYPES: Record<string, { ext: string; media: Media }> = {
  "image/jpeg": { ext: "jpg", media: "image/jpeg" },
  "image/png": { ext: "png", media: "image/png" },
  "image/webp": { ext: "webp", media: "image/webp" },
  "image/gif": { ext: "gif", media: "image/gif" },
};
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

export async function GET() {
  return NextResponse.json(await listRecipes());
}

/** multipart/form-data: one or more `images` (screenshots of a single recipe) + optional `note` */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  const note = (form.get("note") as string | null)?.trim() || undefined;

  if (files.length === 0) return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "Use 10 photos or fewer per recipe." }, { status: 400 });

  const images: { name: string; data: Buffer; mediaType: Media }[] = [];
  for (const file of files) {
    const type = TYPES[file.type];
    if (!type) return NextResponse.json({ error: `${file.name} isn't a JPEG, PNG, WebP or GIF.` }, { status: 400 });
    const data = Buffer.from(await file.arrayBuffer());
    if (data.length > MAX_BYTES)
      return NextResponse.json({ error: `${file.name} is over 5 MB. Try a screenshot instead.` }, { status: 400 });
    images.push({ name: `${crypto.randomUUID()}.${type.ext}`, data, mediaType: type.media });
  }

  // Each step is labelled so a failure says exactly where it happened.
  let step = "reading the recipe with Claude";
  try {
    const recipe = await extractRecipeFromImages(images, note);
    if (!recipe.found || recipe.ingredients.length === 0) {
      return NextResponse.json(
        { error: "No recipe found in those photos. Include the ingredient list or caption in a screenshot." },
        { status: 422 },
      );
    }
    // Store photos only once we know they hold a recipe.
    step = "saving the photo";
    const auth = blobAuthFrom(req);
    await Promise.all(images.map((img) => saveImage(img.name, img.data, img.mediaType, auth)));
    step = "saving the recipe to the database";
    const id = await createRecipe({ ...recipe, images: images.map((i) => i.name) });
    return NextResponse.json({ id });
  } catch (err) {
    console.error(`Failed while ${step}:`, err);
    return NextResponse.json({ error: `Failed while ${step}: ${(err as Error).message}` }, { status: 500 });
  }
}
