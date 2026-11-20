import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained Next server that Electron can launch locally.
  output: "standalone",
  // PGlite ships a WASM runtime and must be available as a Node external.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingExcludes: {
    // Never drag build outputs, installers or test artefacts into the packaged server.
    "/*": ["./release/**/*", "./installer/**/*", "./logs/**/*", "./build/**/*", "./.playwright-mcp/**/*", "./tests/**/*", "./scripts/**/*", "./release-notes/**/*"],
  },
  outputFileTracingIncludes: {
    "/*": ["./agent/watchtower-agent.ps1"],
  },
};

export default nextConfig;
