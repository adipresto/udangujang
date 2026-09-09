"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/pricing";
import {
  createPromoAction,
  deletePromoAction,
  setPromoActiveAction,
  updatePromoAction,
  type PromoFormInput,
} from "./actions";

export interface PromoRow {
  code: string;
  type: string;
  value: number;
  active: boolean;
  expiresIso: string | null;
  minKg: number;
  maxKg: number;
  minKgUtuh: number;
  minKgKupas: number;
  minSubtotal: number;
  maxUses: number;
  usedCount: number;
}

const EMPTY: PromoFormInput = {
  code: "",
  type: "discount",
  value: 0,
  active: true,
  expires: "",
  minKg: 0,
  maxKg: 0,
  minKgUtuh: 0,
  minKgKupas: 0,
  minSubtotal: 0,
  maxUses: 0,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  color: "#0F172A",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
  marginBottom: 4,
};

function typeLabel(t: string): string {
  if (t === "discount") return "Diskon";
  if (t === "free_shipping") return "Gratis Ongkir";
  if (t === "free_product") return "Produk Gratis";
  return t;
}

function nilaiLabel(p: PromoRow): string {
  if (p.type === "discount") return fmt(p.value);
  if (p.type === "free_shipping") return "Ongkir gratis";
  if (p.type === "free_product") return "Produk gratis";
  return "-";
}

function statusBadge(p: PromoRow): { text: string; bg: string; fg: string } {
  const expired = p.expiresIso !== null && Date.now() > new Date(p.expiresIso).getTime();
  if (!p.active) return { text: "NONAKTIF", bg: "#F1F5F9", fg: "#64748B" };
  if (expired) return { text: "KEDALUWARSA", bg: "#FEF3C7", fg: "#D97706" };
  return { text: "AKTIF", bg: "#DCFCE7", fg: "#16A34A" };
}

