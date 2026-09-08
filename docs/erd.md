# ERD — sistem lama (sebelum merge)

Diagram visual lengkap (dua service terpisah, sebelum merge ini): https://claude.ai/code/artifact/92a809cb-fb0e-4ce5-a4a1-f1267aededd9

Ringkasan tekstual ada di `migration-context.md` (fokus ke apa yang berubah). Dokumen ini cuma index cepat ke semua entity yang sudah diverifikasi dari kode:

**Form UUA (`src/index.html`)**
- `FormPesanan` — ephemeral, tidak ditulis ke DB sama sekali sebelum merge ini.

**Firestore — shared config**
- `config/harga` (singleton)
- `promo_codes` (koleksi)

**Firestore — dashboard admin (`udang-dashboard/index.html`)**
- `wilayah`
- `kastamer`
- `pesanan`
- `statusLog`
- `transaksi`
- `ruteHarian`

Detail field-by-field tiap entity ada di artifact di atas (bisa dibuka langsung) dan di `migration-context.md` untuk bagian yang relevan dengan merge ini.
