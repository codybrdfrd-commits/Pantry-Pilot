import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files; load these from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
