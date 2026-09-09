"use client";

import { useState } from "react";
import { resetRuteAction, saveRuteAction, type DepotInput } from "./actions";
import DepotModal from "./DepotModal";

// WA template kabari kirim — verbatim WA_TEMPLATE_RUTE from
// reference/udang-dashboard/index.html ~line 2750.
const WA_TEMPLATE_RUTE = "Halo kak, pesanan kakak segera kami kirim. Mohon ditunggu ya kakk";

export interface RuteStop {
  id: string;
  nama: string;
  noHp: string;
  noHpIntl: string;
  wilayah: string;
  alamat: string;
  lat: number;
  lng: number;
  mapsLink: string;
  pesanan: string;
  totalHarga: string;
}

export interface RuteDepot {
  nama: string;
  alamat: string;
  lat: number;
  lng: number;
  mapsLink: string;
}

interface RuteHostProps {
  tanggal: string;
  initialActive: RuteStop[];
  initialBank: RuteStop[];
  initialDepot: RuteDepot | null;
}

interface OsrmInfo {
  distanceKm: number;
  durationMin: number;
}

function waLinkRute(noHpIntl: string): string {
  return `https://wa.me/${noHpIntl}?text=${encodeURIComponent(WA_TEMPLATE_RUTE)}`;
}

function stopMapsUrl(s: RuteStop): string {
  if (s.mapsLink) return s.mapsLink;
  return `https://maps.google.com/?q=${s.lat},${s.lng}`;
}

