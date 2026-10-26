import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { extractRecipeFromLink } from "@/lib/claude";
import { readLink } from "@/lib/links";
import { createRecipe } from "@/lib/recipes";
import { blobAuthFrom, saveImage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;

/** JSON { urls: string[], note?: string } → { ids, failures: [{ url, reason }] } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { urls?: unknown; note?: unknown };
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map(String).map((u) => u.trim()).filter(Boolean))];
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;
  if (urls.length === 0) return NextResponse.json({ error: "Paste at least one link." }, { status: 400 });
  if (urls.length > 10) return NextResponse.json({ error: "Use 10 links or fewer at a time." }, { status: 400 });

  const auth = blobAuthFrom(req);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const page = await readLink(url);
      const recipe = await extractRecipeFromLink(page, note);
      if (!recipe.found || recipe.ingredients.length === 0) {
        throw new Error("No ingredient list found. If the recipe is only in the video, take a screenshot instead.");
      }
      const images: string[] = [];
      if (page.image) {
        const name = `${crypto.randomUUID()}.${EXT[page.image.mediaType]}`;
        await saveImage(name, page.image.data, page.image.mediaType, auth);
        images.push(name);
      }
      // Keep the original link as the source so the recipe page can link back to it.
      return createRecipe({ ...recipe, source: page.url, images });
    }),
  );

  const ids: number[] = [];
  const failures: { url: string; reason: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ids.push(r.value);
    else failures.push({ url: urls[i], reason: (r.reason as Error).message });
  });
  failures.forEach((f) => console.warn("Link failed:", f.url, f.reason));
  if (ids.length === 0) return NextResponse.json({ error: failures[0]?.reason ?? "Couldn't read those links.", failures }, { status: 422 });
  return NextResponse.json({ ids, failures });
}
