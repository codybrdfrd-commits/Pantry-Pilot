import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, secret-free status: which build is live and whether storage is wired up. */
export async function GET(req: Request) {
  const env = process.env;
  return NextResponse.json({
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    onVercel: Boolean(env.VERCEL),
    database: Boolean(env.DATABASE_URL || env.POSTGRES_URL || env.STORAGE_URL || env.STORAGE_POSTGRES_URL),
    blob: {
      token: Boolean(env.BLOB_READ_WRITE_TOKEN),
      storeId: Boolean(env.BLOB_STORE_ID),
      oidcHeader: Boolean(req.headers.get("x-vercel-oidc-token")),
      oidcEnv: Boolean(env.VERCEL_OIDC_TOKEN),
    },
    password: Boolean(env.APP_PASSWORD),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    kroger: {
      // The client ID is public (it appears in every Kroger sign-in link); the secret is only reported as set or not.
      clientId: env.KROGER_CLIENT_ID?.trim() ?? null,
      secretSet: Boolean(env.KROGER_CLIENT_SECRET?.trim()),
      secretHasSpaces: env.KROGER_CLIENT_SECRET ? env.KROGER_CLIENT_SECRET !== env.KROGER_CLIENT_SECRET.trim() : false,
      redirectUri: env.KROGER_REDIRECT_URI?.trim() ?? null,
    },
  });
}
