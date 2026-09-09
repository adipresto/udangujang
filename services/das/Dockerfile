# Build context MUST be the repo root (not services/das/), because DAS
# depends on proto/ (source of truth for generated code, gitignored —
# see .gitignore) which lives outside this directory. Build with:
#   docker buildx build --platform linux/amd64 -f services/das/Dockerfile -t <tag> .

# ---- protogen: regenerate services/das/internal/pb from proto/ ----
# protoc-gen-go / protoc-gen-go-grpc versions below match go.sum
# (google.golang.org/protobuf v1.36.12, google.golang.org/grpc v1.83.2) —
# see services/das/go.sum. buf itself is fetched by `npx` (no protoc
# needed), so this stage also needs Node.
FROM golang:1.25-bookworm AS protogen
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12 \
    && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
ENV PATH="/root/go/bin:${PATH}"
WORKDIR /src
COPY proto/ ./proto/
COPY services/das/go.mod services/das/go.sum ./services/das/
COPY services/das/buf.gen.go.yaml ./services/das/buf.gen.go.yaml
# Go-only template (skips the TS plugin, which needs packages/proto's
# node_modules that this stage never installs) — see buf.gen.go.yaml.
RUN cd proto && npx --yes @bufbuild/buf generate --template ../services/das/buf.gen.go.yaml

# ---- builder: compile static binary ----
FROM golang:1.25-bookworm AS builder
WORKDIR /src/services/das
COPY services/das/go.mod services/das/go.sum ./
RUN go mod download
COPY services/das/ ./
COPY --from=protogen /src/services/das/internal/pb ./internal/pb
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/das ./cmd/das

# ---- runtime: distroless, non-root, static binary only ----
FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=builder /out/das /das
USER nonroot:nonroot
EXPOSE 50051
ENTRYPOINT ["/das"]
