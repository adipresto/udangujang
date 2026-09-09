# Keseluruhan projek

**udangujang** adalah hasil merge dua service terpisah menjadi satu aplikasi React SSR:

- **UUA** (`C:\Users\KAINE\Documents\Pekerjaan\UUA`) — form pemesanan publik untuk kastamer, single-page `src/index.html`, tidak menyimpan pesanan ke database (langsung ke WhatsApp).
- **udang-dashboard** (`C:\Users\KAINE\Documents\Development\udang-dashboard`) — dashboard admin (`index.html`, ~5000 baris), kelola kastamer/pesanan/status antar-bayar/transaksi/rute, plus editor `config/harga` & `promo_codes`.

Kedua source lama itu **referensi**, bukan starting point untuk copy-paste langsung — baca `docs/migration-context.md` untuk pemetaan fitur & skema lengkap sebelum implementasi.

## Tujuan merge (lihat docs/scenario.md untuk detail lengkap)

1. Kastamer isi form pemesanan (UI/UX sama seperti UUA, tidak diubah) → submit langsung tulis ke database yang sama dipakai admin — admin tidak perlu input manual lagi.
2. Form "tambah pesanan baru" di dashboard admin **diganti** supaya pakai form/skema yang sama dengan form pemesanan publik (bukan form modal lama dashboard).
3. Semua fitur dashboard lain (status antar/bayar, kastamer, wilayah, transaksi, rute, harga, promo) **tetap dipertahankan** — hanya jalur "tambah pesanan baru" yang diganti.
4. Model data kastamer berubah: sebelumnya unique key adalah `nama + noHp`. Sekarang **satu kastamer bisa punya banyak alamat berbeda** — alamat perlu dipisah dari record kastamer (lihat docs/migration-context.md § Alamat).

## Stack & arsitektur service

Tiga bagian, bukan satu:

1. **SSR app** (React, Server-Side Rendered) — UI form pemesanan publik + dashboard admin. Tidak pernah bicara langsung ke Firestore — semua baca/tulis data lewat gRPC ke DAS.
2. **DAS (Data Access Service)** — Go, gRPC. Satu-satunya service yang boleh READ/WRITE ke database. Sekarang backing store-nya Firestore (project `atminujangudang`, sama seperti kedua source lama), **rencana ke depan pindah/tambah PostgreSQL** — karena itu DAS harus punya lapisan repository/interface yang independen dari Firestore, jangan bocorkan tipe/query Firestore ke caller (SSR) lewat proto.
3. **Firestore** (untuk sekarang) — backing store DAS. Firebase Auth tetap dipakai untuk login admin (dipertahankan dari udang-dashboard), kemungkinan tetap terpisah dari DAS (auth token diverifikasi di SSR atau DAS, TBD saat implementasi).

Konsekuensi desain:
- Form publik & admin **tidak** submit langsung ke Firestore dari browser maupun dari SSR — selalu lewat RPC ke DAS (`CreatePesanan`, dst).
- Proto/schema gRPC DAS harus didesain generik (tidak Firestore-specific) supaya migrasi ke Postgres nanti tidak mengubah kontrak SSR↔DAS.
- Skema `config/harga`, `promo_codes`, `wilayah`, `kastamer`, `alamat`, `pesanan`, `statusLog`, `transaksi`, `ruteHarian` di Firestore adalah **detail implementasi DAS** — SSR hanya kenal bentuk data lewat proto DAS, bukan lewat Firestore langsung.

## Aturan kerja

- **Jangan** ubah UX/copy form pemesanan publik — port field-by-field dari UUA `HARGA_CONFIG`/form logic, jangan re-desain.
- **Jangan** hapus fitur dashboard yang sudah ada — port dulu, baru tambahkan integrasi baru.
- Field harga (`config/harga`) & promo (`promo_codes`) tetap dipertahankan skemanya persis — dashboard & (nanti) form baca dokumen yang sama.
- Harga non-linear (udang kupas ½kg, kembung ½kg, teri nasi 1kg) itu bukan bug — jangan "diperbaiki" jadi proporsional.
- Cek `docs/erd.md` untuk skema Firestore lengkap sebelum menambah/mengubah collection.

## Project memory (dibaca tiap run — JANGAN baca ulang file di bawah kecuali diminta)

