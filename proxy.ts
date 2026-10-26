import { NextResponse, type NextRequest } from "next/server";
import { appPassword, safeEqual, sessionToken, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC = ["/login", "/api/login"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  const password = appPassword();
  if (!password) {
    // No password: fine on your own computer, never on the internet.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Set the APP_PASSWORD environment variable to use this app.", { status: 503 });
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
