"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 13,
  color: "#0F172A",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94A3B8",
  display: "block",
  marginBottom: 2,
};

// TransaksiFilter mirrors PesananFilter's query-string pattern (GET form,
// server page reads dari/sampai): the date window applies to the merged
// ledger (manual transaksi + automatic penjualan rows).
export default function TransaksiFilter({ initial }: { initial: { dari: string; sampai: string } }) {
  const router = useRouter();
  const [dari, setDari] = useState(initial.dari);
  const [sampai, setSampai] = useState(initial.sampai);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (dari) q.set("dari", dari);
    if (sampai) q.set("sampai", sampai);
    const qs = q.toString();
    router.push(`/admin/transaksi${qs ? `?${qs}` : ""}`);
  }

  function reset() {
    setDari("");
    setSampai("");
    router.push("/admin/transaksi");
  }

  return (
    <form
      onSubmit={apply}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "flex-end",
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <label style={{ fontSize: 13, color: "#334155" }}>
        <span style={labelStyle}>DARI</span>
        <input
          type="date"
          value={dari}
          onChange={(e) => setDari(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ fontSize: 13, color: "#334155" }}>
        <span style={labelStyle}>SAMPAI</span>
        <input
          type="date"
          value={sampai}
          onChange={(e) => setSampai(e.target.value)}
          style={inputStyle}
        />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "7px 14px",
            background: "#0F172A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Terapkan
        </button>
        <button
          type="button"
          onClick={reset}
          title="Reset filter tanggal"
          style={{
            fontSize: 13,
            padding: "7px 12px",
            background: "transparent",
            color: "#64748B",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          ✕ Reset
        </button>
      </div>
    </form>
  );
}
