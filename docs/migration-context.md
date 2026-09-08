# Migration context — skema Firestore lama (verified)

Semua field di bawah sudah dicek langsung dari kode kedua source lama (bukan tebakan) — lihat `erd.md` untuk sumber asalnya (ERD Artifact UUA). Dokumen ini fokus ke apa yang **berubah** untuk merge.

## Firestore project: `atminujangudang`

### Shared / tidak berubah bentuknya

- **`config/harga`** (singleton doc) — nested: `udang.{perKg,setengahKg,jasaKupasPerKg,kupasSetengahSurcharge}`, `cumi.{perKg,setengahKg}`, `kembung.{perKg,setengahKg,jasaBersihPerKg}`, `teriNasi.{pricePerPack,kgPerPack,hargaSatuKg}`, `ongkir.{normal,bogorTangerang,minKgBogorTangerang,minKgDefault}`, `updatedAt`. Beberapa harga (udang kupas ½kg, kembung ½kg, teri nasi 1kg) **non-linear** — jangan disederhanakan jadi proporsional.
- **`promo_codes`** (koleksi, doc ID = kode promo huruf kapital) — `type` (discount/free_product/free_ongkir), `value`, `active`, `expires`, `minKg`/`minKgUtuh`/`minKgKupas`/`minSubtotal` (opsional, hanya diisi kalau >0), `maxUses`, `usedCount`.

### Berubah untuk merge

- **`wilayah`** — `id`, `nama`, `kota`, `provinsi`, `createdAt`. Tidak berubah strukturnya, tapi sekarang jadi target FK dari Alamat (bukan langsung dari Kastamer, lihat di bawah).
- **`kastamer`** — dulu: `id`, `wilayahId`, `nama`, `noHp`, `alamat` (string tunggal), `lat`, `lng`, `catatan`, `mapsLink`, `createdAt`, `updatedAt`. **Unique key lama: `noHp`** (dedup lewat `getKastamer().find(k => k.noHp === noHp)`).
  → **Rencana baru**: pisahkan alamat jadi sub-collection/koleksi `alamat` sendiri (relasi 1 Kastamer : N Alamat). `kastamer` jadi profil murni: `id`, `nama`, `noHp` (unique), `catatan`, `createdAt`, `updatedAt` — tanpa `alamat`/`lat`/`lng`/`wilayahId`/`mapsLink` langsung.
  → **`alamat`** (baru): `id`, `kastamerId` (FK → Kastamer), `wilayahId` (FK → Wilayah), `label` (mis. "Rumah", "Kantor" — opsional), `alamat` (string), `lat`, `lng`, `mapsLink`, `isDefault` (bool), `createdAt`, `updatedAt`.
  → **`pesanan`** perlu tambah `alamatId` (FK → Alamat) di samping `kastamerId`, supaya tiap pesanan tahu dikirim ke alamat yang mana.
- **`pesanan`** — dulu diisi manual admin lewat modal dashboard (`saveKastamer()` di `udang-dashboard/index.html`, walau namanya "Kastamer" fungsinya juga bikin pesanan). Field: `id`, `kastamerId`, `alamatId` (baru), `items[]` (`{nama,qty,satuan,harga,subtotal}`), `deskripsi`, `ongkir`, `catatanPesanan`, `metodePembayaran`, `detailPembayaran`, `metodePengiriman`, `totalHarga` (string ter-format Rupiah — pertimbangkan ganti ke number murni saat migrasi supaya bisa dihitung/di-sum, tapi field lama bertipe string), `statusPengiriman` (`belum_antar`/`sudah_antar`), `statusPembayaran` (`belum_bayar`/`sudah_bayar`), `tanggalAntar`, `tanggalKonfirmasiAntar`, `tanggalBayar`, `createdAt`, `updatedAt`.
  → **Rencana baru**: jalur create pesanan ada DUA sumber — (a) form publik oleh kastamer (baru, langsung ke Firestore), (b) form admin di dashboard (sekarang pakai komponen form yang SAMA dengan (a), bukan modal lama). Field `items[]` harus bisa diisi dari struktur pesanan form publik (`beratUtuh`, `beratKupas`, `beratCumi`, dst di UUA) — perlu fungsi mapping form-pemesanan → `items[]`.
- **`statusLog`**, **`transaksi`**, **`ruteHarian`** — tidak berubah strukturnya, tetap dipertahankan penuh.

### Form publik (UUA) — field yang perlu di-port ke komponen shared

Dari `src/index.html` (UUA), form pemesanan saat ini TIDAK menulis ke Firestore sama sekali — field-nya:
`nama`, `alamat` (+ opsional link Maps), `tujuanUntuk` (opsional, kalau dikirim ke orang lain), `tglKirim`, `beratUtuh`, `beratKupas`, `beratCumi`, `beratKembung`/`tongkol`/`nila`, `metodeBayar`, `kodePromo` (opsional, FK → `promo_codes.kode`).

Field-field ini perlu dipetakan ke `items[]` + `alamat` + `kastamer` saat submit ke Firestore — bukan cuma dirakit jadi teks WhatsApp seperti sekarang.

## Ringkasan perubahan skema (untuk ticket "Prefactor data model")

| Entity lama | Perubahan |
|---|---|
| `kastamer.alamat/lat/lng/wilayahId/mapsLink` | Dipindah ke koleksi baru `alamat` (1 Kastamer : N Alamat) |
| `kastamer` unique key | Tetap `noHp`, tapi sekarang boleh punya banyak `alamat` |
| `pesanan` | Tambah field `alamatId`; tambah jalur create dari form publik (bukan cuma admin) |
| `config/harga`, `promo_codes` | Tidak berubah — dipakai bersama form publik & dashboard |
| `wilayah`, `statusLog`, `transaksi`, `ruteHarian` | Tidak berubah |
