"use client";

import { useState, useTransition } from "react";
import { updateAntar, updateBayar, STATUS_ANTAR, STATUS_BAYAR } from "../actions";

interface ToggleProps {
  id: string;
  currentAntar: string;
  currentBayar: string;
}

const btnBase: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

function activeBtn(color: string): React.CSSProperties {
  return { ...btnBase, background: color, color: "#fff" };
}

const idleBtn: React.CSSProperties = {
  ...btnBase,
  background: "#F1F5F9",
  color: "#94A3B8",
};

// StatusToggle ports the popup/detail quick-status buttons (reference
// ~lines 2525-2555, 4030-4033): confirm() dulu, lalu server action yang
// hanya mengirim field yang diubah. Tombol status aktif disorot.
export default function StatusToggle({ id, currentAntar, currentBayar }: ToggleProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const isAntar = currentAntar === STATUS_ANTAR.SUDAH;
  const isBayar = currentBayar === STATUS_BAYAR.SUDAH;

  function run(kind: "antar" | "bayar", value: string, label: string) {
    setError("");
    if (!window.confirm(`Ubah status ${kind === "antar" ? "pengiriman" : "pembayaran"} → ${label}?`)) {
      return;
    }
    startTransition(async () => {
      const res =
        kind === "antar" ? await updateAntar(id, value) : await updateBayar(id, value);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94A3B8",
            marginBottom: 4,
          }}
        >
          PENGIRIMAN
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("antar", STATUS_ANTAR.BELUM, "Belum Antar")}
            style={!isAntar ? activeBtn("#DC2626") : idleBtn}
          >
            Belum Antar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("antar", STATUS_ANTAR.SUDAH, "Sudah Antar")}
            style={isAntar ? activeBtn("#D97706") : idleBtn}
          >
            Sudah Antar
          </button>
        </div>
      </div>
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94A3B8",
            marginBottom: 4,
          }}
        >
          PEMBAYARAN
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("bayar", STATUS_BAYAR.BELUM, "Belum Bayar")}
            style={!isBayar ? activeBtn("#DC2626") : idleBtn}
          >
            Belum Bayar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("bayar", STATUS_BAYAR.SUDAH, "Sudah Bayar")}
            style={isBayar ? activeBtn("#059669") : idleBtn}
          >
            Sudah Bayar
          </button>
        </div>
      </div>
      {pending && <div style={{ fontSize: 12, color: "#64748B" }}>Menyimpan…</div>}
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626", margin: 0 }}>
          Gagal menyimpan: {error}
        </p>
      )}
    </div>
  );
}
