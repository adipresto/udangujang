// Verbatim port of the WhatsApp message builder from reference/uua/index.html
// (submit handler, lines 2671-2707). WA_NUMBER is read as-is from the
// reference file — do not change it without re-checking the source.
import { fmt, rekeningInfo, type OrderCalculation } from "./pricing";

export const WA_NUMBER = "6285765391558";

export interface WaMessageInput {
  nama: string;
  penerima: string; // already normalized to "+62..." or "" — see normalizePenerima
  alamat: string;
  mapsLink: string;
  kgUtuh: number;
  kgKupas: number;
  kgCumi: number;
  kgKembung: number;
  kgTeriNasi: number;
  bersihKembung: boolean;
  jenisKupas: string;
  catatan: string;
  tglKirimFormatted: string; // "" falls back to "Besok (H+1)" — see formatTanggalKirim
  bayar: string;
  promoKode: string | null;
  calc: OrderCalculation;
}

// normalizePenerima ports the digit-stripping + leading-zero-stripping +
// "+62" prefix logic from the submit handler (reference line 2637-2638).
export function normalizePenerima(rawPenerima: string): string {
  const digits = rawPenerima.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? "+62" + digits : "";
}

// formatTanggalKirim ports reference lines 2766-2773.
export function formatTanggalKirim(val: string): string {
  if (!val) return "";
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const d = new Date(val + "T00:00:00");
  if (isNaN(d.getTime())) return val;
  return `${hari[d.getDay()]}, ${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

// buildWaMessage ports the submit handler's message assembly verbatim
// (reference lines 2671-2695) — same line order, same labels/spacing,
// same null-filtering.
export function buildWaMessage(input: WaMessageInput): string {
  const { calc } = input;
  const promoFreeShippingOrDiscount = input.promoKode
    ? `Promo (${input.promoKode}): -${fmt(calc.diskon || calc.ongkir)}`
    : null;

  const lines: (string | null)[] = [
    "*Form Pesanan Udang Segar*",
    "",
    "Nama       : " + input.nama,
    input.penerima ? "Penerima   : " + input.penerima : null,
    "Alamat     : " + input.alamat,
    input.mapsLink ? "Pin Lokasi : " + input.mapsLink : null,
    "",
    input.kgUtuh > 0 ? "Udang utuh : " + input.kgUtuh + " kg — " + fmt(calc.hargaUtuh) : null,
    input.kgKupas > 0
      ? "Udang kupas: " + input.kgKupas + " kg (" + input.jenisKupas + ") — " + fmt(calc.hargaKupas)
      : null,
    input.kgCumi > 0 ? "Cumi       : " + input.kgCumi + " kg — " + fmt(calc.hargaCumi) : null,
    input.kgKembung > 0
      ? "Ikan kembung: " + input.kgKembung + " kg" + (input.bersihKembung ? " (dibersihkan)" : "") + " — " + fmt(calc.hargaKembung)
      : null,
    input.kgTeriNasi > 0 ? "Teri Nasi  : " + input.kgTeriNasi + " kg — " + fmt(calc.hargaTeriNasi) : null,
    input.catatan ? "Catatan    : " + input.catatan : null,
    input.tglKirimFormatted ? "Tanggal kirim: " + input.tglKirimFormatted : "Tanggal kirim: Besok (H+1)",
    "Pesanan akan dikirim H+1 atau lebih",
    "",
    calc.ongkirFinal === 0 ? "Ongkir     : GRATIS ✅" : "Ongkir     : +" + fmt(calc.ongkir),
    promoFreeShippingOrDiscount,
    "*Total     : " + fmt(calc.total) + "*",
    "",
    "Pembayaran : " + input.bayar,
    rekeningInfo(input.bayar) ? "Rekening   : " + rekeningInfo(input.bayar) : null,
  ];

  return lines.filter((l): l is string => l !== null).join("\n");
}

export function buildWaUrl(message: string): string {
  return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(message);
}
