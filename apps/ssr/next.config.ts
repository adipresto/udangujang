import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @grpc/grpc-js (via @udangujang/proto) uses native Node APIs and must
  // run in the Node.js server runtime, never bundled for the client/edge.
  serverExternalPackages: ["@grpc/grpc-js", "@udangujang/proto"],
  // Produces .next/standalone (a self-contained server.js + pruned
  // node_modules) — the runtime stage of the Docker image copies just
  // that, instead of the full workspace + dev deps (see Dockerfile).
  output: "standalone",
  // Public-IP routing (k8s/06-ingress.yaml): Traefik meneruskan prefix
  // /pesanudang dan /atminudang apa adanya; Next rewrite ke route asli.
  // Asset/link absolut tetap /_next/... — tidak butuh basePath.
  async rewrites() {
    return [
      { source: "/pesanudang", destination: "/pesan" },
      { source: "/pesanudang/:path*", destination: "/pesan/:path*" },
      { source: "/atminudang", destination: "/admin" },
      { source: "/atminudang/:path*", destination: "/admin/:path*" },
    ];
  },
};

export default nextConfig;
