// Shared display helpers for the admin pesanan pages. Ports comboStatus(),
// statusLabel() and the Google Maps link fallback from
// reference/udang-dashboard/index.html (~lines 2506-2560, 3867-3920).
// Server-safe (no client hooks) — imported by server components.

export interface ComboInput {
  statusPengiriman: string;
  statusPembayaran: string;
}

export interface ComboInfo {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

export function comboStatus(p: ComboInput): ComboInfo {
  const antar = p.statusPengiriman === "sudah_antar";
  const bayar = p.statusPembayaran === "sudah_bayar";
  if (antar && bayar)
    return { label: "✅ Lunas", bg: "#D1FAE5", fg: "#059669", dot: "#10B981" };
  if (antar && !bayar)
    return {
      label: "🚚 Sudah Antar · Belum Bayar",
      bg: "#FEF3C7",
      fg: "#D97706",
      dot: "#F59E0B",
    };
  if (!antar && bayar)
    return {
      label: "💰 DP · Belum Antar",
      bg: "#EDE9FE",
      fg: "#7C3AED",
      dot: "#7C3AED",
    };
  return {
    label: "⏳ Belum Antar",
    bg: "#FEE2E2",
    fg: "#DC2626",
    dot: "#EF4444",
  };
}

export function statusLabel(field: "pengiriman" | "pembayaran", value: string): string {
  if (field === "pengiriman") return value === "sudah_antar" ? "Sudah Antar" : "Belum Antar";
  return value === "sudah_bayar" ? "Sudah Bayar" : "Belum Bayar";
}

export function formatTanggal(d: Date | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatWaktu(d: Date | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// mapsUrl ports openDetail()'s Google Maps fallback chain: stored mapsLink
// first, then lat,lng, then an address search.
export function mapsUrl(
  mapsLink: string,
  lat: number,
  lng: number,
  fallback: string,
): string | null {
  if (mapsLink) return mapsLink;
  if (lat || lng) return `https://maps.google.com/?q=${lat},${lng}`;
  if (fallback) return `https://maps.google.com/?q=${encodeURIComponent(fallback)}`;
  return null;
}

export function toIntlPhone(hp: string): string {
  const digits = (hp || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? "62" + digits.slice(1) : digits;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Default filter window: 7 hari terakhir (inklusif).
export function defaultDari(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return toYMD(d);
}

export function defaultSampai(): string {
  return toYMD(new Date());
}
