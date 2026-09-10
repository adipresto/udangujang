import OrderForm from "@/components/OrderForm";
import { getHarga } from "@/lib/das-client";
import { DEFAULT_HARGA, type HargaConfig } from "@/lib/pricing";
import "./uua.css";

export const dynamic = "force-dynamic";

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

export default async function PesanPage() {
  let hargaAwal: HargaConfig = DEFAULT_HARGA;
  try {
    const resp = await getHarga();
    hargaAwal = hargaFromDas(resp) ?? DEFAULT_HARGA;
  } catch (err) {
    console.warn("GetHarga gagal, pakai harga default:", err instanceof Error ? err.message : String(err));
  }

  return (
    <main>
      <header>
        <div className="header-top">
          <h1>Form Pesanan</h1>
          <p>Isi data di bawah, kami akan segera konfirmasi via WhatsApp</p>
        </div>
      </header>
      <OrderForm hargaAwal={hargaAwal} />
    </main>
  );
}
