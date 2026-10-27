import { NextResponse } from "next/server";
import { buildGroceryList, getPlan, setHave } from "@/lib/plan";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const idParam = new URL(req.url).searchParams.get("planId");
  const plan = await getPlan(idParam ? Number(idParam) : undefined);
  if (!plan) return NextResponse.json({ planId: null, items: [] });
  return NextResponse.json({ planId: plan.id, items: await buildGroceryList(plan.id) });
}

/** Mark items as already at home (excluded from the cart): { planId, key | keys, have } */
export async function PATCH(req: Request) {
  const { planId, key, keys, have } = (await req.json()) as { planId: number; key?: string; keys?: string[]; have: boolean };
  for (const k of [...(keys ?? []), ...(key ? [key] : [])].slice(0, 200)) await setHave(planId, k, have);
  return NextResponse.json({ ok: true });
}
