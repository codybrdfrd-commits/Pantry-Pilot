import { query } from "./db";

/**
 * Kroger Public API client.
 * - Product + Location search use the app's client-credentials token.
 * - Cart writes need the shopper's token from the authorization-code flow (scope cart.basic:write).
 * The public Cart API can only ADD items; viewing/removing/checkout happen on kroger.com or the app.
 */

const BASE = "https://api.kroger.com/v1";
export const USER_SCOPES = "cart.basic:write profile.compact product.compact";

function creds() {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  const redirect = process.env.KROGER_REDIRECT_URI;
  if (!id || !secret || !redirect)
    throw new Error("Set KROGER_CLIENT_ID, KROGER_CLIENT_SECRET and KROGER_REDIRECT_URI in .env");
  return { id, secret, redirect };
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch(`${BASE}/connect/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Kroger token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

// ---- App token (client credentials) ----
let appToken: { token: string; expires: number } | null = null;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expires > Date.now() + 60_000) return appToken.token;
  const t = await tokenRequest({ grant_type: "client_credentials", scope: "product.compact" });
  appToken = { token: t.access_token, expires: Date.now() + t.expires_in * 1000 };
  return appToken.token;
}

// ---- Shopper token (authorization code) ----
interface AuthRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  location_id: string | null;
  location_name: string | null;
}

export async function authRow(): Promise<AuthRow> {
  const [row] = await query<AuthRow>("SELECT * FROM kroger_auth WHERE id = 1");
  // BIGINT may come back as a string depending on the driver
  return { ...row, expires_at: row.expires_at == null ? null : Number(row.expires_at) };
}

export function authorizeUrl(state: string): string {
  const { id, redirect } = creds();
  const q = new URLSearchParams({
    scope: USER_SCOPES,
    response_type: "code",
    client_id: id,
    redirect_uri: redirect,
    state,
  });
  return `${BASE}/connect/oauth2/authorize?${q}`;
}

async function saveUserToken(t: { access_token: string; refresh_token?: string; expires_in: number }) {
  await query(
    "UPDATE kroger_auth SET access_token = $1, refresh_token = COALESCE($2, refresh_token), expires_at = $3 WHERE id = 1",
    [t.access_token, t.refresh_token ?? null, Date.now() + t.expires_in * 1000],
  );
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: creds().redirect });
  await saveUserToken(t);
}

export async function disconnect() {
  await query("UPDATE kroger_auth SET access_token = NULL, refresh_token = NULL, expires_at = NULL WHERE id = 1");
}

async function getUserToken(): Promise<string> {
  const row = await authRow();
  if (!row.refresh_token && !row.access_token) throw new NotConnectedError();
  if (row.access_token && row.expires_at && row.expires_at > Date.now() + 60_000) return row.access_token;
  if (!row.refresh_token) throw new NotConnectedError();
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    await saveUserToken(t);
    return t.access_token;
  } catch {
    await disconnect();
    throw new NotConnectedError();
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super("Connect your Kroger account first.");
  }
}

// ---- Locations ----
export interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string;
  address: string;
}

export async function searchLocations(zip: string): Promise<KrogerLocation[]> {
  const q = new URLSearchParams({ "filter.zipCode.near": zip, "filter.limit": "10", "filter.radiusInMiles": "15" });
  const res = await fetch(`${BASE}/locations?${q}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Store search failed (${res.status})`);
  const json = (await res.json()) as {
    data: { locationId: string; name: string; chain: string; address: { addressLine1: string; city: string; state: string } }[];
  };
  return json.data.map((l) => ({
    locationId: l.locationId,
    name: l.name,
    chain: l.chain,
    address: `${l.address.addressLine1}, ${l.address.city}, ${l.address.state}`,
  }));
}

export async function setLocation(locationId: string, name: string) {
  await query("UPDATE kroger_auth SET location_id = $1, location_name = $2 WHERE id = 1", [locationId, name]);
}

// ---- Products ----
export interface KrogerProduct {
  productId: string;
  upc: string;
  description: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  promo: number | null;
  image: string | null;
  inStock: boolean | null;
}

interface RawProduct {
  productId: string;
  upc: string;
  description: string;
  brand?: string;
  images?: { perspective: string; featured?: boolean; sizes: { size: string; url: string }[] }[];
  items?: {
    size?: string;
    price?: { regular?: number; promo?: number };
    fulfillment?: { inStore?: boolean; curbside?: boolean; delivery?: boolean };
    inventory?: { stockLevel?: string };
  }[];
}

function pickImage(p: RawProduct): string | null {
  const img = p.images?.find((i) => i.featured) ?? p.images?.find((i) => i.perspective === "front") ?? p.images?.[0];
  return img?.sizes.find((s) => s.size === "medium")?.url ?? img?.sizes[0]?.url ?? null;
}

export async function searchProducts(term: string, locationId?: string | null, limit = 8): Promise<KrogerProduct[]> {
  const q = new URLSearchParams({ "filter.term": term.slice(0, 100), "filter.limit": String(limit) });
  if (locationId) q.set("filter.locationId", locationId);
  const res = await fetch(`${BASE}/products?${q}`, {
    headers: { Authorization: `Bearer ${await getAppToken()}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Product search failed (${res.status})`);
  const json = (await res.json()) as { data: RawProduct[] };
  return json.data.map((p) => {
    const item = p.items?.[0];
    return {
      productId: p.productId,
      upc: p.upc,
      description: p.description,
      brand: p.brand ?? null,
      size: item?.size ?? null,
      price: item?.price?.regular || null,
      promo: item?.price?.promo || null,
      image: pickImage(p),
      inStock: item?.inventory?.stockLevel ? item.inventory.stockLevel !== "TEMPORARILY_OUT_OF_STOCK" : null,
    };
  });
}

// ---- Cart ----
export async function addToCart(items: { upc: string; quantity: number }[]) {
  const modality = process.env.KROGER_MODALITY === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const res = await fetch(`${BASE}/cart/add`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await getUserToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ items: items.map((i) => ({ upc: i.upc, quantity: i.quantity, modality })) }),
  });
  if (res.status === 401) {
    await disconnect();
    throw new NotConnectedError();
  }
  if (!res.ok) throw new Error(`Adding to cart failed (${res.status}): ${await res.text()}`);
}
