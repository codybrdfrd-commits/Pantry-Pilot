import { NextResponse } from "next/server";
import { buildGroceryList, getPlan, setHave } from "@/lib/plan";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const idParam = new URL(req.url).searchParams.get("planId");
  const plan = await getPlan(idParam ? Number(idParam) : undefined);
  if (!plan) return NextResponse.json({ planId: null, items: [] });
  return NextResponse.json({ planId: plan.id, items: await buildGroceryList(plan.id) });
}

/** Mark an item as already at home (excluded from the cart) */
export async function PATCH(req: Request) {
  const { planId, key, have } = (await req.json()) as { planId: number; key: string; have: boolean };
  await setHave(planId, key, have);
  return NextResponse.json({ ok: true });
}
