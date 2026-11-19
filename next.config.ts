import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained Next server that Electron can launch locally.
  output: "standalone",
  // PGlite ships a WASM runtime and must be available as a Node external.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/*": ["./agent/chronos-agent.ps1"],
  },
};

export default nextConfig;
