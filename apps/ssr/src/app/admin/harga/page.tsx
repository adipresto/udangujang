import HargaForm from "./HargaForm";
import { HARGA_FIELDS } from "./harga-fields";
import { getHarga } from "@/lib/das-client";

export const dynamic = "force-dynamic";

export default async function HargaPage() {
  let values: Record<string, number> = Object.fromEntries(
    HARGA_FIELDS.map((p) => [p, 0]),
  );
  let updatedAtIso: string | null = null;
  let loadError = "";

  try {
    const resp = await getHarga();
    const h = resp.harga;
    if (h?.udang && h?.cumi && h?.kembung && h?.teriNasi && h?.ongkir) {
      values = {
        "udang.perKg": Number(h.udang.perKg),
        "udang.setengahKg": Number(h.udang.setengahKg),
        "udang.jasaKupasPerKg": Number(h.udang.jasaKupasPerKg),
        "udang.kupasSetengahSurcharge": Number(h.udang.kupasSetengahSurcharge),
        "cumi.perKg": Number(h.cumi.perKg),
        "cumi.setengahKg": Number(h.cumi.setengahKg),
        "kembung.perKg": Number(h.kembung.perKg),
        "kembung.setengahKg": Number(h.kembung.setengahKg),
        "kembung.jasaBersihPerKg": Number(h.kembung.jasaBersihPerKg),
        "teriNasi.pricePerPack": Number(h.teriNasi.pricePerPack),
        "teriNasi.kgPerPack": h.teriNasi.kgPerPack,
        "teriNasi.hargaSatuKg": Number(h.teriNasi.hargaSatuKg),
        "ongkir.normal": Number(h.ongkir.normal),
        "ongkir.bogorTangerang": Number(h.ongkir.bogorTangerang),
        "ongkir.minKgBogorTangerang": h.ongkir.minKgBogorTangerang,
        "ongkir.minKgDefault": h.ongkir.minKgDefault,
      };
      const u = h.updatedAt;
      updatedAtIso = u instanceof Date && !isNaN(u.getTime()) ? u.toISOString() : null;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <section>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
        Harga
      </h1>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Ubah harga live — perubahan langsung berlaku di form pemesanan.
      </p>
      {loadError && (
        <p role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
          Gagal memuat harga: {loadError}
        </p>
      )}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <HargaForm initial={{ values, updatedAtIso }} />
      </div>
    </section>
  );
}
