import fs from "node:fs/promises";
import path from "node:path";

/**
 * Recipe photo storage.
 * - Vercel Blob connected (BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID with Vercel's OIDC token,
 *   which the SDK picks up by itself) → private blobs under recipes/<name>.
 * - Otherwise → ./data/uploads on disk, for local dev.
 * Photos are always served through /api/images/<name>, which sits behind the app password.
 */

const useBlob = () => {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return true;
  // Vercel's disk is read-only; say what's wrong instead of failing on mkdir.
  if (process.env.VERCEL)
    throw new Error("Photo storage isn't connected. In Vercel, add a Blob store to this project, then redeploy.");
  return false;
};
const localDir = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "data", "uploads");
const blobPath = (name: string) => `recipes/${name}`;

/**
 * Credentials for Vercel Blob. With OIDC-connected stores, pass the request's
 * x-vercel-oidc-token explicitly: if the SDK can't find it on its own it falls
 * back to a developer-machine refresh that writes to disk and fails on Vercel.
 */
export type BlobAuth = { oidcToken?: string };
export const blobAuthFrom = (req: Request): BlobAuth => ({
  oidcToken: req.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || undefined,
});
function blobOptions(auth?: BlobAuth) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return {}; // SDK reads the token itself
  if (!auth?.oidcToken) {
    throw new Error(
      "Photo storage can't sign in: Vercel didn't send its OIDC token. In Vercel, open Settings → Security and turn on OIDC Federation, then redeploy.",
    );
  }
  return { oidcToken: auth.oidcToken, storeId: process.env.BLOB_STORE_ID };
}

export async function saveImage(name: string, data: Buffer, contentType: string, auth?: BlobAuth) {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(blobPath(name), data, { access: "private", contentType, addRandomSuffix: false, ...blobOptions(auth) });
    return;
  }
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ localDir(), name), data);
}

export async function readImage(name: string, auth?: BlobAuth): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  if (useBlob()) {
    const { get } = await import("@vercel/blob");
    const res = await get(blobPath(name), { access: "private", ...blobOptions(auth) }).catch((err) => {
      console.warn("Blob read failed:", err);
      return null;
    });
    return res?.stream ?? null;
  }
  try {
    return new Uint8Array(await fs.readFile(path.join(/*turbopackIgnore: true*/ localDir(), name)));
  } catch {
    return null;
  }
}

export async function deleteImages(names: string[], auth?: BlobAuth) {
  if (names.length === 0) return;
  if (useBlob()) {
    const { del } = await import("@vercel/blob");
    try {
      await del(names.map(blobPath), blobOptions(auth));
    } catch (err) {
      console.warn("Blob delete failed:", err);
    }
    return;
  }
  await Promise.all(names.map((n) => fs.rm(path.join(/*turbopackIgnore: true*/ localDir(), n), { force: true })));
}
