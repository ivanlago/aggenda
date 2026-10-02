export function managedOrganizationLogoId(url: string | null, organizationId: string, cloudName: string | undefined) {
  if (!url || !cloudName) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return null;
    const prefix = `/${cloudName}/image/upload/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const publicId = parsed.pathname.slice(prefix.length).replace(/^v\d+\//, "").replace(/\.png$/, "");
    const folder = `aggenda/organizations/${organizationId}/catalog/logos/`;
    return publicId.startsWith(folder) && /^[a-zA-Z0-9_-]+$/.test(publicId.slice(folder.length)) ? publicId : null;
  } catch { return null; }
}
