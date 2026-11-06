import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { query } from "@/lib/db";
import { createRecipe, type RecipeInput } from "@/lib/recipes";
import { blobAuthFrom, saveImage } from "@/lib/storage";
import { CATEGORIES, type Ingredient } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Media = keyof typeof EXT;

/**
 * Save a recipe given as JSON (a suggestion from your receipt, or one row of an import file) → { id }.
 * Optional `image: { data: base64, mediaType }` is stored as the recipe photo.
 * With `skipIfExists: true`, a recipe with the same title is left alone → { id, skipped: true }.
 */
export async function POST(req: Request) {
  const r = (await req.json().catch(() => null)) as
    | (Partial<RecipeInput> & { image?: { data?: string; mediaType?: string }; skipIfExists?: boolean })
    | null;
  if (!r?.title?.trim() || !Array.isArray(r.ingredients) || r.ingredients.length === 0)
    return NextResponse.json({ error: "That recipe is missing a title or ingredients." }, { status: 400 });
  const title = r.title.trim().slice(0, 200);

  if (r.skipIfExists) {
    const [existing] = await query<{ id: number }>("SELECT id FROM recipes WHERE lower(title) = lower($1) LIMIT 1", [title]);
    if (existing) return NextResponse.json({ id: existing.id, skipped: true });
  }

  const images: string[] = [];
  if (r.image?.data && r.image.mediaType && r.image.mediaType in EXT) {
    const data = Buffer.from(r.image.data, "base64");
    if (data.length > 0 && data.length <= 3 * 1024 * 1024) {
      const name = `${crypto.randomUUID()}.${EXT[r.image.mediaType as Media]}`;
      await saveImage(name, data, r.image.mediaType, blobAuthFrom(req));
      images.push(name);
    }
  }

  const ingredients: Ingredient[] = r.ingredients
    .filter((i) => i && typeof i.name === "string" && i.name.trim())
    .map((i) => ({
      name: String(i.name).trim().slice(0, 120),
      quantity: typeof i.quantity === "number" && Number.isFinite(i.quantity) ? i.quantity : null,
      unit: i.unit ? String(i.unit).slice(0, 20) : null,
      note: i.note ? String(i.note).slice(0, 200) : null,
      category: (CATEGORIES as readonly string[]).includes(i.category) ? i.category : "Other",
    }));

  const id = await createRecipe({
    title,
    servings: Number(r.servings) || 4,
    prep_minutes: typeof r.prep_minutes === "number" ? r.prep_minutes : null,
    source: r.source ? String(r.source).slice(0, 300) : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 8) : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String).filter(Boolean) : [],
    images,
    ingredients,
  });
  return NextResponse.json({ id });
}
