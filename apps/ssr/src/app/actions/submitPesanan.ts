"use server";

import { createPesanan, validatePromo } from "@/lib/das-client";
import {
  computeOrder,
  DEFAULT_HARGA,
  fmt,
  parseBeratVal,
  roundHalf,
  roundQuarter,
  type HargaConfig,
  type PromoConstraints,
} from "@/lib/pricing";
import type { CreatePesananRequest } from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";

// SubmitPesananInput mirrors the public form state (OrderForm) 1:1 —
// weights as raw strings (comma decimals allowed, parsed here via
// parseBeratVal like the reference), identity/address/payment fields,
// optional promo code, and an optional maps pin. Server-side only.
export interface SubmitPesananInput {
  kgUtuh: string;
  kgKupas: string;
  kgCumi: string;
  kgKembung: string;
  kgTeriNasi: string;
  bersihKembung: boolean;
  jenisKupas: string;
  nama: string;
  penerima: string;
  alamat: string;
  mapsLink: string;
  pinLat: number | null;
  pinLng: number | null;
  bayar: string;
  kodePromo: string;
  catatan: string;
  tglKirim: string;
  harga?: HargaConfig;
}

export type SubmitPesananResult =
  | { ok: true; pesananId: string }
  | { ok: false; error: string };

export interface CheckPromoInput {
  kodePromo: string;
  kgUtuh: number;
  kgKupas: number;
  kgExtra: number;
  subtotal: number;
}

export type CheckPromoResult =
  | { ok: true; promo: PromoConstraints }
  | { ok: false; error: string };

