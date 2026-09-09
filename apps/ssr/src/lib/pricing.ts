// Verbatim port of the pricing/promo/ongkir math from reference/uua/index.html
// (HARGA_CONFIG, syncHargaVars, hargaBerharga, getAreaInfo, updateNota,
// checkPromoEligibility — lines ~2084-2406). Pure functions only, no DOM —
// see docs/migration-context.md § shared/config/harga for why the
// non-linear prices (udang kupas ½kg, kembung ½kg, teri nasi 1kg) are
// intentional and must not be "fixed" into a proportional formula.

export interface HargaConfig {
  udang: {
    perKg: number;
    setengahKg: number;
    jasaKupasPerKg: number;
    kupasSetengahSurcharge: number;
  };
  cumi: {
    perKg: number;
    setengahKg: number;
  };
  kembung: {
    perKg: number;
    setengahKg: number;
    jasaBersihPerKg: number;
  };
  teriNasi: {
    pricePerPack: number;
    kgPerPack: number;
    hargaSatuKg: number;
  };
  ongkir: {
    normal: number;
    bogorTangerang: number;
    minKgBogorTangerang: number;
    minKgDefault: number;
  };
}

// Production defaults — used instantly on page load / when GetHarga (DAS)
// is unreachable, mirroring the old client's "default hardcoded, Firestore
// value merged in later" fallback (reference/uua/index.html lines 2981-2992).
export const DEFAULT_HARGA: HargaConfig = {
  udang: {
    perKg: 98000,
    setengahKg: 52500,
    jasaKupasPerKg: 5000,
    kupasSetengahSurcharge: 3000,
  },
  cumi: {
    perKg: 102000,
    setengahKg: 53000,
  },
  kembung: {
    perKg: 58000,
    setengahKg: 30000,
    jasaBersihPerKg: 5000,
  },
  teriNasi: {
    pricePerPack: 20000,
    kgPerPack: 0.25,
    hargaSatuKg: 75000,
  },
  ongkir: {
    normal: 10000,
    bogorTangerang: 15000,
    minKgBogorTangerang: 2,
    minKgDefault: 0.5,
  },
};

