import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The legal notice moved to the website; old links (e.g. in emails) keep working
  async redirects() {
    return [{ source: "/legal-notice", destination: "https://www.bionostix-germany.de/impressum", permanent: false }];
  },
  experimental: {
    // Stock lists are sent to the server for preview and import
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
