import { NextResponse } from "next/server";
import { searchLocations, setLocation } from "@/lib/kroger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const zip = new URL(req.url).searchParams.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
  try {
    return NextResponse.json(await searchLocations(zip));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

/** Save the preferred store (used for local prices and stock) */
export async function POST(req: Request) {
  const { locationId, name } = (await req.json()) as { locationId: string; name: string };
  await setLocation(locationId, name);
  return NextResponse.json({ ok: true });
}
