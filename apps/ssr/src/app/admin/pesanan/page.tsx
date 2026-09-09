import Link from "next/link";
import PesananFilter from "./PesananFilter";
import { getPesananDetail, listPesanan } from "@/lib/das-client";
import type { Pesanan } from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";
import { comboStatus, defaultDari, defaultSampai, formatTanggal, mapsUrl } from "./status";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function parseDayStart(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function parseDayEnd(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
}

function itemsSummary(p: Pesanan): string {
  if (p.deskripsi) return p.deskripsi;
  if (!p.items?.length) return "—";
  return p.items.map((i) => `${i.nama} ${i.qty}${i.satuan || "kg"}`).join(", ");
}

interface PinRow {
  id: string;
  maps: string | null;
  hasCoord: boolean;
}

// Pesanan list — ports the dashboard's DB tab + map list (reference
// ~lines 700-800, 2604-2680): filter tanggal (default 7 hari terakhir) +
// filter status antar/bayar, summary chips, rows grouped/colored by the
// comboStatus() badge, and a pin list with Google Maps links.
//
// Map note: ListPesanan returns Pesanan rows only (no lat/lng — coordinates
// live on Alamat, joined only by GetPesananDetail). No leaflet/react-leaflet
// in package.json and no Google Maps API key, so the "peta" is a pin list
// with per-pin maps links (https://maps.google.com/?q=lat,lng), same as the
// reference's detail-gmaps fallback. Detail lookups run in parallel and are
// best-effort — a failed lookup keeps the row but drops its pin.
export default async function PesananListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dariStr = first(sp.dari) || defaultDari();
  const sampaiStr = first(sp.sampai) || defaultSampai();
  const antar = first(sp.antar);
  const bayar = first(sp.bayar);

  let rows: Pesanan[] = [];
  let loadError = "";

  try {
    const resp = await listPesanan({
      tanggalDari: parseDayStart(dariStr),
      tanggalSampai: parseDayEnd(sampaiStr),
      statusPengiriman: antar,
      statusPembayaran: bayar,
    });
    rows = resp.pesanan ?? [];
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const belumAntar = rows.filter((p) => p.statusPengiriman !== "sudah_antar").length;
  const sudahAntar = rows.length - belumAntar;
  const belumBayar = rows.filter((p) => p.statusPembayaran !== "sudah_bayar").length;
  const sudahBayar = rows.length - belumBayar;

  // Per-pin coordinates need the joined Alamat — fetch details in parallel.
  // Best-effort: rows stay listed even when their detail lookup fails.
  const pins: PinRow[] = await Promise.all(
    rows.map(async (p): Promise<PinRow> => {
      try {
        const d = await getPesananDetail(p.id);
        const a = d.alamat;
        const lat = a?.lat ?? 0;
        const lng = a?.lng ?? 0;
        return {
          id: p.id,
          maps: mapsUrl(a?.mapsLink ?? "", lat, lng, a?.alamat ?? ""),
          hasCoord: lat !== 0 || lng !== 0,
        };
      } catch {
        return { id: p.id, maps: null, hasCoord: false };
      }
    }),
  );
  const pinById = new Map(pins.map((pin) => [pin.id, pin]));
  const withCoord = pins.filter((pin) => pin.hasCoord).length;

  const chips: { label: string; count: number; bg: string; fg: string }[] = [
    { label: "Total", count: rows.length, bg: "#0F172A", fg: "#fff" },
    { label: "Belum Antar", count: belumAntar, bg: "#FEE2E2", fg: "#DC2626" },
    { label: "Sudah Antar", count: sudahAntar, bg: "#FEF3C7", fg: "#D97706" },
    { label: "Belum Bayar", count: belumBayar, bg: "#FEE2E2", fg: "#DC2626" },
    { label: "Sudah Bayar", count: sudahBayar, bg: "#D1FAE5", fg: "#059669" },
  ];

  return (
    <section>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
        Pesanan
      </h1>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Daftar pesanan per tanggal antar. Klik baris untuk detail + ubah status.
      </p>

      <PesananFilter initial={{ dari: dariStr, sampai: sampaiStr, antar, bayar }} />

      {loadError && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          Gagal memuat daftar pesanan: {loadError}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {chips.map((c) => (
          <div
            key={c.label}
            style={{
              background: c.bg,
              color: c.fg,
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {c.count} · {c.label}
          </div>
        ))}
      </div>

      {!loadError && rows.length === 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: "32px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "#64748B",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 600 }}>Tidak ada pesanan</div>
          <div>Ubah filter tanggal/status di atas.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((p) => {
          const info = comboStatus(p);
          const pin = pinById.get(p.id);
          return (
            <Link
              key={p.id}
              href={`/admin/pesanan/${p.id}`}
              style={{
                display: "block",
                background: "#fff",
                border: "1px solid #E2E8F0",
                borderLeft: `4px solid ${info.dot}`,
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    background: info.bg,
                    color: info.fg,
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {info.label}
                </span>
                <span style={{ fontSize: 12, color: "#64748B", marginLeft: "auto" }}>
                  {formatTanggal(p.tanggalAntar)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#334155",
                  marginTop: 6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                🛒 {itemsSummary(p)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748B",
                  marginTop: 4,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700, color: "#0F172A" }}>{p.totalHarga || "—"}</span>
                <span>·</span>
                <span>{p.metodePembayaran || "—"}</span>
                {pin?.maps && (
                  <>
                    <span>·</span>
                    <span
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "inline-flex" }}
                    >
                      <a
                        href={pin.maps}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "#2563EB", textDecoration: "none" }}
                      >
                        {pin.hasCoord ? "📍 Peta" : "🗺️ Maps"}
                      </a>
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {rows.length > 0 && (
        <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 12 }}>
          📍 {withCoord} dari {rows.length} pesanan punya titik koordinat.
        </p>
      )}
    </section>
  );
}
