"use client";

import { useState } from "react";
import type { Transaksi } from "@/lib/das-client";
import { fmt } from "@/lib/pricing";
import LedgerTable, { type LedgerRow } from "./LedgerTable";
import TransaksiModal, { toEditing, type EditingTransaksi } from "./TransaksiModal";
import type { LedgerTotals } from "./page";

// TransaksiHost is the client island inside the server ledger page: owns the
// modal open/edit state, renders the table, and renders the tfoot totals
// (TOTAL + Laba + Prive/Penyesuaian + Saldo — reference renderAccounting's
// tfoot ~lines 4598-4625) from the server-computed totals.
export default function TransaksiHost({
  rows,
  manual,
  totals,
}: {
  rows: LedgerRow[];
  manual: Transaksi[];
  totals: LedgerTotals;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditingTransaksi | null>(null);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    const t = manual.find((m) => m.id === id);
    if (!t) return;
    setEditing(toEditing(t));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={openNew}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: "#16A34A",
            border: 0,
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Tambah Transaksi
        </button>
      </div>

      <LedgerTable rows={rows} onEdit={openEdit} />

      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tfoot>
            <tr style={{ background: "#fff" }}>
              <td
                colSpan={2}
                style={{
                  padding: "8px 6px",
                  textAlign: "right",
                  fontWeight: 700,
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                TOTAL
              </td>
              <td
                style={{
                  padding: "8px 6px",
                  textAlign: "right",
                  color: "#DC2626",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                {fmt(totals.totKeluar)}
              </td>
              <td
                style={{
                  padding: "8px 6px",
                  textAlign: "right",
                  color: "#10B981",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                {fmt(totals.totMasuk)}
              </td>
              <td style={{ borderTop: "1px solid #E2E8F0" }} />
            </tr>
            <tr style={{ background: "#fff" }}>
              <td
                colSpan={2}
                style={{ padding: "4px 6px", textAlign: "right", fontSize: 12, color: "#64748B" }}
              >
                Laba Bisnis <span style={{ color: "#94A3B8" }}>(Masuk − Operasional)</span>
              </td>
              <td
                colSpan={2}
                style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  color: totals.laba >= 0 ? "#4F46E5" : "#DC2626",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {fmt(totals.laba)}
              </td>
              <td />
            </tr>
            {(totals.totPrive > 0 || totals.totPenyesuaian > 0) && (
              <tr style={{ background: "#fff" }}>
                <td
                  colSpan={2}
                  style={{ padding: "4px 6px", textAlign: "right", fontSize: 12, color: "#64748B" }}
                >
                  Prive{totals.totPenyesuaian > 0 ? " + Penyesuaian" : ""}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    textAlign: "right",
                    color: "#D97706",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmt(totals.totPrive + totals.totPenyesuaian)}
                </td>
                <td />
                <td />
              </tr>
            )}
            <tr style={{ background: "#fff" }}>
              <td
                colSpan={2}
                style={{
                  padding: "8px 6px",
                  textAlign: "right",
                  fontWeight: 700,
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                Saldo Dompet
              </td>
              <td
                colSpan={2}
                style={{
                  padding: "8px 6px",
                  textAlign: "right",
                  color: totals.saldo >= 0 ? "#0EA5E9" : "#DC2626",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                {fmt(totals.saldo)}
              </td>
              <td style={{ borderTop: "1px solid #E2E8F0" }} />
            </tr>
            <tr style={{ background: "#fff" }}>
              <td
                colSpan={5}
                style={{ padding: "4px 6px", fontSize: 11, color: "#94A3B8", textAlign: "right" }}
              >
                Operasional {fmt(totals.totOperasional)} · Prive {fmt(totals.totPrive)} ·
                Penyesuaian {fmt(totals.totPenyesuaian)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <TransaksiModal open={modalOpen} editing={editing} onClose={closeModal} />
    </div>
  );
}
