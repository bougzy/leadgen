import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable server-side instrumentation for background jobs
  serverExternalPackages: ['mongodb', 'imapflow'],
};

export default nextConfig;
