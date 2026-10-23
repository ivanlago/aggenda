import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dependency updates from generating repository instruction files.
  agentRules: false,
  outputFileTracingIncludes: {
    "/api/signatures/windows": ["./agents/windows/dist/Aggenda.Assinador.zip"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
