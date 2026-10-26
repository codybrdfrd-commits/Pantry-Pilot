import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { extractRecipeFromLink, fetchRecipeTextViaClaude } from "@/lib/claude";
import { LinkError, readLink, type LinkSource } from "@/lib/links";
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
      let page: LinkSource | null = null;
      try {
        page = await readLink(url);
      } catch (err) {
        // Bad or private links stop here; blocked/unreachable sites get a second try below.
        if (!(err instanceof LinkError && err.retryable)) throw err;
      }
      let recipe = page ? await extractRecipeFromLink(page, note) : null;
      const isSocial = /(instagram|tiktok|youtube|youtu\.be|facebook)\./i.test(url);
      let fallbackError: string | null = null;

      // Blocked, or a JavaScript-built page with no recipe in its HTML: let Claude fetch it instead.
      if (!recipe?.found && !isSocial) {
        const text = await fetchRecipeTextViaClaude(url).catch((err) => {
          console.warn("Claude web fetch failed:", url, err);
          fallbackError = (err as Error).message;
          return null;
        });
        if (text) {
          page = { url, site: new URL(url).hostname.replace(/^www\./, ""), text, image: page?.image ?? null };
          recipe = await extractRecipeFromLink(page, note);
        }
      }
      if (!page || !recipe?.found || recipe.ingredients.length === 0) {
        throw new Error(
          isSocial
            ? "No ingredient list found in the caption. If the recipe is only in the video, take a screenshot instead."
            : fallbackError
              ? `That site blocked the app, and fetching it through Claude failed: ${fallbackError}`
              : "That site blocked the app or has no written recipe on the page. Take a screenshot of the recipe instead.",
        );
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
