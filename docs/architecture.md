# Arsitektur

```
┌─────────────────────┐        gRPC        ┌──────────────────────┐        ┌────────────┐
│   SSR App (React)   │ ──────────────────▶ │  DAS (Go, gRPC)       │ ─────▶ │ Firestore  │
│  - Form publik       │ ◀────────────────── │  - Satu-satunya yang  │        │ (sekarang) │
│  - Dashboard admin   │                      │    akses DB langsung  │        └────────────┘
└─────────────────────┘                      │  - Repository layer   │        ┌────────────┐
                                              │    agnostik-storage   │ ─────▶ │ PostgreSQL │
                                              └──────────────────────┘        │ (rencana)  │
                                                                               └────────────┘
```

## SSR App

- React, Server-Side Rendered. Dua permukaan: form pemesanan publik (port dari UUA) dan dashboard admin (port dari udang-dashboard).
- Firebase Auth client untuk login admin.
- Tidak punya Firestore client sama sekali — semua data lewat gRPC client ke DAS.

## DAS (Data Access Service)

- Go, gRPC server. Backing store saat ini: Firestore (project `atminujangudang`).
- **Repository pattern** — interface Go per entity (mis. `PesananRepository`, `KastamerRepository`) dengan implementasi `firestore/` sekarang, `postgres/` menyusul. RPC handler bicara ke interface, bukan ke Firestore SDK langsung, supaya swap storage tidak mengubah kontrak gRPC.
- Proto message **tidak boleh** membocorkan tipe spesifik Firestore (document reference, native Timestamp) — pakai `google.protobuf.Timestamp`, string ID biasa, dst.

## Kenapa bukan SSR→Firestore langsung?

Keputusan pemilik produk: submit form (publik & admin) harus lewat data-access layer terpusat (DAS), bukan client-side/SSR write langsung ke Firestore. Alasannya validasi & proteksi abuse terpusat di satu tempat, dan menyiapkan jalan migrasi ke Postgres tanpa mengubah SSR.

## Yang belum diputuskan — perlu keputusan sebelum/-selama ticket terkait

- Auth flow persis: apakah DAS ikut verifikasi Firebase ID token per-RPC (mis. lewat gRPC interceptor), atau SSR yang verifikasi lalu DAS percaya penuh ke SSR (trusted network)?
- Skema proto: satu file `.proto` per domain (pesanan.proto, kastamer.proto, harga.proto, dst) atau satu file besar? (rekomendasi: per domain, lebih gampang di-review per ticket)
- Struktur repo: monorepo (SSR + DAS + proto dalam satu repo `microservice_udangujang`) atau multi-repo? Dokumen ini mengasumsikan **monorepo** karena kedua service dibangun bersamaan dan proto perlu di-share.
