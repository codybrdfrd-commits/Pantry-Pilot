/**
 * Browser-side: shrink phone photos before upload. Claude reads images best around
 * 1568px on the long edge, and this keeps uploads well under the 5 MB limit.
 */
export async function shrinkImage(file: File, maxEdge = 1568): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // e.g. HEIC on a browser that can't decode it — let the server reject clearly
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  // Small enough already? Keep the original. Vercel caps a whole upload at 4.5 MB.
  if (scale === 1 && file.size < 700_000 && file.type !== "image/heic") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
