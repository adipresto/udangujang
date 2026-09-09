// The 16 config/harga paths, verbatim from the pre-merge dashboard's
// HARGA_FIELDS (reference/udang-dashboard/index.html ~lines 5083-5089).
// Kept OUT of actions.ts: a "use server" file may only export async
// functions, so shared constants live here instead.
export const HARGA_FIELDS = [
  "udang.perKg",
  "udang.setengahKg",
  "udang.jasaKupasPerKg",
  "udang.kupasSetengahSurcharge",
  "cumi.perKg",
  "cumi.setengahKg",
  "kembung.perKg",
  "kembung.setengahKg",
  "kembung.jasaBersihPerKg",
  "teriNasi.pricePerPack",
  "teriNasi.kgPerPack",
  "teriNasi.hargaSatuKg",
  "ongkir.normal",
  "ongkir.bogorTangerang",
  "ongkir.minKgBogorTangerang",
  "ongkir.minKgDefault",
] as const;
