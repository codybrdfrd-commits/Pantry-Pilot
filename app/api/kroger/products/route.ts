import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authRow, searchProducts } from "@/lib/kroger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const term = params.get("term")?.trim();
  const limit = Math.min(Math.max(Number(params.get("limit")) || 8, 1), 30);
  if (!term) return NextResponse.json({ error: "Missing search term." }, { status: 400 });
  try {
    return NextResponse.json(await searchProducts(term, (await authRow()).location_id, limit));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

/** Remember the chosen product for a grocery item (or clear it with upc: null) */
export async function POST(req: Request) {
  const b = (await req.json()) as {
    key: string;
    upc: string | null;
    description?: string;
    size?: string | null;
    price?: number | null;
    image?: string | null;
    quantity?: number;
  };
  if (!b.upc) {
    await query("DELETE FROM product_matches WHERE item_key = $1", [b.key]);
  } else {
    await query(
      `INSERT INTO product_matches (item_key, upc, description, size, price, image, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (item_key) DO UPDATE SET upc = excluded.upc, description = excluded.description,
         size = excluded.size, price = excluded.price, image = excluded.image, quantity = excluded.quantity`,
      [b.key, b.upc, b.description ?? "", b.size ?? null, b.price ?? null, b.image ?? null, Math.max(1, b.quantity ?? 1)],
    );
  }
  return NextResponse.json({ ok: true });
}
