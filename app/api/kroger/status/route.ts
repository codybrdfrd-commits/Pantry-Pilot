import { NextResponse } from "next/server";
import { authRow, disconnect } from "@/lib/kroger";

export const runtime = "nodejs";

export async function GET() {
  const row = await authRow();
  return NextResponse.json({
    configured: Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET),
    connected: Boolean(row.refresh_token || (row.access_token && (row.expires_at ?? 0) > Date.now())),
    locationId: row.location_id,
    locationName: row.location_name,
  });
}

export async function DELETE() {
  await disconnect();
  return NextResponse.json({ ok: true });
}
