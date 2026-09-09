# Logic lama (verbatim dari reference/, untuk port ke DAS UDMC-3)

Sumber: `reference/uua/index.html` (form publik) dan
`reference/udang-dashboard/index.html` (admin). Semua di bawah VERBATIM —
jangan ditebak ulang, tinggal port ke Go.

## 1. Harga non-linear (uua:2293-2294, 2170-2176)

```js
totalU = kgU===0 ? 0 : (kgU===0.5 ? HARGA_SETENGAH : HARGA_UDANG*kgU)
totalK = kgK===0 ? 0 : (kgK===0.5 ? HARGA_SETENGAH+KUPAS_SETENGAH_SURCHARGE : (HARGA_UDANG+HARGA_KUPAS)*kgK)
hargaBerharga('cumi', kg)      = kg===0.5 ? CUMI_SETENGAH : HARGA_CUMI*kg
hargaBerharga('kembung', kg)   = kg===0.5 ? KEMBUNG_SETENGAH : HARGA_KEMBUNG*kg
hargaBerharga('teri-nasi', kg) = kg===1 ? HARGA_TERI_NASI_SATU_KG : (kg/KG_TERI_NASI_PACK)*HARGA_TERI_NASI_PACK
// kembung bersih: +HARGA_KUPAS_IKAN * max(0, kgKb-0.5) bila checkbox aktif (uua:2305)
```

## 2. Ongkir per area (uua:2206-2233)

```
1. alamat mengandung keyword free (kelapa gading, sedayu pgc/city,
   harapan indah, summarecon, jgc/jakarta garden city) ATAU pin lat/lng
   masuk bounding box FREE_ONGKIR_ZONES (5 zona, uua:2190-2196)
   → { area:'free', ongkir:0, minKg:MIN_KG_DEFAULT }
2. alamat mengandung 'bogor'/'tangerang'/'tangsel'
   → { area:'bogor_tangerang', ongkir:ONGKIR_BOGOR_TANGERANG, minKg:MIN_KG_BOGOR_TANGERANG }
3. default → { area:'normal', ongkir:ONGKIR_NORMAL, minKg:MIN_KG_DEFAULT }
```

## 3. Promo (uua:2249-2268 eligibility, 3002-3085 applyPromo)

```js
checkPromoEligibility(promo, kgU, kgK, subtotal, kgExtra):
  if (promo.minKg       && totalKg < promo.minKg)       → fail 'minimal total X kg'
  if (promo.maxKg       && totalKg > promo.maxKg)       → fail 'maksimal total X kg'
  if (promo.minKgUtuh   && kgU < promo.minKgUtuh)       → fail
  if (promo.minKgKupas   && kgK < promo.minKgKupas)     → fail
  if (promo.minSubtotal && subtotal < promo.minSubtotal)→ fail
  if (promo.maxUses && usedCount >= maxUses)            → fail 'kuota habis'
  // totalKg = kgU+kgK+kgExtra; subtotal = totalU+totalK+totalC+totalKb+totalT
applyPromo: kode=UPPERCASE(trim); doc promo_codes/kode harus exists,
  active==true, now<=expires; constraint dicek vs state form saat ini.
Efek (uua:2325-2328):
  discount     → diskon = parseInt(value)
  free_shipping→ ongkirFinal = 0   // NOTE: proto Firestore pakai 'free_ongkir', bukan 'free_shipping'
  free_product → diskon = totalU+totalK+totalC+totalKb+totalT (seluruh produk gratis)
usedCount: fire-and-forget increment(1) saat submit (uua:2996-3000) —
  best-effort, tidak menahan flow.
```

## 4. saveKastamer dashboard (dashboard:3749-3852)

- nama wajib; noHp dipakai dedup: `kastamer.find(k => k.noHp===noHp)` → pakai id lama.
- wilayah: upsert by nama (case-insensitive), buat baru bila belum ada.
- items dari builder `{nama,qty,satuan,harga,subtotal}`; `subtotal=sum(subtotal)`;
  `totalNum=subtotal+ongkir`; `totalHarga = formatRupiah(totalNum)` (STRING!).
- deskripsi = items.map(`nama qty+satuan`).join(', ') bila ada items.
- pesanan baru: `{id:genId(), kastamerId, ...pesananData,
  tanggalKonfirmasiAntar: sudah_antar?now:null,
  tanggalBayar: sudah_bayar?now:null, createdAt, updatedAt}`.
- status antar/bayar diambil dari pilihan modal (bukan selalu default!) —
  untuk CreatePesanan RPC (jalur form, bukan admin): default
  belum_antar + belum_bayar, tanggal null.
- formatRupiah (dashboard:1641): cek langsung di file bila perlu format persis.

## 5. Metode pembayaran (uua:2236-2240)

REKENING = {'Transfer - Jago':'101962407482 (Bank Jago)',
  'Transfer - BCA':'5221698607 (BCA)', 'Transfer - OVO':'085888031940 (OVO)'}.
Nilai metodePembayaran bebas string dari form — JANGAN di-enum ketat.
