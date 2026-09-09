"use client";

import { useState } from "react";
import { updateHargaAction } from "./actions";
import { HARGA_FIELDS } from "./harga-fields";

export interface HargaFormInitial {
  values: Record<string, number>;
  updatedAtIso: string | null;
}

function fieldId(path: string): string {
  return "h-" + path.replace(".", "-");
}

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
  fontFamily: "monospace",
};

export default function HargaForm({ initial }: { initial: HargaFormInitial }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(HARGA_FIELDS.map((p) => [p, String(initial.values[p] ?? "")])),
  );
  const [updatedText, setUpdatedText] = useState(
    initial.updatedAtIso
      ? `Terakhir diubah: ${new Date(initial.updatedAtIso).toLocaleString("id-ID")}`
      : "",
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  function set(path: string, v: string) {
    setValues((prev) => ({ ...prev, [path]: v }));
  }

  // Mirrors saveHarga()'s client checks (reference lines ~5131-5142):
  // every field must be a number >= 0, then confirm() before submitting.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved("");
    const nums: Record<string, number> = {};
    for (const path of HARGA_FIELDS) {
      const raw = (values[path] ?? "").trim();
      const v = Number(raw);
      if (raw === "" || isNaN(v) || v < 0) {
        setError(`Field "${path}" harus diisi angka >= 0`);
        return;
      }
      nums[path] = v;
    }
    if (!confirm("Yakin ubah harga live? Perubahan langsung berlaku di form pemesanan."))
      return;
    setSaving(true);
    const res = await updateHargaAction(nums);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved("Harga tersimpan.");
    if (res.updatedAtIso) {
      setUpdatedText(
        `Terakhir diubah: ${new Date(res.updatedAtIso).toLocaleString("id-ID")}`,
      );
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "12px 16px",
        }}
      >
        {HARGA_FIELDS.map((path) => (
          <div key={path}>
            <label htmlFor={fieldId(path)} style={labelStyle}>
              {path}
            </label>
            <input
              id={fieldId(path)}
              type="number"
              min={0}
              step="any"
              value={values[path] ?? ""}
              onChange={(e) => set(path, e.target.value)}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          {error}
        </p>
      )}
      {saved && <p style={{ fontSize: 13, color: "#16A34A" }}>{saved}</p>}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "8px 16px",
            background: "#0F172A",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Menyimpan..." : "Simpan Harga"}
        </button>
        <span style={{ fontSize: 12, color: "#64748B" }}>{updatedText}</span>
      </div>
    </form>
  );
}
