import PromoClient, { type PromoRow } from "./PromoClient";
import { listPromos } from "@/lib/das-client";

export const dynamic = "force-dynamic";

export default async function PromoPage() {
  let promos: PromoRow[] = [];
  let loadError = "";

  try {
    const resp = await listPromos();
    promos = (resp.promos ?? []).map((p) => ({
      code: p.code,
      type: p.type,
      value: p.value,
      active: p.active,
      expiresIso:
        p.expires instanceof Date && !isNaN(p.expires.getTime())
          ? p.expires.toISOString()
          : null,
      minKg: p.minKg,
      maxKg: p.maxKg,
      minKgUtuh: p.minKgUtuh,
      minKgKupas: p.minKgKupas,
      minSubtotal: p.minSubtotal,
      maxUses: Number(p.maxUses),
      usedCount: Number(p.usedCount),
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <section>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
        Promo
      </h1>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Kode promo yang bisa dipakai kastamer di form pemesanan. usedCount hanya
        dibaca (berubah saat pembayaran dikonfirmasi).
      </p>
      {loadError && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          Gagal memuat daftar promo: {loadError}
        </p>
      )}
      <PromoClient initial={promos} />
    </section>
  );
}
