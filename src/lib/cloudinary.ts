import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configureCloudinary() {
  if (configured) return cloudinary;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  configured = true;
  return cloudinary;
}

export type ClinicalImageUpload = {
  assetId: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
};

export async function uploadClinicalImage(file: File, organizationId: string, clientId: string): Promise<ClinicalImageUpload> {
  const api = configureCloudinary();
  const bytes = Buffer.from(await file.arrayBuffer());
  return await new Promise((resolve, reject) => {
    const stream = api.uploader.upload_stream({
      resource_type: "image",
      type: "authenticated",
      folder: `aggenda/organizations/${organizationId}/clients/${clientId}/clinical-media`,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      invalidate: true,
    }, (error, result) => {
      if (error || !result) return reject(error ?? new Error("Falha ao armazenar imagem clínica."));
      resolve({ assetId: result.asset_id, publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes, format: result.format });
    });
    stream.end(bytes);
  });
}

export function clinicalImageDeliveryUrl(publicId: string, width?: number) {
  const api = configureCloudinary();
  return api.url(publicId, {
    type: "authenticated",
    sign_url: true,
    secure: true,
    transformation: [{ crop: "limit", width: width ?? 1600, quality: "auto:good", fetch_format: "auto" }],
  });
}

export async function deleteClinicalImage(publicId: string) {
  const api = configureCloudinary();
  await api.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
}
