import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, secret-free status: which build is live and whether storage is wired up. */
export async function GET() {
  const env = process.env;
  return NextResponse.json({
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    onVercel: Boolean(env.VERCEL),
    database: Boolean(env.DATABASE_URL || env.POSTGRES_URL || env.STORAGE_URL || env.STORAGE_POSTGRES_URL),
    blob: { token: Boolean(env.BLOB_READ_WRITE_TOKEN), storeId: Boolean(env.BLOB_STORE_ID) },
    password: Boolean(env.APP_PASSWORD),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    kroger: Boolean(env.KROGER_CLIENT_ID && env.KROGER_CLIENT_SECRET && env.KROGER_REDIRECT_URI),
  });
}
