import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
