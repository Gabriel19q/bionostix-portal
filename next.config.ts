import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Stock lists are sent to the server for preview and import
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
