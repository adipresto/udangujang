"use client";

import { useState } from "react";
import { updateDepotAction, type DepotInput } from "./actions";
import type { RuteDepot } from "./RuteHost";

interface DepotModalProps {
  initial: RuteDepot | null;
  onClose: () => void;
  onSaved: (d: DepotInput) => void;
}

// depotParseLink patterns — verbatim from reference/udang-dashboard/
// index.html ~line 3160 (q= / @ / ll= / dir/).
function parseLinkCoords(v: string): { lat: number; lng: number } | null {
  const patterns = [
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /maps\.google\.[^/]*\/\?.*ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/dir\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ];
  for (const pat of patterns) {
    const m = v.match(pat);
    if (m) {
      return { lat: parseFloat(m[1]!), lng: parseFloat(m[2]!) };
    }
  }
  return null;
}

// Modal Set Gudang — ports openDepotModal/saveDepot (reference ~3170-3200).
// Depot is server-side via UpdateDepot (was localStorage udang-depot-v1).
export default function DepotModal({ initial, onClose, onSaved }: DepotModalProps) {
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [alamat, setAlamat] = useState(initial?.alamat ?? "");
  const [mapsLink, setMapsLink] = useState(initial?.mapsLink ?? "");
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function parseLink(): void {
    if (!mapsLink) {
      setError("Isi link Google Maps dulu.");
      return;
    }
    const c = parseLinkCoords(mapsLink);
    if (c) {
      setLat(String(c.lat));
      setLng(String(c.lng));
      setError("");
    } else {
      setError("⚠️ Format link tidak dikenali — coba paste lat,lng manual.");
    }
  }

  async function save(): Promise<void> {
    const plat = parseFloat(lat);
    const plng = parseFloat(lng);
    if (!nama.trim()) {
      setError("Nama tempat wajib diisi.");
      return;
    }
    if (isNaN(plat) || isNaN(plng)) {
      setError("Latitude & Longitude wajib diisi.");
      return;
    }
    setSaving(true);
    const res = await updateDepotAction({
      nama: nama.trim(),
      alamat: alamat.trim(),
      lat: plat,
      lng: plng,
      mapsLink: mapsLink.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved({ nama: nama.trim(), alamat: alamat.trim(), lat: plat, lng: plng, mapsLink: mapsLink.trim() });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set Gudang"
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
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>
          🏠 Set Gudang (Depot)
        </h2>

        <label style={labelStyle}>
          Nama tempat
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Gudang Udang Ujang"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Alamat
          <input
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            placeholder="Jl. ..."
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Link Google Maps
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={mapsLink}
              onChange={(e) => setMapsLink(e.target.value)}
              placeholder="https://maps.google.com/..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="button" onClick={parseLink} style={btnStyle}>
              Parse
            </button>
          </div>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            Latitude
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-6.2"
              inputMode="decimal"
              style={inputStyle}
            />
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            Longitude
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="106.8"
              inputMode="decimal"
              style={inputStyle}
            />
          </label>
        </div>

        {error && (
          <p role="alert" style={{ fontSize: 13, color: "#DC2626", margin: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnStyle}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={btnPrimaryStyle}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "8px 10px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  color: "#0F172A",
  width: "100%",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  cursor: "pointer",
  color: "#0F172A",
  whiteSpace: "nowrap",
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#0F172A",
  borderColor: "#0F172A",
  color: "#fff",
};
