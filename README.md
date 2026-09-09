# udangujang

Merge service: form pemesanan udang (publik) + dashboard admin, dibangun ulang sebagai:

- **SSR App** (React, Server-Side Rendered) — `apps/ssr`
- **DAS** (Data Access Service, Go gRPC) — `services/das`, backing store Firestore sekarang, rencana tambah PostgreSQL
- **Proto** (kontrak gRPC bersama) — `proto/`, generated Go stub + TS client via `packages/proto`

Lihat `CLAUDE.md`, `AGENT.md`, dan `docs/` untuk konteks migrasi lengkap.

## Dev setup (UDMC-1)

Prasyarat: Go ≥1.24, Node ≥20 + npm ≥10. Tidak butuh `protoc`, Docker, atau sudo
— codegen proto jalan user-space via `buf` (npx) + `protoc-gen-go`/`protoc-gen-go-grpc`
(`go install`), dev lokal pakai proses biasa.

```bash
# 1. Install JS deps (root workspaces: apps/*, packages/*)
npm install

# 2. Install Go codegen plugins (sekali saja, masuk ~/go/bin)
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# 3. Generate Go stub + TS client dari proto/
export PATH="$HOME/go/bin:$PATH"
npm run proto:gen

# 4. Jalankan DAS (terminal 1, default :50051)
cd services/das && go run ./cmd/das
#   env: DAS_GRPC_ADDR (default ":50051")

# 5. Jalankan SSR (terminal 2, default :3000)
cp apps/ssr/.env.example apps/ssr/.env.local   # isi Firebase + DAS_GRPC_ADDR
npm run dev:ssr
```

Verifikasi:

```bash
cd services/das && go build ./... && go test ./...   # DAS compile + health RPC test
npm run typecheck --workspace apps/ssr                # TS bersih
npm run build:ssr                                     # Next.js production build
curl http://localhost:3000/                           # halaman placeholder + status DAS
```

Catatan VM ini: binary prebuilt `sharp` (optional dep Next) dan
`@next/swc-linux-x64-gnu` pernah korup saat download (SIGBUS/Bus error).
`sharp` dimatikan permanen via `overrides` (`"sharp": false`) — scaffold tidak
butuh optimasi gambar. Kalau `next build` Bus error lagi, download ulang
`@next/swc-linux-x64-gnu` dari registry (`npm pack`) dan timpa file `.node`-nya.
