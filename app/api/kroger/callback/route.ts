import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/kroger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("kroger_state")?.value;
  const back = new URL("/grocery", url.origin);

  if (url.searchParams.get("error") || !code) {
    back.searchParams.set("kroger", "denied");
  } else if (!state || state !== expected) {
    back.searchParams.set("kroger", "state");
  } else {
    try {
      await exchangeCode(code);
      back.searchParams.set("kroger", "connected");
    } catch (err) {
      console.error(err);
      back.searchParams.set("kroger", "error");
      back.searchParams.set("detail", (err as Error).message.slice(0, 300));
    }
  }
  const res = NextResponse.redirect(back);
  res.cookies.delete("kroger_state");
  return res;
}
