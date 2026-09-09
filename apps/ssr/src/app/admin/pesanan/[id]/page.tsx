import Link from "next/link";
import { notFound } from "next/navigation";
import StatusToggle from "./StatusToggle";
import { getPesananDetail } from "@/lib/das-client";
import {
  comboStatus,
  formatTanggal,
  formatWaktu,
  mapsUrl,
  statusLabel,
  toIntlPhone,
} from "../status";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
};

const lblStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94A3B8",
  width: 110,
  flexShrink: 0,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  fontSize: 13,
  color: "#334155",
  padding: "4px 0",
};

// Pesanan detail — ports openDetail() + renderItemsHtml() + the status-log
// trail (reference ~lines 1732-1750, 3867-3920, LOG_STATUS): kastamer,
// alamat (+link maps), items, catatan, total, StatusLog (riwayat), tombol
// toggle antar + bayar (confirm dulu, via server actions).
export default async function PesananDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail = null;
  let loadError = "";
  try {
    detail = await getPesananDetail(id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (!loadError && !detail?.pesanan) {
    notFound();
  }

  if (loadError || !detail?.pesanan) {
    return (
      <section>
        <Link
          href="/admin/pesanan"
          style={{ fontSize: 13, color: "#2563EB", textDecoration: "none" }}
        >
          ← Kembali ke daftar
        </Link>
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          Gagal memuat detail pesanan: {loadError || "tidak ditemukan"}
        </p>
      </section>
    );
  }

  const p = detail.pesanan;
  const k = detail.kastamer;
  const a = detail.alamat;
  const logs = detail.statusLog ?? [];
  const info = comboStatus(p);

  const items = p.items ?? [];
  const itemsSubtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const maps = mapsUrl(a?.mapsLink ?? "", a?.lat ?? 0, a?.lng ?? 0, a?.alamat ?? "");
  const waHref = k?.noHp ? `https://wa.me/${toIntlPhone(k.noHp)}` : null;
  const catatan = [p.catatanPesanan, k?.catatan].filter(Boolean).join(" · ");

  return (
    <section>
      <Link
        href="/admin/pesanan"
        style={{ fontSize: 13, color: "#2563EB", textDecoration: "none" }}
      >
        ← Kembali ke daftar
      </Link>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          margin: "8px 0 12px",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          {k?.nama || "—"}
        </h1>
        <span
          style={{
            background: info.bg,
            color: info.fg,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {info.label}
        </span>
      </div>

      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={lblStyle}>No. HP</span>
          <span>{k?.noHp || "—"}</span>
        </div>
        <div style={rowStyle}>
          <span style={lblStyle}>Tgl Antar</span>
          <span>{formatTanggal(p.tanggalAntar)}</span>
        </div>
        <div style={rowStyle}>
          <span style={lblStyle}>Alamat</span>
          <span>
            {a?.label ? `[${a.label}] ` : ""}
            {a?.alamat || "—"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {maps && (
            <a
              href={maps}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: "#2563EB", textDecoration: "none" }}
            >
              🗺️ Google Maps
            </a>
          )}
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: "#16A34A", textDecoration: "none" }}
            >
              💬 WhatsApp
            </a>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ ...lblStyle, marginBottom: 6 }}>PESANAN</div>
        {items.length === 0 && (
          <div style={{ fontSize: 13, color: "#334155" }}>{p.deskripsi || "—"}</div>
        )}
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 13,
              color: "#334155",
              padding: "3px 0",
            }}
          >
            <span>
              {it.nama} {it.qty}
              {it.satuan || "kg"}
            </span>
            <span>
              Rp{(it.subtotal || 0).toLocaleString("id-ID")}
            </span>
          </div>
        ))}
        {p.ongkir > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "#64748B",
              padding: "3px 0",
            }}
          >
            <span>Ongkir</span>
            <span>+Rp{Number(p.ongkir).toLocaleString("id-ID")}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 700,
            color: "#0F172A",
            borderTop: "1px solid #F1F5F9",
            marginTop: 6,
            paddingTop: 8,
          }}
        >
          <span>Total</span>
          <span>{p.totalHarga || `Rp${itemsSubtotal.toLocaleString("id-ID")}`}</span>
        </div>
        {p.deskripsi && (
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>{p.deskripsi}</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={lblStyle}>Catatan</span>
          <span>{catatan || "—"}</span>
        </div>
        <div style={rowStyle}>
          <span style={lblStyle}>Pembayaran</span>
          <span>
            {p.metodePembayaran || "—"}
            {p.detailPembayaran ? ` · ${p.detailPembayaran}` : ""}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={lblStyle}>Pengiriman</span>
          <span>{p.metodePengiriman || "—"}</span>
        </div>
        {p.kodePromo && (
          <div style={rowStyle}>
            <span style={lblStyle}>Promo</span>
            <span>{p.kodePromo}</span>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ ...lblStyle, marginBottom: 8 }}>STATUS</div>
        <StatusToggle
          id={p.id}
          currentAntar={p.statusPengiriman}
          currentBayar={p.statusPembayaran}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ ...lblStyle, marginBottom: 6 }}>
          RIWAYAT STATUS ({logs.length})
        </div>
        {logs.length === 0 && (
          <div style={{ fontSize: 12, color: "#64748B" }}>
            Belum ada perubahan status tercatat.
          </div>
        )}
        {logs.map((l) => (
          <div
            key={l.id}
            style={{
              fontSize: 12,
              color: "#334155",
              padding: "6px 0",
              borderBottom: "1px solid #F1F5F9",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {l.jenisStatus === "pengiriman" ? "🚚 Pengiriman" : "💰 Pembayaran"}:{" "}
              {statusLabel(
                l.jenisStatus === "pengiriman" ? "pengiriman" : "pembayaran",
                l.statusLama,
              )}{" "}
              →{" "}
              {statusLabel(
                l.jenisStatus === "pengiriman" ? "pengiriman" : "pembayaran",
                l.statusBaru,
              )}
            </div>
            <div style={{ color: "#94A3B8" }}>{formatWaktu(l.changedAt)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
