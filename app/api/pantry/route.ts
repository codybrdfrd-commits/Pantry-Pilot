import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { CATEGORIES, type Category, type PantryItem } from "@/lib/types";

export const runtime = "nodejs";

/** What you have on hand (from scanned receipts) */
export async function GET() {
  const [row] = await query<{ items: string; updated_at: Date | string }>("SELECT items, updated_at FROM pantry WHERE id = 1");
  return NextResponse.json({ items: row ? (JSON.parse(row.items) as PantryItem[]) : [], updatedAt: row?.updated_at ?? null });
}

/** Replace the on-hand list: { items: [{ name, category }] } */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { items?: { name?: unknown; category?: unknown }[] };
  const seen = new Set<string>();
  const items: PantryItem[] = [];
  for (const i of body.items ?? []) {
    const name = String(i.name ?? "").trim().toLowerCase().slice(0, 80);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const category = (CATEGORIES as readonly string[]).includes(String(i.category)) ? (i.category as Category) : "Other";
    items.push({ name, category });
  }
  await query("UPDATE pantry SET items = $1, updated_at = now() WHERE id = 1", [JSON.stringify(items.slice(0, 200))]);
  return NextResponse.json({ items });
}
