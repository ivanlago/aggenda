import { readFileSync } from "node:fs";

async function main() {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) process.env[line.slice(0, separator)] = line.slice(separator + 1);
  }

  const { deleteClinicalImage, uploadClinicalImage } = await import("../src/lib/cloudinary");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const file = new File([onePixelPng], "aggenda-cloudinary-check.png", { type: "image/png" });
  const uploaded = await uploadClinicalImage(file, "integration-check", "temporary");
  await deleteClinicalImage(uploaded.publicId);
  console.log("Cloudinary verificado: upload autenticado e exclusão concluídos.");
}

main().catch((error) => {
  const details = error && typeof error === "object" ? error as { http_code?: number; name?: string } : {};
  console.error(`Falha na verificação do Cloudinary${details.http_code ? ` (HTTP ${details.http_code})` : ""}${details.name ? `: ${details.name}` : "."}`);
  process.exitCode = 1;
});
