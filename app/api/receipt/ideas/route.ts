import { NextResponse } from "next/server";
import { suggestRecipes } from "@/lib/claude";
import { listRecipes } from "@/lib/recipes";

export const runtime = "nodejs";
export const maxDuration = 120;

/** { items: string[] } → { ideas } (not saved until you choose one) */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: unknown };
  const items = (Array.isArray(body.items) ? body.items : []).map((i) => String(i).trim()).filter(Boolean).slice(0, 120);
  if (items.length < 2) return NextResponse.json({ error: "Add at least a couple of groceries first." }, { status: 400 });
  try {
    const existing = (await listRecipes()).map((r) => r.title);
    return NextResponse.json({ ideas: await suggestRecipes(items, existing) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: `Couldn't come up with ideas: ${(err as Error).message}` }, { status: 500 });
  }
}
