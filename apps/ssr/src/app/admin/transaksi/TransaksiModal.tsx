"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Transaksi } from "@/lib/das-client";
import {
  createTransaksiAction,
  updateTransaksiAction,
  type TransaksiFormInput,
} from "./actions";

// TransaksiModal ports openTrxModal/saveTrx/recalcTrx (reference/
// udang-dashboard/index.html ~lines 4648-4709): kategori select, tanggal,
// keterangan, kg + hargaPerKg (only for belanja — auto-computes jumlah via
// Math.round(kg*harga)), jumlah; tanggal + keterangan + jumlah required;
// edit mode prefills from the existing row.
export interface EditingTransaksi {
  id: string;
  tanggal: string;
  keterangan: string;
  kategori: string;
  kg: number | null;
  hargaPerKg: number | null;
  jumlah: number;
}

export function toEditing(t: Transaksi): EditingTransaksi {
  return {
    id: t.id,
    tanggal: t.tanggal,
    keterangan: t.keterangan,
    kategori: t.kategori || "belanja",
    kg: t.kg ?? null,
    hargaPerKg: t.hargaPerKg ?? null,
    jumlah: t.jumlah,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  color: "#0F172A",
  boxSizing: "border-box",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
  marginBottom: 4,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export default function TransaksiModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: EditingTransaksi | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kategori, setKategori] = useState("belanja");
  const [tanggal, setTanggal] = useState(todayISO());
  const [keterangan, setKeterangan] = useState("");
  const [kg, setKg] = useState("");
  const [hargaPerKg, setHargaPerKg] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Prefill on open — new rows default to today, edits keep stored values.
  useEffect(() => {
    if (!open) return;
    setKategori(editing?.kategori || "belanja");
    setTanggal(editing?.tanggal || todayISO());
    setKeterangan(editing?.keterangan || "");
    setKg(editing?.kg != null ? String(editing.kg) : "");
    setHargaPerKg(editing?.hargaPerKg != null ? String(editing.hargaPerKg) : "");
    setJumlah(editing ? String(editing.jumlah) : "");
    setError("");
    setBusy(false);
  }, [open, editing]);

  // recalcTrx() port (reference ~4701-4705).
  function onKg(v: string) {
    setKg(v);
    const k = Number(v);
    const h = Number(hargaPerKg);
    if (k && h) setJumlah(String(Math.round(k * h)));
  }

  function onHarga(v: string) {
    setHargaPerKg(v);
    const k = Number(kg);
    const h = Number(v);
    if (k && h) setJumlah(String(Math.round(k * h)));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const input: TransaksiFormInput = {
      tanggal,
      keterangan: keterangan.trim(),
      kategori,
      kg: kategori === "belanja" ? num(kg) : null,
      hargaPerKg: kategori === "belanja" ? num(hargaPerKg) : null,
      jumlah: Math.round(Number(jumlah) || 0),
    };
    if (!input.tanggal) {
      setError("Tanggal wajib diisi.");
      return;
    }
    if (!input.keterangan) {
      setError("Keterangan wajib diisi.");
      return;
    }
    if (!(input.jumlah > 0)) {
      setError("Total harga wajib diisi.");
      return;
    }
    setBusy(true);
    const res = editing
      ? await updateTransaksiAction(editing.id, input)
      : await createTransaksiAction(input);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  if (!open) return null;

  const titles: Record<string, string> = {
    belanja: "Log Belanja",
    aset: "Log Pembelian Aset",
    prive: "Log Prive",
    penyesuaian: "Log Penyesuaian",
  };
  const editTitles: Record<string, string> = {
    belanja: "Edit Belanja",
    aset: "Edit Aset",
    prive: "Edit Prive",
    penyesuaian: "Edit Penyesuaian",
  };
  const title = editing
    ? (editTitles[kategori] ?? "Edit Transaksi")
    : (titles[kategori] ?? "Log Transaksi");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          width: "100%",
          maxWidth: 440,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>
          {title}
        </h2>
        <form onSubmit={(e) => void onSave(e)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label htmlFor="trx-kategori" style={labelStyle}>
                Kategori
              </label>
              <select
                id="trx-kategori"
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                style={inputStyle}
              >
                <option value="belanja">Belanja (operasional)</option>
                <option value="aset">Aset</option>
                <option value="prive">Prive</option>
                <option value="penyesuaian">Penyesuaian</option>
              </select>
            </div>
            <div>
              <label htmlFor="trx-tanggal" style={labelStyle}>
                Tanggal *
              </label>
              <input
                id="trx-tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="trx-keterangan" style={labelStyle}>
                Keterangan *
              </label>
              <input
                id="trx-keterangan"
                type="text"
                autoFocus
                placeholder="mis. Belanja udang 10kg"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                style={inputStyle}
              />
            </div>
            {kategori === "belanja" && (
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="trx-kg" style={labelStyle}>
                    Berat (kg)
                  </label>
                  <input
                    id="trx-kg"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="mis. 10"
                    value={kg}
                    onChange={(e) => onKg(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="trx-harga-kg" style={labelStyle}>
                    Harga/kg (Rp)
                  </label>
                  <input
                    id="trx-harga-kg"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="mis. 98000"
                    value={hargaPerKg}
                    onChange={(e) => onHarga(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="trx-jumlah" style={labelStyle}>
                Total Harga (Rp) *
              </label>
              <input
                id="trx-jumlah"
                type="number"
                min={0}
                step={1}
                placeholder="mis. 980000"
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                style={inputStyle}
              />
              {kategori === "belanja" && (
                <p style={{ fontSize: 11, color: "#94A3B8", margin: "4px 0 0" }}>
                  Otomatis terisi dari kg × harga/kg — bisa diubah manual.
                </p>
              )}
            </div>
          </div>
          {error && (
            <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
              {error}
            </p>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "transparent",
                color: "#334155",
                border: "1px solid #CBD5E1",
                borderRadius: 8,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "8px 16px",
                background: "#0F172A",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
