import { listKastamer, listPesanan, listTransaksi } from "@/lib/das-client";
import { fmt } from "@/lib/pricing";
import type { Pesanan } from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";
import type { Transaksi } from "@udangujang/proto/src/gen/udangujang/transaksi/v1/transaksi";
import type { LedgerRow } from "./LedgerTable";
import TransaksiHost from "./TransaksiHost";
import TransaksiFilter from "./TransaksiFilter";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

// parseRupiah port (reference/udang-dashboard/index.html ~line 1646):
// handles "Rp50.000", "50.000", "50000", "50,5".
function parseRupiah(s: string): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[Rp\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function toYMD(d: Date | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pesananTanggal(p: Pesanan): string {
  return (
    toYMD(p.tanggalBayar) ||
    toYMD(p.tanggalAntar) ||
    (p.createdAt instanceof Date && !isNaN(p.createdAt.getTime())
      ? p.createdAt.toISOString().slice(0, 10)
      : "")
  );
}

function pesananCreated(p: Pesanan): string {
  const d = p.tanggalBayar ?? p.createdAt;
  return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : "";
}

function transaksiCreated(t: Transaksi): string {
  const d = t.createdAt;
  return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : "";
}

// getLedgerRows() port (reference/udang-dashboard/index.html ~lines
// 4509-4550): manual transaksi (keluar) + automatic pemasukan from
// sudah_bayar pesanan ("Penjualan — deskripsi (nama)"), sorted by tanggal,
// then urutan, then created as stable tiebreak.
function buildLedger(
  manual: Transaksi[],
  paid: Pesanan[],
  namaById: Map<string, string>,
): LedgerRow[] {
  const rows: (LedgerRow & { urutan: number; created: string })[] = [];
  for (const t of manual) {
    rows.push({
      id: t.id,
      tanggal: t.tanggal,
      keterangan: t.keterangan,
      kategori: t.kategori,
      keluar: t.jumlah || 0,
      masuk: 0,
      auto: false,
      urutan: t.urutan ?? Number.MAX_SAFE_INTEGER,
      created: transaksiCreated(t),
    });
  }
  for (const p of paid) {
    const nama = namaById.get(p.kastamerId) || "";
    const ket =
      "Penjualan" + (p.deskripsi ? " — " + p.deskripsi : "") + (nama ? " (" + nama + ")" : "");
    rows.push({
      id: p.id,
      tanggal: pesananTanggal(p),
      keterangan: ket,
      kategori: "penjualan",
      keluar: 0,
      masuk: parseRupiah(p.totalHarga),
      auto: true,
      urutan: Number.MAX_SAFE_INTEGER,
      created: pesananCreated(p),
    });
  }
  rows.sort(
    (a, b) =>
      (a.tanggal || "").localeCompare(b.tanggal || "") ||
      a.urutan - b.urutan ||
      (a.created || "").localeCompare(b.created || ""),
  );
  return rows.map(({ urutan: _u, created: _c, ...r }) => r);
}

export interface LedgerTotals {
  totKeluar: number;
  totMasuk: number;
  totOperasional: number;
  totPrive: number;
  totPenyesuaian: number;
  laba: number;
  saldo: number;
}

export default async function TransaksiPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dari = first(sp.dari);
  const sampai = first(sp.sampai);

  let manual: Transaksi[] = [];
  let paid: Pesanan[] = [];
  let namaById = new Map<string, string>();
  let loadError = "";

  try {
    const [trxResp, pesResp, kasResp] = await Promise.all([
      listTransaksi({
        tanggalDari: dari || undefined,
        tanggalSampai: sampai || undefined,
      }),
      listPesanan({ statusPembayaran: "sudah_bayar" }),
      listKastamer(),
    ]);
    manual = trxResp.transaksi ?? [];
    paid = (pesResp.pesanan ?? []).filter((p) => p.statusPembayaran === "sudah_bayar");
    namaById = new Map((kasResp.kastamer ?? []).map((k) => [k.id, k.nama]));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  // The date filter applies to the merged ledger (both manual + auto rows).
  let rows = buildLedger(manual, paid, namaById);
  if (!loadError) {
    if (dari) rows = rows.filter((r) => (r.tanggal || "") >= dari);
    if (sampai) rows = rows.filter((r) => (r.tanggal || "") <= sampai);
  }

  // renderAccounting() totals port (reference ~4552-4560): keluar/masuk
  // accumulate over every row; keluar splits into operasional vs prive vs
  // penyesuaian (aset counts as operasional).
  const totals: LedgerTotals = {
    totKeluar: 0,
    totMasuk: 0,
    totOperasional: 0,
    totPrive: 0,
    totPenyesuaian: 0,
    laba: 0,
    saldo: 0,
  };
  for (const r of rows) {
    totals.totKeluar += r.keluar;
    totals.totMasuk += r.masuk;
    if (r.kategori === "prive") totals.totPrive += r.keluar;
    else if (r.kategori === "penyesuaian") totals.totPenyesuaian += r.keluar;
    else totals.totOperasional += r.keluar;
  }
  totals.laba = totals.totMasuk - totals.totOperasional;
  totals.saldo = totals.laba - totals.totPrive - totals.totPenyesuaian;

  const stats = [
    { label: "Total Keluar", value: fmt(totals.totKeluar), color: "#DC2626" },
    { label: "Total Masuk", value: fmt(totals.totMasuk), color: "#10B981" },
    { label: "Laba Bisnis", value: fmt(totals.laba), color: totals.laba >= 0 ? "#4F46E5" : "#DC2626" },
    { label: "Saldo Dompet", value: fmt(totals.saldo), color: totals.saldo >= 0 ? "#0EA5E9" : "#DC2626" },
  ];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, flex: 1 }}>
          Transaksi
        </h1>
      </div>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Buku kas: pengeluaran manual + pemasukan otomatis dari pesanan sudah dibayar.
      </p>

      <TransaksiFilter initial={{ dari, sampai }} />

      {loadError && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          Gagal memuat transaksi: {loadError}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              padding: "8px 12px",
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {!loadError && <TransaksiHost rows={rows} manual={manual} totals={totals} />}
    </section>
  );
}
