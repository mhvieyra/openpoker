import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The game rooms and bots live in apps/server/src and the engine in packages/engine/src;
  // the browser runs them directly when no remote game server is configured.
  transpilePackages: ["@openpoker/shared", "@openpoker/engine"],
  experimental: { externalDir: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias["@server"] = path.resolve(here, "../server/src");
    config.resolve.alias["@openpoker/engine"] = path.resolve(here, "../../packages/engine/src/index.ts");
    // Sources use NodeNext-style ".js" import specifiers that point at ".ts" files.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
