import { NextResponse } from "next/server";
import { createRecipe, type RecipeInput } from "@/lib/recipes";

export const runtime = "nodejs";

/** Save a recipe given as JSON (e.g. a suggestion from your receipt) → { id } */
export async function POST(req: Request) {
  const r = (await req.json().catch(() => null)) as Partial<RecipeInput> | null;
  if (!r?.title?.trim() || !Array.isArray(r.ingredients) || r.ingredients.length === 0)
    return NextResponse.json({ error: "That recipe is missing a title or ingredients." }, { status: 400 });
  const id = await createRecipe({
    title: r.title.trim().slice(0, 200),
    servings: Number(r.servings) || 4,
    prep_minutes: r.prep_minutes ?? null,
    source: r.source ?? null,
    tags: Array.isArray(r.tags) ? r.tags.map(String).slice(0, 8) : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    images: [],
    ingredients: r.ingredients,
  });
  return NextResponse.json({ id });
}
