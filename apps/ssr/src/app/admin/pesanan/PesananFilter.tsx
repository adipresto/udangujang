"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { defaultDari, defaultSampai } from "./status";

interface FilterValues {
  dari: string;
  sampai: string;
  antar: string;
  bayar: string;
}

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

// PesananFilter mirrors the dashboard's db-toolbar (reference
// ~lines 780-800): date range + pengiriman/pembayaran selects. The page is
// a server component, so filters live in the query string — submit via
// GET form, reset restores the 7-day default.
export default function PesananFilter({ initial }: { initial: FilterValues }) {
  const router = useRouter();
  const [dari, setDari] = useState(initial.dari);
  const [sampai, setSampai] = useState(initial.sampai);
  const [antar, setAntar] = useState(initial.antar);
  const [bayar, setBayar] = useState(initial.bayar);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (dari) q.set("dari", dari);
    if (sampai) q.set("sampai", sampai);
    if (antar) q.set("antar", antar);
    if (bayar) q.set("bayar", bayar);
    const qs = q.toString();
    router.push(`/admin/pesanan${qs ? `?${qs}` : ""}`);
  }

  function reset() {
    setDari(defaultDari());
    setSampai(defaultSampai());
    setAntar("");
    setBayar("");
    router.push("/admin/pesanan");
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
      <label style={{ fontSize: 13, color: "#334155" }}>
        <span style={labelStyle}>PENGIRIMAN</span>
        <select value={antar} onChange={(e) => setAntar(e.target.value)} style={inputStyle}>
          <option value="">Semua Pengiriman</option>
          <option value="belum_antar">Belum Antar</option>
          <option value="sudah_antar">Sudah Antar</option>
        </select>
      </label>
      <label style={{ fontSize: 13, color: "#334155" }}>
        <span style={labelStyle}>PEMBAYARAN</span>
        <select value={bayar} onChange={(e) => setBayar(e.target.value)} style={inputStyle}>
          <option value="">Semua Pembayaran</option>
          <option value="belum_bayar">Belum Bayar</option>
          <option value="sudah_bayar">Sudah Bayar</option>
        </select>
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