// checkPromo is the client-callable twin of the reference's applyPromo()
// pre-checks (active/expired via DAS ValidatePromo, eligibility via
// checkPromoEligibility). Server-side so the gRPC client never ships to
// the browser; the form auto-drops stale promos locally without calling
// this again (mirrors updateNota's auto-drop).
export async function checkPromo(input: CheckPromoInput): Promise<CheckPromoResult> {
  const kode = (input.kodePromo || "").trim().toUpperCase();
  if (!kode) return { ok: false, error: "Masukkan kode promo dulu." };
  let resp;
  try {
    resp = await validatePromo({
      kodePromo: kode,
      kgUtuh: input.kgUtuh,
      kgKupas: input.kgKupas,
      kgExtra: input.kgExtra,
      subtotal: Math.round(input.subtotal),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!resp.valid) return { ok: false, error: resp.reason || "Kode promo tidak valid." };
  return {
    ok: true,
    promo: {
      kode,
      type: resp.type,
      value: resp.value,
      minKg: resp.minKg,
      maxKg: resp.maxKg,
      minKgUtuh: resp.minKgUtuh,
      minKgKupas: resp.minKgKupas,
      minSubtotal: resp.minSubtotal,
      maxUses: Number(resp.maxUses),
      usedCount: Number(resp.usedCount),
    },
  };
}

function parseKg(raw: string, round: (n: number) => number, min: number): number {
  const v = parseBeratVal(raw);
  if (isNaN(v) || v <= 0) return 0;
  const n = Math.max(0, round(v));
  if (n > 0 && n < min) return min;
  return n;
}

// digits-only E.164-ish normalization matching the DAS no_hp rule
// (9-15 digits, optional leading +). The public form has no dedicated
// no_hp field — penerima (optional recipient number) doubles as the
// kastamer phone; empty penerima falls back to a placeholder the DAS
// accepts so the order is never blocked.
function normalizeNoHp(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 9 && digits.length <= 15) return "+" + digits;
  return "+62000000000";
}

function parsePinLatLng(mapsLink: string): { lat: number; lng: number } | null {
  const m = (mapsLink || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

export async function submitPesanan(input: SubmitPesananInput): Promise<SubmitPesananResult> {
  const nama = (input.nama || "").trim();
  const alamat = (input.alamat || "").trim();
  const bayar = (input.bayar || "").trim();
  if (!nama) return { ok: false, error: "Nama wajib diisi." };
  if (!alamat) return { ok: false, error: "Alamat detail wajib diisi." };
  if (!bayar) return { ok: false, error: "Pilih metode pembayaran." };

  const harga = input.harga ?? DEFAULT_HARGA;
  const kgUtuh = parseKg(input.kgUtuh, roundHalf, 0.5);
  const kgKupas = parseKg(input.kgKupas, roundHalf, 0.5);
  const kgCumi = parseKg(input.kgCumi, roundHalf, 0.5);
  const kgKembung = parseKg(input.kgKembung, roundHalf, 0.5);
  const kgTeriNasi = parseKg(input.kgTeriNasi, roundQuarter, harga.teriNasi.kgPerPack);
  const totalKg = kgUtuh + kgKupas + kgCumi + kgKembung + kgTeriNasi;
  if (totalKg <= 0) return { ok: false, error: "Total pesanan minimal 0,5 kg." };

  const pin =
    input.pinLat !== null && input.pinLng !== null
      ? { lat: input.pinLat, lng: input.pinLng }
      : parsePinLatLng(input.mapsLink);
  const promoKode = (input.kodePromo || "").trim().toUpperCase();
  const calc = computeOrder(
    {
      kgUtuh,
      kgKupas,
      kgCumi,
      kgKembung,
      kgTeriNasi,
      bersihKembung: input.bersihKembung,
    },
    alamat,
    pin,
    harga,
    null,
  );

  const perKg = (total: number, kg: number) => (kg > 0 ? Math.round(total / kg) : 0);
  const items: CreatePesananRequest["items"] = [];
  if (kgUtuh > 0) {
    items.push({ nama: "Udang utuh", qty: kgUtuh, satuan: "kg", harga: perKg(calc.hargaUtuh, kgUtuh) });
  }
  if (kgKupas > 0) {
    const jenis = (input.jenisKupas || "Peel Tail-On").trim() || "Peel Tail-On";
    items.push({ nama: `Udang kupas (${jenis})`, qty: kgKupas, satuan: "kg", harga: perKg(calc.hargaKupas, kgKupas) });
  }
  if (kgCumi > 0) {
    items.push({ nama: "Cumi Bangka", qty: kgCumi, satuan: "kg", harga: perKg(calc.hargaCumi, kgCumi) });
  }
  if (kgKembung > 0) {
    items.push({
      nama: input.bersihKembung ? "Ikan kembung (dibersihkan)" : "Ikan kembung",
      qty: kgKembung,
      satuan: "kg",
      harga: perKg(calc.hargaKembung, kgKembung),
    });
  }
  if (kgTeriNasi > 0) {
    items.push({ nama: "Teri Nasi", qty: kgTeriNasi, satuan: "kg", harga: perKg(calc.hargaTeriNasi, kgTeriNasi) });
  }
  if (items.length === 0) return { ok: false, error: "Total pesanan minimal 0,5 kg." };

  const penerimaDigits = (input.penerima || "").replace(/\D/g, "").replace(/^0+/, "");
  const penerima = penerimaDigits ? "+62" + penerimaDigits : "";
  const catatanLines = [
    (input.catatan || "").trim(),
    penerima ? `Penerima: ${penerima}` : null,
    input.tglKirim ? `Tanggal kirim: ${input.tglKirim}` : null,
    `Total nota: ${fmt(calc.total)}`,
  ].filter((l): l is string => !!l);

  const req: CreatePesananRequest = {
    nama,
    noHp: normalizeNoHp(input.penerima),
    catatan: "",
    alamatId: "",
    label: "Rumah",
    alamat,
    lat: pin?.lat ?? 0,
    lng: pin?.lng ?? 0,
    mapsLink: (input.mapsLink || "").trim(),
    wilayahId: "",
    items,
    metodePembayaran: bayar,
    detailPembayaran: "",
    metodePengiriman: "kurir",
    kodePromo: promoKode,
    tanggalAntar: undefined,
    deskripsi: "",
    catatanPesanan: catatanLines.join("\n"),
    ongkir: Math.round(calc.ongkirFinal),
  };

  try {
    const resp = await createPesanan(req);
    if (!resp.pesananId) return { ok: false, error: "DAS tidak mengembalikan pesanan_id." };
    return { ok: true, pesananId: resp.pesananId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
