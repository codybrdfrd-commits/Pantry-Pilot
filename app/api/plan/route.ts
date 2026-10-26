import { NextResponse } from "next/server";
import { currentPlan, DEFAULT_SERVINGS, setPlanItems, startNewPlan } from "@/lib/plan";

export const runtime = "nodejs";

/** The current week's recipes */
export async function GET() {
  return NextResponse.json(await currentPlan());
}

/** Replace the week's recipes: { items: [{ recipeId, servings }] } */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: { recipeId: number; servings?: number }[] };
  const items = (body.items ?? [])
    .filter((i) => Number.isInteger(i.recipeId))
    .map((i) => ({ recipeId: i.recipeId, servings: Math.min(Math.max(Math.round(Number(i.servings) || DEFAULT_SERVINGS), 1), 30) }));
  const plan = await currentPlan();
  await setPlanItems(plan.id, items);
  return NextResponse.json(await currentPlan());
}

/** Start a new week */
export async function POST() {
  return NextResponse.json(await startNewPlan());
}
