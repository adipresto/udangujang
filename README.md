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

Bug hoisting `node_modules` (ditemukan lewat verifikasi lokal, belum digali
root cause-nya): step 3 di atas (`npm run proto:gen`) bisa gagal dengan
`exec: "protoc-gen-ts_proto": executable file not found in %PATH%` karena
`ts-proto` ke-install nested di `packages/proto/node_modules/.bin`, bukan
ke-hoist ke root `node_modules/.bin` seperti diasumsikan komentar di
`proto/buf.gen.yaml`. Pola yang sama juga di `apps/ssr` — `tsc`/`next` nested
di `apps/ssr/node_modules/.bin`, jadi `npm run typecheck --workspace apps/ssr`
dari root PATH juga bisa gagal cara yang sama. Workaround sementara (bukan
fix, jangan di-hardcode ke script manapun):
```bash
PATH="$PATH:$(cd packages/proto/node_modules/.bin && pwd)" npm run proto:gen   # jalankan dari proto/
PATH="apps/ssr/node_modules/.bin:$PATH" tsc --noEmit -p apps/ssr/tsconfig.json
```
Setelah PATH dibetulkan manual, codegen sukses dan hasilnya (`services/das/internal/pb`,
`packages/proto/src/gen`) identik dengan yang sudah ter-commit — jadi bukan
proto basi, murni `npm install` tidak hoisting sesuai desain workspace.
Kemungkinan penyebab: `overrides` di root `package.json` atau version
conflict yang mencegah dedupe/hoist — perlu dicek pas `npm install`
berikutnya.
