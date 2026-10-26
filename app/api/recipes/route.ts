import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { extractRecipeFromImages, groupRecipeImages } from "@/lib/claude";
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

/**
 * multipart/form-data: 1-10 `images` + optional `note`.
 * Photos can be several recipes at once: Claude sorts them into recipes, then each recipe is read
 * in parallel and saved with only its own photos. Returns { ids, failed }.
 */
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
  let step = "sorting the photos into recipes";
  try {
    let groups: number[][];
    try {
      groups = await groupRecipeImages(images);
    } catch (err) {
      console.warn("Grouping failed, treating the upload as one recipe:", err);
      groups = [images.map((_, i) => i)];
    }
    if (groups.length === 0) {
      return NextResponse.json(
        { error: "No recipe found in those photos. Include the ingredient list or caption in a screenshot." },
        { status: 422 },
      );
    }

    step = "reading the recipes with Claude";
    const auth = blobAuthFrom(req);
    const results = await Promise.allSettled(
      groups.map(async (group) => {
        const groupImages = group.map((i) => images[i]);
        const recipe = await extractRecipeFromImages(groupImages, note);
        if (!recipe.found || recipe.ingredients.length === 0) return null;
        // Store photos only once we know they hold a recipe.
        await Promise.all(groupImages.map((img) => saveImage(img.name, img.data, img.mediaType, auth)));
        return createRecipe({ ...recipe, images: groupImages.map((i) => i.name) });
      }),
    );

    const ids = results.flatMap((r) => (r.status === "fulfilled" && r.value != null ? [r.value] : []));
    const errors = results.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : []));
    errors.forEach((e) => console.error("Recipe failed:", e));
    if (ids.length === 0) {
      const error = errors[0] ? `Failed while ${step}: ${errors[0]}` : "No recipe found in those photos. Include the ingredient list or caption in a screenshot.";
      return NextResponse.json({ error }, { status: errors[0] ? 500 : 422 });
    }
    return NextResponse.json({ ids, failed: groups.length - ids.length });
  } catch (err) {
    console.error(`Failed while ${step}:`, err);
    return NextResponse.json({ error: `Failed while ${step}: ${(err as Error).message}` }, { status: 500 });
  }
}
