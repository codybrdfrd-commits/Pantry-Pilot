import { NextResponse } from "next/server";
import { addToCart, NotConnectedError } from "@/lib/kroger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { items } = (await req.json()) as { items: { upc: string; quantity: number }[] };
  const clean = (items ?? []).filter((i) => i.upc && i.quantity > 0);
  if (clean.length === 0) return NextResponse.json({ error: "Pick a product for at least one item." }, { status: 400 });
  try {
    await addToCart(clean);
    return NextResponse.json({ added: clean.length });
  } catch (err) {
    const status = err instanceof NotConnectedError ? 401 : 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
