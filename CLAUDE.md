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
