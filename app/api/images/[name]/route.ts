import { blobAuthFrom, readImage } from "@/lib/storage";

export const runtime = "nodejs";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Only plain generated filenames — no path traversal.
  if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(name)) return new Response("Not found", { status: 404 });
  const body = await readImage(name, blobAuthFrom(req));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body as BodyInit, {
    headers: { "Content-Type": MIME[name.split(".").pop()!], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
