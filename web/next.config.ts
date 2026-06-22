import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicit + safe; no-op under Next 16 auto monorepo transpilation, future-proofs resolution.
  transpilePackages: ["@tokenboard/contracts"],
};

export default nextConfig;
