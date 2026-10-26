import fs from "node:fs/promises";
import path from "node:path";

/**
 * Recipe photo storage.
 * - BLOB_READ_WRITE_TOKEN set (Vercel Blob) → private blobs under recipes/<name>.
 * - Otherwise → ./data/uploads on disk, for local dev.
 * Photos are always served through /api/images/<name>, which sits behind the app password.
 */

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const localDir = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "data", "uploads");
const blobPath = (name: string) => `recipes/${name}`;

export async function saveImage(name: string, data: Buffer, contentType: string) {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    await put(blobPath(name), data, { access: "private", contentType, addRandomSuffix: false });
    return;
  }
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ localDir(), name), data);
}

export async function readImage(name: string): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  if (useBlob()) {
    const { get } = await import("@vercel/blob");
    const res = await get(blobPath(name), { access: "private" }).catch(() => null);
    return res?.stream ?? null;
  }
  try {
    return new Uint8Array(await fs.readFile(path.join(/*turbopackIgnore: true*/ localDir(), name)));
  } catch {
    return null;
  }
}

export async function deleteImages(names: string[]) {
  if (names.length === 0) return;
  if (useBlob()) {
    const { del } = await import("@vercel/blob");
    await del(names.map(blobPath)).catch((err) => console.warn("Blob delete failed:", err));
    return;
  }
  await Promise.all(names.map((n) => fs.rm(path.join(/*turbopackIgnore: true*/ localDir(), n), { force: true })));
}
