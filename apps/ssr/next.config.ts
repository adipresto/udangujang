import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @grpc/grpc-js (via @udangujang/proto) uses native Node APIs and must
  // run in the Node.js server runtime, never bundled for the client/edge.
  serverExternalPackages: ["@grpc/grpc-js", "@udangujang/proto"],
  // Produces .next/standalone (a self-contained server.js + pruned
  // node_modules) — the runtime stage of the Docker image copies just
  // that, instead of the full workspace + dev deps (see Dockerfile).
  output: "standalone",
};

export default nextConfig;