export function fmt(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export function parseBeratVal(s: string): number {
  return parseFloat(String(s).replace(",", "."));
}

export function roundHalf(n: number): number {
  return Math.floor(n * 2) / 2;
}

export function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

// hargaBerharga ports the shared pricing rule for cumi/kembung/teri-nasi:
// exactly 0.5kg (or 1kg for teri nasi) uses a non-linear flat price, any
// other weight is linear per-kg (reference lines 2170-2176).
export function hargaBerharga(
  produk: "cumi" | "kembung" | "teri-nasi",
  kg: number,
  harga: HargaConfig,
): number {
  if (kg <= 0) return 0;
  if (produk === "cumi") {
    return kg === 0.5 ? harga.cumi.setengahKg : harga.cumi.perKg * kg;
  }
  if (produk === "kembung") {
    return kg === 0.5 ? harga.kembung.setengahKg : harga.kembung.perKg * kg;
  }
  // teri-nasi
  return kg === 1
    ? harga.teriNasi.hargaSatuKg
    : (kg / harga.teriNasi.kgPerPack) * harga.teriNasi.pricePerPack;
}

// hargaUtuh/hargaKupas port the udang-specific non-linear ½kg pricing
// (reference lines 2293-2294, 2656-2657) — kupas adds a flat surcharge at
// ½kg instead of a proportional jasaKupasPerKg.
export function hargaUtuh(kgUtuh: number, harga: HargaConfig): number {
  if (kgUtuh === 0) return 0;
  return kgUtuh === 0.5 ? harga.udang.setengahKg : harga.udang.perKg * kgUtuh;
}

export function hargaKupas(kgKupas: number, harga: HargaConfig): number {
  if (kgKupas === 0) return 0;
  return kgKupas === 0.5
    ? harga.udang.setengahKg + harga.udang.kupasSetengahSurcharge
    : (harga.udang.perKg + harga.udang.jasaKupasPerKg) * kgKupas;
}

// hargaKembungTotal folds in the "bersihkan ikan" add-on: free for the
// first ½kg, +jasaBersihPerKg/kg beyond that (reference line 2305).
export function hargaKembungTotal(
  kgKembung: number,
  bersih: boolean,
  harga: HargaConfig,
): number {
  const base = hargaBerharga("kembung", kgKembung, harga);
  const surcharge = bersih ? harga.kembung.jasaBersihPerKg * Math.max(0, kgKembung - 0.5) : 0;
  return base + surcharge;
}

// ── Free ongkir: keyword & geofencing (reference lines 2180-2199) ──────
export const FREE_ONGKIR_KEYWORDS = [
  "kelapa gading",
  "kelapagading",
  "sedayu pgc",
  "sedayu city",
  "harapan indah",
  "summarecon bekasi",
  "summarecon",
  "jgc",
  "jakarta garden city",
];

export interface FreeOngkirZone {
  nama: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export const FREE_ONGKIR_ZONES: FreeOngkirZone[] = [
  { nama: "Kelapa Gading", latMin: -6.18, latMax: -6.13, lngMin: 106.88, lngMax: 106.94 },
  { nama: "Sedayu PGC", latMin: -6.14, latMax: -6.09, lngMin: 107.0, lngMax: 107.05 },
  { nama: "Harapan Indah", latMin: -6.23, latMax: -6.17, lngMin: 106.99, lngMax: 107.06 },
  { nama: "Summarecon Bekasi", latMin: -6.26, latMax: -6.2, lngMin: 106.985, lngMax: 107.04 },
  { nama: "JGC", latMin: -6.185, latMax: -6.145, lngMin: 106.945, lngMax: 106.995 },
];

export const BOGOR_TANGERANG_KEYWORDS = ["bogor", "tangerang", "tangsel"];

export type Area = "free" | "bogor_tangerang" | "normal";

export interface AreaInfo {
  area: Area;
  ongkir: number;
  minKg: number;
}

// getAreaInfo ports the reference's area/ongkir resolution verbatim
// (lines 2206-2230): free-ongkir keyword match, then geofenced pin match,
// then Bogor/Tangerang keyword match, else normal ongkir.
export function getAreaInfo(
  alamat: string,
  pin: { lat: number; lng: number } | null,
  harga: HargaConfig,
): AreaInfo {
  const lower = (alamat || "").toLowerCase();

  for (const kw of FREE_ONGKIR_KEYWORDS) {
    if (lower.indexOf(kw) !== -1) {
      return { area: "free", ongkir: 0, minKg: harga.ongkir.minKgDefault };
    }
  }

  if (pin) {
    for (const zone of FREE_ONGKIR_ZONES) {
      if (
        pin.lat >= zone.latMin &&
        pin.lat <= zone.latMax &&
        pin.lng >= zone.lngMin &&
        pin.lng <= zone.lngMax
      ) {
        return { area: "free", ongkir: 0, minKg: harga.ongkir.minKgDefault };
      }
    }
  }

  for (const kw of BOGOR_TANGERANG_KEYWORDS) {
    if (lower.indexOf(kw) !== -1) {
      return {
        area: "bogor_tangerang",
        ongkir: harga.ongkir.bogorTangerang,
        minKg: harga.ongkir.minKgBogorTangerang,
      };
    }
  }

  return { area: "normal", ongkir: harga.ongkir.normal, minKg: harga.ongkir.minKgDefault };
}

// ── Rekening (reference lines 2236-2243) ───────────────────────────────
export const REKENING: Record<string, string> = {
  "Transfer - Jago": "101962407482 (Bank Jago)",
  "Transfer - BCA": "5221698607 (BCA)",
  "Transfer - OVO": "085888031940 (OVO)",
};

export function rekeningInfo(bayar: string): string {
  return REKENING[bayar] || "";
}

// ── Promo ───────────────────────────────────────────────────────────────
// The pre-merge promo_codes doc's "free ongkir" type is literally stored as
// "free_shipping" (verified: reference/udang-dashboard/index.html's promo
// editor <option value="free_shipping">) even though DAS's domain package
// names the equivalent constant PromoTypeFreeOngkir = "free_ongkir" — that
// mismatch predates this ticket. Comparisons here match the real stored
// string so behavior matches the pre-merge form exactly.
export const PROMO_TYPE_DISCOUNT = "discount";
export const PROMO_TYPE_FREE_PRODUCT = "free_product";
export const PROMO_TYPE_FREE_SHIPPING = "free_shipping";

export interface PromoConstraints {
  kode: string;
  type: string;
  value: number;
  minKg: number;
  maxKg: number;
  minKgUtuh: number;
  minKgKupas: number;
  minSubtotal: number;
  maxUses: number;
  usedCount: number;
}

export interface PromoEligibility {
  ok: boolean;
  reason?: string;
}

// checkPromoEligibility ports reference lines 2249-2268 verbatim — used both
// right after ValidatePromo returns, and again locally whenever weights
// change, so an already-applied promo that no longer qualifies gets
// auto-dropped without another RPC round trip (mirrors updateNota's
// auto-drop at lines 2309-2321).
export function checkPromoEligibility(
  promo: PromoConstraints | null,
  kgU: number,
  kgK: number,
  subtotal: number,
  kgExtra: number,
): PromoEligibility {
  if (!promo) return { ok: true };
  const totalKg = kgU + kgK + (kgExtra || 0);
  if (promo.minKg && totalKg < promo.minKg) {
    return { ok: false, reason: `minimal total ${promo.minKg} kg (sekarang ${totalKg} kg).` };
  }
  if (promo.maxKg && totalKg > promo.maxKg) {
    return { ok: false, reason: `maksimal total ${promo.maxKg} kg (sekarang ${totalKg} kg).` };
  }
  if (promo.minKgUtuh && kgU < promo.minKgUtuh) {
    return { ok: false, reason: `minimal ${promo.minKgUtuh} kg udang utuh (sekarang ${kgU} kg).` };
  }
  if (promo.minKgKupas && kgK < promo.minKgKupas) {
    return { ok: false, reason: `minimal ${promo.minKgKupas} kg udang kupas (sekarang ${kgK} kg).` };
  }
  if (promo.minSubtotal && subtotal < promo.minSubtotal) {
    return { ok: false, reason: `minimal subtotal Rp${promo.minSubtotal.toLocaleString("id-ID")}.` };
  }
  if (promo.maxUses && (promo.usedCount || 0) >= promo.maxUses) {
    return { ok: false, reason: "kuota promo sudah habis." };
  }
  return { ok: true };
}

// ── Full order calculation (reference updateNota/submit math, lines
// 2286-2406 and 2656-2669 — identical formula, ported once and shared) ──
export interface BeratInput {
  kgUtuh: number;
  kgKupas: number;
  kgCumi: number;
  kgKembung: number;
  kgTeriNasi: number;
  bersihKembung: boolean;
}

export interface OrderCalculation {
  hargaUtuh: number;
  hargaKupas: number;
  hargaCumi: number;
  hargaKembung: number;
  hargaTeriNasi: number;
  subtotal: number;
  ongkir: number;
  ongkirFinal: number;
  diskon: number;
  total: number;
  totalKg: number;
  areaInfo: AreaInfo;
}

export function computeOrder(
  berat: BeratInput,
  alamat: string,
  pin: { lat: number; lng: number } | null,
  harga: HargaConfig,
  promoAktif: PromoConstraints | null,
): OrderCalculation {
  const hU = hargaUtuh(berat.kgUtuh, harga);
  const hK = hargaKupas(berat.kgKupas, harga);
  const hC = hargaBerharga("cumi", berat.kgCumi, harga);
  const hKb = hargaKembungTotal(berat.kgKembung, berat.bersihKembung, harga);
  const hT = hargaBerharga("teri-nasi", berat.kgTeriNasi, harga);
  const subtotal = hU + hK + hC + hKb + hT;

  const areaInfo = getAreaInfo(alamat, pin, harga);
  const ongkir = areaInfo.ongkir;

  let diskon = 0;
  let ongkirFinal = ongkir;
  if (promoAktif) {
    if (promoAktif.type === PROMO_TYPE_DISCOUNT) {
      diskon = Math.trunc(promoAktif.value) || 0;
    } else if (promoAktif.type === PROMO_TYPE_FREE_SHIPPING) {
      ongkirFinal = 0;
    } else if (promoAktif.type === PROMO_TYPE_FREE_PRODUCT) {
      diskon = subtotal;
    }
  }

  const total = Math.max(0, subtotal + ongkirFinal - diskon);
  const totalKg = berat.kgUtuh + berat.kgKupas + berat.kgCumi + berat.kgKembung + berat.kgTeriNasi;

  return {
    hargaUtuh: hU,
    hargaKupas: hK,
    hargaCumi: hC,
    hargaKembung: hKb,
    hargaTeriNasi: hT,
    subtotal,
    ongkir,
    ongkirFinal,
    diskon,
    total,
    totalKg,
    areaInfo,
  };
}

// isStep1Done ports the min-weight gate (reference lines 1640-1645):
// total across every weighed product must be >= 0.5kg AND >= the area's
// minimum (e.g. 2kg for Bogor/Tangerang).
export function isBeratMinMet(berat: BeratInput, alamat: string, pin: { lat: number; lng: number } | null, harga: HargaConfig): boolean {
  const total = berat.kgUtuh + berat.kgKupas + berat.kgCumi + berat.kgKembung + berat.kgTeriNasi;
  if (total < 0.5) return false;
  return total >= getAreaInfo(alamat, pin, harga).minKg;
}