// haversineMeter — verbatim from reference ~line 3011: cukup akurat untuk
// ordering jarak pendek.
function haversineMeter(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// exportRuteGmaps — verbatim URL building from reference ~line 3138:
// origin + waypoints + destination via maps/dir/?api=1, max 10 titik dengan
// confirm potong, buka tab baru.
function buildGmapsUrl(pts: { lat: number; lng: number }[]): string {
  const origin = pts[0]!;
  const dest = pts[pts.length - 1]!;
  const waypoints = pts.slice(1, -1);
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("travelmode", "driving");
  u.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  u.searchParams.set("destination", `${dest.lat},${dest.lng}`);
  if (waypoints.length)
    u.searchParams.set("waypoints", waypoints.map((p) => `${p.lat},${p.lng}`).join("|"));
  return u.toString();
}

// Client island for the route tab. Ports renderRouteList (~2892),
// moveRouteStop/reorderRouteStop/remove/add (~2961-3000), urutkanTerdekat
// (~3022-3050), tarikRuteJalanan (OSRM, ~3095) and exportRuteGmaps (~3138)
// from reference/udang-dashboard/index.html. Every mutation saves per action
// via saveRuteAction (no debounce — simple, matches persistRouteOrder's
// upsert-by-tanggal semantics). No leaflet in this repo: the "map" is a
// numbered stop list + per-stop maps links + one whole-route GMaps link,
// and tarik rute jalanan only reports OSRM jarak/durasi.
export default function RuteHost({ tanggal, initialActive, initialBank, initialDepot }: RuteHostProps) {
  const [active, setActive] = useState<RuteStop[]>(initialActive);
  const [bank, setBank] = useState<RuteStop[]>(initialBank);
  const [depot, setDepot] = useState<RuteDepot | null>(initialDepot);
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [osrm, setOsrm] = useState<OsrmInfo | null>(null);
  const [osrmLoading, setOsrmLoading] = useState(false);
  const [depotOpen, setDepotOpen] = useState(false);

  async function persist(ids: string[], okMsg?: string): Promise<void> {
    setSaving(true);
    const res = await saveRuteAction(tanggal, ids);
    setSaving(false);
    if (!res.ok) {
      setNotice(`⚠️ Gagal menyimpan: ${res.error}`);
      return;
    }
    setNotice(okMsg ?? "");
  }

  // moveRouteStop(pid, dir): swap with neighbor.
  async function moveStop(pid: string, dir: -1 | 1): Promise<void> {
    const idx = active.findIndex((v) => v.id === pid);
    const tgt = idx + dir;
    if (idx < 0 || tgt < 0 || tgt >= active.length) return;
    const next = active.slice();
    const tmp = next[idx]!;
    next[idx] = next[tgt]!;
    next[tgt] = tmp;
    setActive(next);
    setOsrm(null);
    await persist(next.map((v) => v.id));
  }

  // reorderRouteStop(srcId, dstId): drag-drop reorder.
  async function reorderStop(srcId: string, dstId: string): Promise<void> {
    if (srcId === dstId) return;
    const ids = active.map((v) => v.id);
    const srcIdx = ids.indexOf(srcId);
    const dstIdx = ids.indexOf(dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    ids.splice(srcIdx, 1);
    ids.splice(dstIdx, 0, srcId);
    const byId = new Map(active.map((v) => [v.id, v]));
    setActive(ids.map((id) => byId.get(id)!).filter(Boolean));
    setOsrm(null);
    await persist(ids);
  }

  // removeRouteStop: keluarkan dari rute (jadi bank).
  async function removeStop(pid: string): Promise<void> {
    const v = active.find((x) => x.id === pid);
    if (!v) return;
    const next = active.filter((x) => x.id !== pid);
    setActive(next);
    setBank([...bank, v]);
    setOsrm(null);
    await persist(next.map((x) => x.id));
  }

  // addRouteStop: masukkan bank stop ke akhir rute.
  async function addStop(pid: string): Promise<void> {
    const v = bank.find((x) => x.id === pid);
    if (!v) return;
    const next = [...active, v];
    setActive(next);
    setBank(bank.filter((x) => x.id !== pid));
    setOsrm(null);
    await persist(next.map((x) => x.id));
  }

  async function resetRute(): Promise<void> {
    if (!confirm(`Hapus urutan rute tersimpan untuk ${tanggal}? Stop akan kembali ke default.`))
      return;
    const res = await resetRuteAction(tanggal);
    if (!res.ok) {
      setNotice(`⚠️ Gagal mereset: ${res.error}`);
      return;
    }
    // Kembali ke default: semua eligible jadi active (pola getRouteState
    // tanpa saved).
    setActive([...active, ...bank]);
    setBank([]);
    setOsrm(null);
    setNotice("Urutan rute direset.");
  }

  // urutkanTerdekat — verbatim greedy nearest-neighbor from reference ~3022:
  // mulai dari depot (kalau ada) atau stop pertama, pilih unvisited terdekat
  // berulang. Menggabungkan active + bank biar bank ikut terurut.
  async function sortNearest(): Promise<void> {
    const semua = [...active, ...bank];
    if (semua.length < 2) {
      setNotice("⚠️ Minimal 2 stop untuk diurut.");
      return;
    }
    const hasDepot = depot && depot.lat && depot.lng;
    let cursor: { lat: number; lng: number } = hasDepot
      ? { lat: depot.lat, lng: depot.lng }
      : semua[0]!;
    const sisa = semua.slice();
    const urut: RuteStop[] = [];
    if (!hasDepot) {
      urut.push(sisa.shift()!);
    }
    while (sisa.length) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < sisa.length; i++) {
        const d = haversineMeter(cursor, sisa[i]!);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const nxt = sisa.splice(bestIdx, 1)[0]!;
      urut.push(nxt);
      cursor = nxt;
    }
    setActive(urut);
    setBank([]);
    setOsrm(null);
    await persist(
      urut.map((v) => v.id),
      `🧭 Diurutkan dari terdekat${hasDepot ? " (mulai dari Gudang)" : " (mulai dari stop pertama)"}`,
    );
  }

  // tarikRuteJalanan — ports reference ~3095 (OSRM router.project-osrm.org,
  // overview=full, geometries=geojson). Tanpa leaflet, polyline tidak
  // digambar — hanya jarak/durasi yang ditampilkan.
  async function fetchRoadRoute(): Promise<void> {
    const points: { lat: number; lng: number }[] = [];
    if (depot && depot.lat && depot.lng) points.push({ lat: depot.lat, lng: depot.lng });
    active.forEach((v) => points.push({ lat: v.lat, lng: v.lng }));
    if (points.length < 2) {
      setNotice("⚠️ Minimal 2 titik (depot + 1 stop, atau 2 stop).");
      return;
    }
    setOsrmLoading(true);
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();
      if (!data.routes || !data.routes.length) throw new Error("Tidak ada rute");
      const route = data.routes[0];
      setOsrm({
        distanceKm: route.distance / 1000,
        durationMin: Math.round(route.duration / 60),
      });
      setNotice(`🛣️ Rute jalanan: ${(route.distance / 1000).toFixed(1)} km · ${Math.round(route.duration / 60)} mnt`);
    } catch {
      setNotice("⚠️ Gagal tarik rute (cek koneksi internet).");
    } finally {
      setOsrmLoading(false);
    }
  }

  function exportGmaps(): void {
    const pts: { lat: number; lng: number }[] = [];
    if (depot && depot.lat && depot.lng) pts.push({ lat: depot.lat, lng: depot.lng });
    active.forEach((v) => pts.push({ lat: v.lat, lng: v.lng }));
    if (pts.length < 2) {
      setNotice("⚠️ Butuh minimal 2 titik untuk rute.");
      return;
    }
    const MAX = 10;
    let usePts = pts;
    if (pts.length > MAX) {
      if (
        !confirm(
          `Rute punya ${pts.length} titik — Google Maps maks ${MAX} sekali jalan. ${pts.length - MAX} titik terakhir akan dipotong. Lanjutkan?`,
        )
      )
        return;
      usePts = pts.slice(0, MAX);
    }
    window.open(buildGmapsUrl(usePts), "_blank", "noopener");
    setNotice("🗺️ Membuka Google Maps...");
  }

  function onDepotSaved(d: DepotInput): void {
    setDepot({ nama: d.nama, alamat: d.alamat, lat: d.lat, lng: d.lng, mapsLink: d.mapsLink });
    setDepotOpen(false);
    setNotice("📍 Gudang disimpan.");
  }

  const allPts: { lat: number; lng: number }[] = [];
  if (depot && depot.lat && depot.lng) allPts.push({ lat: depot.lat, lng: depot.lng });
  active.forEach((v) => allPts.push({ lat: v.lat, lng: v.lng }));
  const wholeRouteUrl = allPts.length >= 2 ? buildGmapsUrl(allPts.slice(0, 10)) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={() => void sortNearest()} disabled={saving} style={btnStyle}>
          🧭 Urutkan Terdekat
        </button>
        <button
          type="button"
          onClick={() => void fetchRoadRoute()}
          disabled={osrmLoading}
          style={btnStyle}
        >
          {osrmLoading ? "⏳ Menarik..." : "🛣️ Tarik Rute Jalanan"}
        </button>
        <button type="button" onClick={exportGmaps} style={btnStyle}>
          🗺️ Export Google Maps
        </button>
        <button type="button" onClick={() => void resetRute()} style={btnDangerStyle}>
          ♻️ Reset
        </button>
        <button type="button" onClick={() => setDepotOpen(true)} style={btnStyle}>
          🏠 {depot ? "Ubah Gudang" : "Set Gudang"}
        </button>
        {saving && <span style={{ fontSize: 12, color: "#64748B", alignSelf: "center" }}>Menyimpan…</span>}
      </div>

      {depot && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            color: "#92400E",
            marginBottom: 12,
          }}
        >
          🏠 <strong>{depot.nama || "Gudang"}</strong>
          {depot.alamat ? ` · ${depot.alamat}` : ""}
          {depot.lat || depot.lng ? (
            <>
              {" · "}
              <a
                href={depot.mapsLink || `https://maps.google.com/?q=${depot.lat},${depot.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#2563EB" }}
              >
                📍 Peta
              </a>
            </>
          ) : null}
        </div>
      )}

      {notice && (
        <p role="status" style={{ fontSize: 13, color: "#334155", background: "#F1F5F9", borderRadius: 8, padding: "8px 12px" }}>
          {notice}
        </p>
      )}

      {osrm && (
        <p style={{ fontSize: 13, color: "#1D4ED8" }}>
          🛣️ Jarak jalanan ±{osrm.distanceKm.toFixed(1)} km · ±{osrm.durationMin} mnt (OSRM).
        </p>
      )}

      {active.length === 0 && bank.length === 0 && (
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
          <div style={{ fontSize: 28, marginBottom: 8 }}>🗺️</div>
          <div style={{ fontWeight: 600 }}>Tidak ada stop</div>
          <div>Tidak ada pesanan belum-antar bertitik koordinat pada tanggal ini.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map((v, idx) => (
          <div
            key={v.id}
            draggable
            onDragStart={(e) => {
              setDragSrcId(v.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", v.id);
              } catch {
                /* Firefox fallback not needed */
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const src = dragSrcId;
              setDragSrcId(null);
              if (src) void reorderStop(src, v.id);
            }}
            onDragEnd={() => setDragSrcId(null)}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              padding: "10px 12px",
              opacity: dragSrcId === v.id ? 0.5 : 1,
            }}
          >
            <span title="Geser untuk ubah urutan" style={{ color: "#94A3B8", cursor: "grab" }}>
              ⋮⋮
            </span>
            <span
              style={{
                background: "#4F46E5",
                color: "#fff",
                borderRadius: "50%",
                width: 26,
                height: 26,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{v.nama}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748B",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {v.wilayah || v.alamat || v.noHp || ""}
              </div>
              {v.pesanan && (
                <div style={{ fontSize: 12, color: "#334155" }}>🛒 {v.pesanan}</div>
              )}
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {v.totalHarga && <strong style={{ color: "#0F172A" }}>{v.totalHarga}</strong>}
                {" · "}
                <a href={stopMapsUrl(v)} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>
                  📍 Peta
                </a>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                title="Naik"
                aria-label="Naik"
                disabled={idx === 0}
                onClick={() => void moveStop(v.id, -1)}
                style={smallBtnStyle}
              >
                ▲
              </button>
              <button
                type="button"
                title="Turun"
                aria-label="Turun"
                disabled={idx === active.length - 1}
                onClick={() => void moveStop(v.id, 1)}
                style={smallBtnStyle}
              >
                ▼
              </button>
            </div>
            {v.noHpIntl && (
              <a
                href={waLinkRute(v.noHpIntl)}
                target="_blank"
                rel="noopener"
                title="Chat WhatsApp (template kabari kirim)"
                aria-label="Chat WhatsApp"
                style={{ fontSize: 18, textDecoration: "none" }}
              >
                💬
              </a>
            )}
            <button
              type="button"
              title="Keluarkan dari rute"
              aria-label="Keluarkan"
              onClick={() => void removeStop(v.id)}
              style={smallBtnStyle}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {bank.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>
            📦 Belum di rute ({bank.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bank.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  background: "#F8FAFC",
                  border: "1px dashed #CBD5E1",
                  borderRadius: 12,
                  padding: "8px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{v.nama}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#64748B",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {v.wilayah || v.alamat || v.noHp || ""}
                  </div>
                </div>
                <button
                  type="button"
                  title="Masukkan ke rute"
                  aria-label="Tambah"
                  onClick={() => void addStop(v.id)}
                  style={addBtnStyle}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {wholeRouteUrl && (
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href={wholeRouteUrl} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>
            🗺️ Buka seluruh rute di Google Maps
          </a>
          <span style={{ color: "#94A3B8" }}> (maks 10 titik pertama)</span>
        </p>
      )}

      {depotOpen && (
        <DepotModal
          initial={depot}
          onClose={() => setDepotOpen(false)}
          onSaved={onDepotSaved}
        />
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
  background: "#fff",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  cursor: "pointer",
  color: "#0F172A",
};

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  color: "#DC2626",
  borderColor: "#FECACA",
};

const smallBtnStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "2px 8px",
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  cursor: "pointer",
  color: "#334155",
};

const addBtnStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: "4px 12px",
  background: "#16A34A",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  color: "#fff",
};
