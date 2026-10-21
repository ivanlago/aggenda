// Catalog photos use the existing Cloudinary image storage. Other URLs are
// omitted rather than fetched from arbitrary addresses by the public endpoint.
export async function catalogThumbnail(imageUrl: string | null): Promise<Uint8Array | undefined> {
  if (!imageUrl) return;
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/image/upload/")) return;
    url.pathname = url.pathname.replace("/image/upload/", "/image/upload/c_fit,w_160,h_160,f_jpg/");
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return;
    const length = Number(response.headers.get("content-length"));
    if (!Number.isFinite(length) || length <= 0 || length > 256_000) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= 256_000 ? bytes : undefined;
  } catch { return; }
}
