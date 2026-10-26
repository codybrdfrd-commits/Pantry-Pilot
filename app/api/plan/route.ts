import { NextResponse } from "next/server";
import { createPlan, getPlan, updateEntry, type CreatePlanInput } from "@/lib/plan";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  return NextResponse.json(await getPlan(id ? Number(id) : undefined));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<CreatePlanInput>;
  const input: CreatePlanInput = {
    startDate: body.startDate || new Date().toISOString().slice(0, 10),
    days: Math.min(Math.max(Number(body.days) || 7, 1), 14),
    meals: body.meals?.length ? body.meals : ["Dinner"],
    servings: Math.min(Math.max(Number(body.servings) || 2, 1), 20),
    notes: body.notes ?? "",
    recipeIds: body.recipeIds ?? [],
  };
  try {
    const id = await createPlan(input);
    return NextResponse.json(await getPlan(id));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Swap a slot's recipe or change its servings */
export async function PATCH(req: Request) {
  const { entryId, recipeId, servings } = (await req.json()) as { entryId: number; recipeId: number | null; servings: number };
  await updateEntry(entryId, recipeId, Math.max(1, servings));
  return NextResponse.json({ ok: true });
}
