import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@crm/types"],
  output: "standalone",
};

export default nextConfig;
