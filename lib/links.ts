import dns from "node:dns/promises";
import net from "node:net";

/**
 * Turn a recipe link into text (and a cover photo) Claude can read.
 * - Recipe websites: schema.org Recipe JSON-LD, which nearly every recipe site publishes.
 * - TikTok: the caption, via TikTok's public oEmbed.
 * - YouTube: the video description from the watch page.
 * - Instagram and everything else: Open Graph caption/description plus visible page text (best effort).
 * Only public http(s) addresses are fetched, with a timeout and size limit.
 */

export interface LinkSource {
  url: string;
  site: string;
  text: string;
  image: { data: Buffer; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
// Social sites serve captions in their link-preview tags to preview crawlers.
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX_PAGE = 3 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_TEXT = 24_000;

export class LinkError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new LinkError("Only http and https links are supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new LinkError(`Couldn't find the site ${url.hostname}.`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new LinkError("That link points to a private network address.");
}

/** GET with redirects checked hop by hop, a timeout and a byte cap. */
async function fetchLimited(raw: string, opts: { ua?: string; accept?: string; max: number }) {
  let url = new URL(raw);
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": opts.ua ?? BROWSER_UA, Accept: opts.accept ?? "*/*", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > opts.max) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { res, url, body: Buffer.concat(chunks) };
  }
  throw new LinkError("That link redirects too many times.");
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

function meta(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() || null : null;
}

/** Find schema.org Recipe objects anywhere in the page's JSON-LD. */
function jsonLdRecipes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) out.push(obj);
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      /* ignore malformed blocks */
    }
  }
  return out;
}

function recipeLdToText(r: Record<string, unknown>): string {
  const str = (v: unknown): string =>
    v == null ? "" : typeof v === "string" ? decodeEntities(v) : Array.isArray(v) ? v.map(str).filter(Boolean).join(", ") : typeof v === "object" ? str((v as Record<string, unknown>).text ?? (v as Record<string, unknown>).name ?? "") : String(v);
  const steps = (v: unknown): string[] => {
    if (!v) return [];
    if (typeof v === "string") return [decodeEntities(v)];
    if (Array.isArray(v)) return v.flatMap(steps);
    const o = v as Record<string, unknown>;
    if (o["@type"] === "HowToSection") return steps(o.itemListElement);
    return o.text ? [decodeEntities(String(o.text))] : [];
  };
  const ingredients = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.map(str) : [];
  return [
    `Recipe: ${str(r.name)}`,
    r.recipeYield ? `Yield: ${str(r.recipeYield)}` : "",
    r.totalTime ? `Total time (ISO 8601): ${str(r.totalTime)}` : "",
    r.recipeCategory || r.recipeCuisine ? `Category: ${str([r.recipeCategory, r.recipeCuisine])}` : "",
    "Ingredients:",
    ...ingredients.map((i) => `- ${i}`),
    "Instructions:",
    ...steps(r.recipeInstructions).map((s, i) => `${i + 1}. ${s}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|li|h\d|div|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function fetchImage(raw: string | null | undefined): Promise<LinkSource["image"]> {
  if (!raw) return null;
  try {
    const { res, body } = await fetchLimited(raw, { accept: "image/*", max: MAX_IMAGE });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || body.length === 0 || body.length >= MAX_IMAGE) return null;
    if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "image/gif")
      return { data: body, mediaType: type };
    return null;
  } catch {
    return null;
  }
}

const hostOf = (u: URL) => u.hostname.replace(/^www\.|^m\./, "");

async function tiktok(url: URL): Promise<Partial<LinkSource> | null> {
  const { res, body } = await fetchLimited(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url.href)}`, {
    accept: "application/json",
    max: 512 * 1024,
  });
  if (!res.ok) return null;
  const j = JSON.parse(body.toString("utf8")) as { title?: string; author_name?: string; thumbnail_url?: string };
  if (!j.title) return null;
  return {
    text: `TikTok post by ${j.author_name ?? "unknown"}.\nCaption:\n${j.title}`,
    image: await fetchImage(j.thumbnail_url),
  };
}

async function youtube(url: URL, html: string): Promise<Partial<LinkSource> | null> {
  const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  const description = m ? (JSON.parse(`"${m[1]}"`) as string) : meta(html, "og:description");
  const title = meta(html, "og:title") ?? "";
  if (!description) return null;
  const id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.split("/").pop();
  return {
    text: `YouTube video: ${title}\nDescription:\n${description}`,
    image: await fetchImage(meta(html, "og:image") ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null)),
  };
}

export async function readLink(raw: string): Promise<LinkSource> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LinkError("That doesn't look like a web address.");
  }
  const host = hostOf(url);
  const isSocial = /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|fb\.watch|threads\.net)$/.test(host);

  // TikTok: oEmbed gives the caption without a login (works for short vm.tiktok.com links too).
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const t = await tiktok(url).catch(() => null);
    if (t?.text) return { url: url.href, site: "TikTok", text: t.text, image: t.image ?? null };
  }

  const { res, url: finalUrl, body } = await fetchLimited(url.href, {
    ua: isSocial ? PREVIEW_UA : BROWSER_UA,
    accept: "text/html,application/xhtml+xml",
    max: MAX_PAGE,
  });
  if (!res.ok) throw new LinkError(`The site answered with an error (${res.status}). Try a screenshot instead.`);
  const html = body.toString("utf8");
  const site = meta(html, "og:site_name") ?? hostOf(finalUrl);

  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(hostOf(finalUrl))) {
    const y = await youtube(finalUrl, html);
    if (y?.text) return { url: url.href, site: "YouTube", text: y.text, image: y.image ?? null };
  }

  const image = await fetchImage(meta(html, "og:image") ?? meta(html, "twitter:image"));
  const ld = jsonLdRecipes(html);
  if (ld.length > 0) {
    return { url: url.href, site, text: ld.map(recipeLdToText).join("\n\n---\n\n").slice(0, MAX_TEXT), image };
  }

  const title = meta(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const description = meta(html, "og:description") ?? meta(html, "description") ?? meta(html, "twitter:description") ?? "";
  const text = [
    `Page title: ${decodeEntities(title)}`,
    description ? `Caption / description:\n${description}` : "",
    isSocial ? "" : `Page text:\n${visibleText(html)}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_TEXT);
  if (text.length < 40 && !image) throw new LinkError("Couldn't read anything from that page. Try a screenshot instead.");
  return { url: url.href, site, text, image };
}
