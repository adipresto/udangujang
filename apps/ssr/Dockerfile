# Build context MUST be the repo root (npm workspaces: apps/*, packages/*),
# not apps/ssr/. Build with:
#   docker buildx build --platform linux/amd64 -f apps/ssr/Dockerfile \
#     --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
#     --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
#     --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
#     --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
#     --build-arg NEXT_PUBLIC_ADMIN_EMAILS=... \
#     -t <tag> .
#
# The NEXT_PUBLIC_* vars are baked into the client bundle at build time by
# Next.js (see apps/ssr/.env.example) — they cannot be supplied as plain
# runtime env vars, hence build ARGs here instead of a k8s Secret env.

# ---- deps+protogen: npm workspace install + generate packages/proto/src/gen ----
FROM node:22-bookworm-slim AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/ssr/package.json ./apps/ssr/package.json
COPY packages/proto/package.json ./packages/proto/package.json
RUN npm ci
# `buf` shells out to plugin binaries by name via the OS PATH, not npm's
# module resolution — npm only prepends node_modules/.bin to PATH for
# `npm run` scripts, not for a bare `npx` invocation, so set it explicitly.
# protoc-gen-ts_proto lands in packages/proto/node_modules/.bin (not
# hoisted to the workspace root by this lockfile) — verified by inspecting
# the installed tree, not assumed.
ENV PATH="/src/node_modules/.bin:/src/packages/proto/node_modules/.bin:${PATH}"
COPY proto/ ./proto/
COPY packages/proto/buf.gen.ts.yaml ./packages/proto/buf.gen.ts.yaml
# TS-only template (skips the two Go plugins, which need a Go toolchain
# this image doesn't have) — see packages/proto/buf.gen.ts.yaml.
RUN cd proto && npx --yes @bufbuild/buf generate --template ../packages/proto/buf.gen.ts.yaml

# ---- builder: next build (standalone output) ----
FROM deps AS builder
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_ADMIN_EMAILS
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_ADMIN_EMAILS=$NEXT_PUBLIC_ADMIN_EMAILS
WORKDIR /src
COPY packages/proto/ ./packages/proto/
COPY apps/ssr/ ./apps/ssr/
RUN npm run build:ssr

# ---- runtime: standalone server only, no source/dev deps ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /src/apps/ssr/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /src/apps/ssr/.next/static ./apps/ssr/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["node", "apps/ssr/server.js"]
