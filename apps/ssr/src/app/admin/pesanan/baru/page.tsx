import BaruClient from "./BaruClient";
import { getHarga } from "@/lib/das-client";
import { DEFAULT_HARGA, type HargaConfig } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Guard admin ikut layout apps/ssr/src/app/admin/layout.tsx (Firebase
// session + allowlist) — tidak ada guard tambahan di sini. Pola fetch
// harga + fallback default sama persis dengan /pesan (pesan/page.tsx).
function hargaFromDas(resp: Awaited<ReturnType<typeof getHarga>>): HargaConfig | null {
  const h = resp.harga;
  if (!h?.udang || !h?.cumi || !h?.kembung || !h?.teriNasi || !h?.ongkir) return null;
  return {
    udang: {
      perKg: Number(h.udang.perKg),
      setengahKg: Number(h.udang.setengahKg),
      jasaKupasPerKg: Number(h.udang.jasaKupasPerKg),
      kupasSetengahSurcharge: Number(h.udang.kupasSetengahSurcharge),
    },
    cumi: { perKg: Number(h.cumi.perKg), setengahKg: Number(h.cumi.setengahKg) },
    kembung: {
      perKg: Number(h.kembung.perKg),
      setengahKg: Number(h.kembung.setengahKg),
      jasaBersihPerKg: Number(h.kembung.jasaBersihPerKg),
    },
    teriNasi: {
      pricePerPack: Number(h.teriNasi.pricePerPack),
      kgPerPack: h.teriNasi.kgPerPack,
      hargaSatuKg: Number(h.teriNasi.hargaSatuKg),
    },
    ongkir: {
      normal: Number(h.ongkir.normal),
      bogorTangerang: Number(h.ongkir.bogorTangerang),
      minKgBogorTangerang: h.ongkir.minKgBogorTangerang,
      minKgDefault: h.ongkir.minKgDefault,
    },
  };
}

export default async function PesananBaruPage() {
  let hargaAwal: HargaConfig = DEFAULT_HARGA;
  try {
    const resp = await getHarga();
    hargaAwal = hargaFromDas(resp) ?? DEFAULT_HARGA;
  } catch (err) {
    console.warn("GetHarga gagal, pakai harga default:", err instanceof Error ? err.message : String(err));
  }

  return (
    <section>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
        Tambah Pesanan
      </h1>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Cari kastamer lama untuk pre-fill, atau isi baru lalu simpan.
      </p>
      <BaruClient hargaAwal={hargaAwal} />
    </section>
  );
}
