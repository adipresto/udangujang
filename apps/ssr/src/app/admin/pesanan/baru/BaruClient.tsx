"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OrderForm, { type OrderFormKastamerAwal } from "@/components/OrderForm";
import type { HargaConfig } from "@/lib/pricing";
import { getKastamerPrefill, searchKastamer, type KastamerHit } from "./actions";

const EMPTY: OrderFormKastamerAwal = { nama: "", noHp: "", alamat: "", mapsLink: "" };

export default function BaruClient({ hargaAwal }: { hargaAwal: HargaConfig }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KastamerHit[]>([]);
  const [dropOpen, setDropOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [prefill, setPrefill] = useState<OrderFormKastamerAwal>(EMPTY);
  const [prefillMsg, setPrefillMsg] = useState("");
  const [pesananId, setPesananId] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search ala oninput reorder-search reference (~1219): tiap
  // ketikan dijeda 250ms sebelum memanggil server action searchKastamer.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setDropOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchKastamer(q);
        setHits(res);
        setDropOpen(true);
      } catch {
        setHits([]);
        setDropOpen(false);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  async function pilihKastamer(hit: KastamerHit) {
    setDropOpen(false);
    setQuery("");
    setPrefillMsg("Memuat data kastamer...");
    const res = await getKastamerPrefill(hit.noHp);
    if (!res.ok) {
      setPrefillMsg(`Gagal memuat kastamer: ${res.error}`);
      return;
    }
    setPrefill(res.prefill);
    setPrefillMsg(`Kastamer "${res.prefill.nama}" dipilih — isi detail pesanan baru.`);
  }

  function isiBaru() {
    setPrefill(EMPTY);
    setQuery("");
    setHits([]);
    setDropOpen(false);
    setPrefillMsg("");
    setPesananId("");
  }

  function handleSukses(id: string) {
    setPesananId(id);
    router.push("/admin/pesanan");
  }

  return (
    <div>
      <section style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <label htmlFor="cari-kastamer" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          🔁 Cari Kastamer Lama
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              id="cari-kastamer"
              style={{ width: "100%", border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
              placeholder="Ketik nama atau no HP… (min. 1 huruf)"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (hits.length > 0) setDropOpen(true);
              }}
            />
            {dropOpen && hits.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, marginTop: 4, zIndex: 20, overflow: "hidden" }}>
                {hits.map((h) => (
                  <button
                    key={h.noHp}
                    type="button"
                    onClick={() => pilihKastamer(h)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: "1px solid #F1F5F9", background: "transparent", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{h.nama}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{h.noHp}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={isiBaru}
            style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#F8FAFC", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Isi baru
          </button>
        </div>
        {searching && <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 0" }}>Mencari...</p>}
        {prefillMsg && <p style={{ fontSize: 12, color: "#334155", margin: "6px 0 0" }}>{prefillMsg}</p>}
        {pesananId && (
          <p style={{ fontSize: 12, color: "#059669", margin: "6px 0 0" }}>
            Pesanan tersimpan (#{pesananId}).
          </p>
        )}
      </section>

      <OrderForm hargaAwal={hargaAwal} mode="admin" initialKastamer={prefill} onSukses={handleSukses} />
    </div>
  );
}
