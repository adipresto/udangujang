"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmt } from "@/lib/pricing";
import { deleteTransaksiAction, reorderTransaksiAction } from "./actions";
import { exportLedgerCSV } from "./csv";

// LedgerRow mirrors getLedgerRows() (reference/udang-dashboard/index.html
// ~lines 4509-4550): manual transaksi rows (keluar, reorderable) + automatic
// penjualan rows from sudah_bayar pesanan (masuk, read-only). The server
// page builds these; this client component only renders + mutates order.
export interface LedgerRow {
  id: string;
  tanggal: string;
  keterangan: string;
  kategori: string;
  keluar: number;
  masuk: number;
  auto: boolean;
}

function badgeFor(r: LedgerRow): { text: string; bg: string; fg: string } {
  if (r.auto) return { text: "otomatis", bg: "#ECFDF5", fg: "#10B981" };
  if (r.kategori === "aset") return { text: "aset", bg: "#F5F3FF", fg: "#7C3AED" };
  if (r.kategori === "prive") return { text: "prive", bg: "#FFFBEB", fg: "#D97706" };
  if (r.kategori === "penyesuaian")
    return { text: "penyesuaian", bg: "#F1F5F9", fg: "#64748B" };
  return { text: "belanja", bg: "#FEF2F2", fg: "#DC2626" };
}

const actBtn: React.CSSProperties = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  fontSize: 15,
  padding: "2px 4px",
};

const actBtnDisabled: React.CSSProperties = {
  ...actBtn,
  opacity: 0.3,
  cursor: "default",
};

export default function LedgerTable({
  rows,
  onEdit,
}: {
  rows: LedgerRow[];
  onEdit: (id: string) => void;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Manual position per date — disables up/down at group edges (reference
  // renderAccounting ~4559-4560 builds manualByDate the same way).
  const manualByDate = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.auto) {
      const grp = manualByDate.get(r.tanggal) ?? [];
      grp.push(r.id);
      manualByDate.set(r.tanggal, grp);
    }
  }

  function rowById(id: string): LedgerRow | undefined {
    return rows.find((r) => r.id === id);
  }

  async function applyOrder(tanggal: string, ids: string[]) {
    setError("");
    setBusy(true);
    const res = await reorderTransaksiAction(tanggal, ids);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  // moveTrx() port (reference ~4723-4741): swap with the neighbor inside the
  // same date's manual group, then persist via the reorder action. Focus is
  // returned to the moved row's button for keyboard a11y.
  async function move(id: string, dir: "up" | "down") {
    const r = rowById(id);
    if (!r || r.auto || busy) return;
    const grp = manualByDate.get(r.tanggal) ?? [];
    const idx = grp.indexOf(id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= grp.length) return;
    const next = [...grp];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    await applyOrder(r.tanggal, next);
    setTimeout(() => {
      let btn = document.querySelector<HTMLButtonElement>(
        `button[data-trx-move="${dir}"][data-trx-id="${id}"]`,
      );
      if (!btn || btn.disabled) {
        btn = document.querySelector<HTMLButtonElement>(
          `button[data-trx-move="${dir === "up" ? "down" : "up"}"][data-trx-id="${id}"]`,
        );
      }
      btn?.focus();
    }, 0);
  }

  // reorderTrxByDrop() port (reference ~4743-4753): only between manual rows
  // of the same date — insert the dragged row before the drop target.
  async function dropOn(targetId: string) {
    const dragged = dragId ? rowById(dragId) : undefined;
    const target = rowById(targetId);
    setDragId(null);
    if (!dragged || !target || busy) return;
    if (dragged.auto || target.auto) return;
    if (dragged.id === target.id || dragged.tanggal !== target.tanggal) return;
    const grp = (manualByDate.get(dragged.tanggal) ?? []).filter((x) => x !== dragged.id);
    const to = grp.indexOf(target.id);
    if (to < 0) return;
    grp.splice(to, 0, dragged.id);
    await applyOrder(dragged.tanggal, grp);
  }

  async function onDelete(r: LedgerRow) {
    if (!confirm(`Hapus transaksi "${r.keterangan}" (${fmt(r.keluar || r.masuk)})?`)) return;
    setError("");
    const res = await deleteTransaksiAction(r.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  function onExport() {
    exportLedgerCSV(rows);
  }

  if (rows.length === 0) {
    return (
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
        <div style={{ fontWeight: 600 }}>Belum ada transaksi.</div>
        <div>Tambah belanja/aset, atau tandai pesanan sebagai sudah dibayar.</div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          {error}
        </p>
      )}
      <div style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={onExport}
          style={{
            fontSize: 13,
            padding: "6px 12px",
            background: "transparent",
            color: "#334155",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          ⬇️ Export CSV
        </button>
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
              <th style={{ padding: "8px 6px" }}>Tanggal</th>
              <th style={{ padding: "8px 6px" }}>Keterangan</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Keluar</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Masuk</th>
              <th style={{ padding: "8px 6px" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const badge = badgeFor(r);
              const grp = manualByDate.get(r.tanggal) ?? [];
              const idx = grp.indexOf(r.id);
              const isFirst = idx <= 0;
              const isLast = idx < 0 || idx === grp.length - 1;
              return (
                <tr
                  key={`${r.auto ? "auto-" : ""}${r.id}`}
                  draggable={!r.auto}
                  onDragStart={() => {
                    if (!r.auto) setDragId(r.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (!r.auto && dragId && dragId !== r.id) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void dropOn(r.id);
                  }}
                  style={{
                    borderBottom: "1px solid #F1F5F9",
                    opacity: dragId === r.id ? 0.5 : 1,
                  }}
                >
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap", color: "#64748B" }}>
                    {r.tanggal}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {r.keterangan}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: badge.fg,
                        background: badge.bg,
                        borderRadius: 4,
                        padding: "1px 6px",
                        marginLeft: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badge.text}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "right",
                      color: "#DC2626",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.keluar ? fmt(r.keluar) : ""}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "right",
                      color: "#10B981",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.masuk ? fmt(r.masuk) : ""}
                  </td>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    {!r.auto && (
                      <>
                        <span title="Seret untuk ubah urutan" style={{ color: "#94A3B8" }}>
                          ⠿
                        </span>
                        <button
                          type="button"
                          data-trx-move="up"
                          data-trx-id={r.id}
                          onClick={() => void move(r.id, "up")}
                          disabled={isFirst || busy}
                          title="Pindah ke atas"
                          aria-label={`Pindah baris ${r.keterangan} ke atas`}
                          style={isFirst || busy ? actBtnDisabled : actBtn}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          data-trx-move="down"
                          data-trx-id={r.id}
                          onClick={() => void move(r.id, "down")}
                          disabled={isLast || busy}
                          title="Pindah ke bawah"
                          aria-label={`Pindah baris ${r.keterangan} ke bawah`}
                          style={isLast || busy ? actBtnDisabled : actBtn}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(r.id)}
                          title="Edit"
                          aria-label={`Edit baris ${r.keterangan}`}
                          style={actBtn}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(r)}
                          title="Hapus"
                          aria-label={`Hapus baris ${r.keterangan}`}
                          style={{ ...actBtn, color: "#DC2626" }}
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