Kamu jalan sebagai `claude -p` sekali-pakai tanpa memori sesi. Semua yang
perlu kamu tahu sudah dirangkum di sini — jangan habiskan turns untuk
membaca ulang CLAUDE.md / AGENT.md / docs / file existing, kecuali prompt
eksplisit menyuruh baca file tertentu (mis. reference verbatim).

### Status (update tiap tiket selesai)

- UDMC-1 Done: scaffold monorepo (commit db7c64d).
- UDMC-2 Done: proto kastamer/v1 + repo interfaces + firestore impl (516d065).
- UDMC-3 Done: proto pesanan/v1 + CreatePesanan (6f9ed32).
- UDMC-4 in-progress: proto harga/v1 + pricing.ts + wa-message.ts SUDAH ADA
  (parsial, belum commit); sisa: OrderForm.tsx, pesan/page.tsx, submitPesanan.ts.

### Pola DAS (Go) — ikuti persis, jangan variasi

- Proto di `proto/udangujang/<domain>/v1/*.proto`, `go_package` =
  `udangujang/das/gen/udangujang/<domain>/v1;<domain>v1`. Timestamp SELALU
  `google.protobuf.Timestamp`. TIDAK ADA tipe Firestore di proto.
- Codegen via `npm run proto:gen` (Hermes yang jalanin, BUKAN kamu).
  Output Go: `services/das/internal/pb/...`, TS: `packages/proto/src/gen/...`.
- Domain: `services/das/internal/domain/<x>.go` — struct plain + interface
  Repository (contoh: `KastamerRepository`, `AlamatRepository`,
  `PesananRepository`, `PromoRepository`). Error `domain.ErrNotFound`.
- Store: `services/das/internal/store/firestore/<x>.go` — impl interface.
  Client via `fsstore.NewClient(ctx)` (env `FIRESTORE_PROJECT_ID`,
  default `atminujangudang`). Koleksi: kastamer, alamat, wilayah,
  pesanan, promo_codes, config/harga (singleton doc).
- Handler: `services/das/internal/server/<x>.go` — struct pegang interface
  domain (JANGAN import firestore), return gRPC status errors
  (`codes.InvalidArgument` untuk validasi, `codes.NotFound` untuk missing).
- Test: `services/das/internal/server/<x>_test.go` + `fakes_test.go` —
  fake in-memory, TANPA Firestore, TANPA network.
- Registrasi service di `services/das/cmd/das/main.go`.
- Verifikasi: `go build ./...` + `go test ./...` dari `services/das`.

### Pola SSR (Next.js, apps/ssr)

- Server component untuk fetch data (via `lib/das-client.ts` gRPC),
  client component untuk form interaktif. Form publik TANPA auth.
- `lib/pricing.ts`: rumus harga verbatim UUA. `lib/wa-message.ts`:
  builder pesan WA + `WA_NUMBER` (baca dari reference, jangan karang).
- Typecheck: `npm run typecheck --workspace apps/ssr`. Build: `npm run build:ssr`
  dari root. JANGAN `npm install` — Hermes yang pegang install.

### Keputusan desain (final, jangan dibuka ulang tanpa diminta)

- Kastamer unique by `noHp`. Alamat 1:N (FK kastamerId, wilayahId).
- Pesanan baru SELALU `belum_antar` + `belum_bayar`, tanggal null
  (konfirmasi ikut flow UDMC-6).
- `totalHarga` STRING format `Rp` + titik ribuan (contoh `Rp110.000`).
- Promo di CreatePesanan hanya DIVALIDASI (apply + usedCount ikut flow bayar).
- Ongkir di CreatePesanan field caller-supplied (klasifikasi wilayah ikut UDMC-4).
- Metode pembayaran string bebas (jangan enum ketat).
- Submit form: WA redirect duluan (tidak boleh diblokir), CreatePesanan
  fire-and-forget paralel (best-effort ala incrementPromoUsage lama).
- Firebase di SSR hanya Auth. Proto storage-agnostic.

### Toolchain VM (tanpa sudo — JANGAN coba install)

- Go 1.24.4 (`~/go/go/bin/go`), Node 26, buf via npx, ts-proto.
  Tanpa `protoc`/`docker`/`gh-login`. Hermes pegang semua install/download.
- Binary prebuilt korup saat download adalah pola berulang di VM ini
  (sharp, swc, dprint, colour) — kalau crash Bus error/SIGBUS, lapor ke
  Hermes, jangan reinstall sendiri.