function toLocalDateISO(d: Date): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export default function PromoClient({ initial }: { initial: PromoRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<PromoFormInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PromoFormInput>(k: K, v: PromoFormInput[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function num(v: string): number {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function startEdit(p: PromoRow) {
    setEditing(p.code);
    setForm({
      code: p.code,
      type: p.type || "discount",
      value: p.value || 0,
      active: p.active,
      expires: p.expiresIso ? toLocalDateISO(new Date(p.expiresIso)) : "",
      minKg: p.minKg || 0,
      maxKg: p.maxKg || 0,
      minKgUtuh: p.minKgUtuh || 0,
      minKgKupas: p.minKgKupas || 0,
      minSubtotal: p.minSubtotal || 0,
      maxUses: p.maxUses || 0,
    });
    setError("");
    setNotice("");
  }

  function resetForm() {
    setForm(EMPTY);
    setEditing(null);
    setError("");
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const res = editing
      ? await updatePromoAction({ ...form, code: editing })
      : await createPromoAction(form);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(`Promo "${(editing ?? form.code).toUpperCase()}" tersimpan.`);
    resetForm();
    router.refresh();
  }

  async function onToggle(p: PromoRow) {
    setError("");
    setNotice("");
    const res = await setPromoActiveAction(p.code, !p.active);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(`"${p.code}" ${!p.active ? "diaktifkan" : "dinonaktifkan"}.`);
    router.refresh();
  }

  async function onDelete(p: PromoRow) {
    if (!confirm(`Hapus kode promo "${p.code}"? Tidak bisa dibatalkan.`)) return;
    setError("");
    setNotice("");
    const res = await deletePromoAction(p.code);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editing === p.code) resetForm();
    setNotice(`Promo "${p.code}" dihapus.`);
    router.refresh();
  }

  return (
    <div>
      {/* Form tambah / edit */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 12px" }}>
          {editing ? `Edit Promo "${editing}"` : "Tambah Kode Promo"}
        </h2>
        <form onSubmit={onSave}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "12px 16px",
            }}
          >
            <div>
              <label htmlFor="promo-kode" style={labelStyle}>
                Kode Promo *
              </label>
              <input
                id="promo-kode"
                type="text"
                placeholder="mis. UDANG25"
                autoComplete="off"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                readOnly={editing !== null}
                style={{
                  ...inputStyle,
                  textTransform: "uppercase",
                  background: editing !== null ? "#F1F5F9" : "#fff",
                }}
              />
            </div>
            <div>
              <label htmlFor="promo-type" style={labelStyle}>
                Tipe *
              </label>
              <select
                id="promo-type"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                style={inputStyle}
              >
                <option value="discount">Diskon (potongan rupiah)</option>
                <option value="free_shipping">Gratis Ongkir</option>
                <option value="free_product">Produk Gratis (order ≤ maks kg)</option>
              </select>
            </div>
            {form.type === "discount" && (
              <div>
                <label htmlFor="promo-value" style={labelStyle}>
                  Nominal Potongan (Rp) *
                </label>
                <input
                  id="promo-value"
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="mis. 25000"
                  value={form.value || ""}
                  onChange={(e) => set("value", num(e.target.value))}
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <label htmlFor="promo-expires" style={labelStyle}>
                Kedaluwarsa *
              </label>
              <input
                id="promo-expires"
                type="date"
                value={form.expires}
                onChange={(e) => set("expires", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-minKg" style={labelStyle}>
                Min Total Berat (kg)
              </label>
              <input
                id="promo-minKg"
                type="number"
                min={0}
                step={0.1}
                value={form.minKg || ""}
                onChange={(e) => set("minKg", num(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-maxKg" style={labelStyle}>
                Maks Total Berat (kg)
              </label>
              <input
                id="promo-maxKg"
                type="number"
                min={0}
                step={0.1}
                value={form.maxKg || ""}
                onChange={(e) => set("maxKg", num(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-minKgUtuh" style={labelStyle}>
                Min Udang Utuh (kg)
              </label>
              <input
                id="promo-minKgUtuh"
                type="number"
                min={0}
                step={0.1}
                value={form.minKgUtuh || ""}
                onChange={(e) => set("minKgUtuh", num(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-minKgKupas" style={labelStyle}>
                Min Udang Kupas (kg)
              </label>
              <input
                id="promo-minKgKupas"
                type="number"
                min={0}
                step={0.1}
                value={form.minKgKupas || ""}
                onChange={(e) => set("minKgKupas", num(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-minSubtotal" style={labelStyle}>
                Min Subtotal (Rp)
              </label>
              <input
                id="promo-minSubtotal"
                type="number"
                min={0}
                step={1000}
                value={form.minSubtotal || ""}
                onChange={(e) => set("minSubtotal", num(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="promo-maxUses" style={labelStyle}>
                Kuota Pemakaian (maxUses)
              </label>
              <input
                id="promo-maxUses"
                type="number"
                min={0}
                step={1}
                placeholder="0 = tak terbatas"
                value={form.maxUses || ""}
                onChange={(e) => set("maxUses", num(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              fontSize: 13,
              color: "#1E293B",
              cursor: "pointer",
            }}
          >
            <input
              id="promo-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            Aktif (bisa dipakai kastamer)
          </label>
          {error && (
            <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
              {error}
            </p>
          )}
          {notice && <p style={{ fontSize: 13, color: "#16A34A" }}>{notice}</p>}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
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
              {busy ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan Kode Promo"}
            </button>
            <button
              type="button"
              onClick={resetForm}
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
              {editing ? "Batal Edit" : "Bersihkan Form"}
            </button>
          </div>
        </form>
      </div>

      {/* Daftar promo */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          padding: 16,
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
              <th style={{ padding: "8px 6px" }}>Kode</th>
              <th style={{ padding: "8px 6px" }}>Tipe</th>
              <th style={{ padding: "8px 6px" }}>Nilai</th>
              <th style={{ padding: "8px 6px" }}>Status</th>
              <th style={{ padding: "8px 6px" }}>Kedaluwarsa</th>
              <th style={{ padding: "8px 6px" }}>Min/Maks</th>
              <th style={{ padding: "8px 6px" }}>Pakai</th>
              <th style={{ padding: "8px 6px" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "#94A3B8" }}>
                  Belum ada kode promo.
                </td>
              </tr>
            )}
            {initial.map((p) => {
              const badge = statusBadge(p);
              const constraints = [
                p.minKg ? `min ${p.minKg}kg` : null,
                p.maxKg ? `maks ${p.maxKg}kg` : null,
                p.minKgUtuh ? `utuh ≥${p.minKgUtuh}kg` : null,
                p.minKgKupas ? `kupas ≥${p.minKgKupas}kg` : null,
                p.minSubtotal ? `subtotal ≥${fmt(p.minSubtotal)}` : null,
              ].filter((c): c is string => !!c);
              return (
                <tr key={p.code} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 6px", fontFamily: "monospace", fontWeight: 700 }}>
                    {p.code}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{typeLabel(p.type)}</td>
                  <td style={{ padding: "8px 6px" }}>{nilaiLabel(p)}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 6,
                        padding: "2px 8px",
                      }}
                    >
                      {badge.text}
                    </span>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {p.expiresIso
                      ? new Date(p.expiresIso).toLocaleDateString("id-ID")
                      : "-"}
                  </td>
                  <td style={{ padding: "8px 6px", color: "#64748B" }}>
                    {constraints.length ? constraints.join(" · ") : "-"}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {p.usedCount}
                    {p.maxUses ? `/${p.maxUses}` : ""}
                  </td>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => startEdit(p)}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      title={p.active ? "Nonaktifkan" : "Aktifkan"}
                      onClick={() => onToggle(p)}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
                      {p.active ? "⏸️" : "▶️"}
                    </button>
                    <button
                      type="button"
                      title="Hapus"
                      onClick={() => onDelete(p)}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
                      🗑️
                    </button>
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
