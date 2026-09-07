import { deleteCatalogImage, type CatalogEntityType, uploadCatalogImage } from "@/lib/cloudinary";

export type CatalogImageFields = { imageUrl?: string | null; imagePublicId?: string | null };

export async function persistWithCatalogImage<T>({
  formData,
  organizationId,
  entityType,
  currentPublicId,
  persist,
}: {
  formData: FormData;
  organizationId: string;
  entityType: CatalogEntityType;
  currentPublicId?: string | null;
  persist: (fields: CatalogImageFields) => Promise<T>;
}) {
  const fileValue = formData.get("image");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  const removeCurrent = formData.get("removeImage") === "on";
  const uploaded = file ? await uploadCatalogImage(file, organizationId, entityType) : null;
  const fields: CatalogImageFields = uploaded
    ? { imageUrl: uploaded.url, imagePublicId: uploaded.publicId }
    : removeCurrent
      ? { imageUrl: null, imagePublicId: null }
      : {};

  try {
    const result = await persist(fields);
    if ((uploaded || removeCurrent) && currentPublicId && currentPublicId !== uploaded?.publicId) {
      await deleteCatalogImage(currentPublicId).catch((error) => console.error("Falha ao excluir imagem cadastral anterior", error));
    }
    return result;
  } catch (error) {
    if (uploaded) await deleteCatalogImage(uploaded.publicId).catch(() => undefined);
    throw error;
  }
}
