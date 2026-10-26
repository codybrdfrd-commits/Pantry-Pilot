import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authorizeUrl } from "@/lib/kroger";

export const runtime = "nodejs";

/** Starts the Kroger sign-in. A random state cookie guards the callback against CSRF. */
export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("kroger_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
