import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @grpc/grpc-js (via @udangujang/proto) uses native Node APIs and must
  // run in the Node.js server runtime, never bundled for the client/edge.
  serverExternalPackages: ["@grpc/grpc-js", "@udangujang/proto"],
};

export default nextConfig;
