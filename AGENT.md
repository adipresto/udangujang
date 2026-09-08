# Agent notes — udangujang merge

Ini project baru (belum ada kode) yang akan menyatukan dua service lama jadi satu React SSR app. Sebelum mulai ticket manapun:

1. Baca `CLAUDE.md` untuk konteks & aturan.
2. Baca `docs/migration-context.md` — pemetaan skema Firestore lengkap dari kedua source lama (field-by-field, sudah diverifikasi langsung dari kode, bukan tebakan).
3. Baca `docs/scenario.md` — skenario asli dari pemilik produk (bahasa Indonesia, verbatim).
4. Tiket kerja ada di `.scratch/udangujang-merge/issues/` — kerjakan sesuai urutan dependency (`Blocked by`), jangan lompat ke tiket yang blocker-nya belum selesai.

## Sumber kebenaran (source of truth) untuk port

- Field & logic harga: `C:\Users\KAINE\Documents\Pekerjaan\UUA\src\index.html` — cari `HARGA_CONFIG`, `syncHargaVars()`, `hargaBerharga()`.
- Field & flow promo: file yang sama, cari `applyPromo()`, `incrementPromoUsage()`.
- Skema dashboard (kastamer/pesanan/statusLog/transaksi/wilayah/ruteHarian): `C:\Users\KAINE\Documents\Development\udang-dashboard\index.html` — cari `reducer()`, `firestoreSync()`, `saveKastamer()`.
- **Jangan** asumsikan nilai default/harga/field baru — semua sudah didokumentasikan di `docs/migration-context.md`. Kalau ada gap, grep source lama dulu, jangan tebak.

## Batasan penting

- **Submit pesanan (publik maupun admin) TIDAK langsung ke Firestore dari SSR/browser.** Selalu lewat gRPC call ke DAS (mis. `CreatePesanan`). DAS satu-satunya yang punya Firestore client. Ini keputusan final dari pemilik produk (arsitektur 3-service: SSR ↔ DAS via gRPC ↔ Firestore, DAS akan tambah Postgres nanti) — jangan diubah ke direct client/SSR→Firestore write tanpa konfirmasi ulang.
- **Desain proto gRPC DAS harus Firestore-agnostic.** Jangan expose field/quirk Firestore (mis. `Timestamp` Firestore native, document reference) langsung di proto message — pakai tipe generik (`google.protobuf.Timestamp`, string ID) supaya swap ke Postgres nanti tidak breaking change buat SSR.
- Jangan hapus/ubah collection `config/harga` atau `promo_codes` shape-nya di Firestore — ini detail internal DAS, tapi tetap harus konsisten karena dashboard lama (`udang-dashboard`) mungkin masih baca struktur ini langsung kalau migrasi belum selesai penuh.
