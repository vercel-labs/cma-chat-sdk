import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@chat-adapter/slack",
    "@chat-adapter/state-redis",
    "chat",
  ],
};

export default nextConfig;
