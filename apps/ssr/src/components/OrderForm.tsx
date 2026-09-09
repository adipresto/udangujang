"use client";

import { useEffect, useMemo, useState } from "react";
import { checkPromo, submitPesanan } from "@/app/actions/submitPesanan";
import {
  checkPromoEligibility,
  computeOrder,
  fmt,
  getAreaInfo,
  isBeratMinMet,
  parseBeratVal,
  REKENING,
  roundHalf,
  roundQuarter,
  type HargaConfig,
  type PromoConstraints,
} from "@/lib/pricing";
import {
  buildWaMessage,
  buildWaUrl,
  formatTanggalKirim,
  normalizePenerima,
} from "@/lib/wa-message";

export interface OrderFormKastamerAwal {
  nama: string;
  noHp: string;
  alamat: string;
  mapsLink: string;
}

export interface OrderFormProps {
  hargaAwal: HargaConfig;
  mode?: "publik" | "admin";
  initialKastamer?: OrderFormKastamerAwal;
  onSukses?: (pesananId: string) => void;
}

const BAYAR_OPTIONS = [
  { value: "Transfer - Jago", label: "Jago", desc: "Bank Jago · transfer antar bank" },
  { value: "Transfer - BCA", label: "BCA", desc: "Bank Central Asia" },
  { value: "Transfer - OVO", label: "OVO", desc: "Dompet digital OVO" },
  { value: "Cash on Delivery (COD)", label: "Cash on Delivery", desc: "Bayar tunai saat pesanan tiba" },
];

function stepHalf(raw: string, delta: number): string {
  const cur = parseBeratVal(raw) || 0;
  const next = Math.max(0, Math.floor((cur + delta) * 2) / 2);
  return String(next);
}

function stepQuarter(raw: string, delta: number, pack: number): string {
  const cur = parseBeratVal(raw) || 0;
  const n = Math.max(0, Math.round((cur + delta) * 4) / 4);
  const norm = n > 0 && n < pack ? pack : n;
  return String(norm);
}

function blurHalf(raw: string): string {
  const v = parseBeratVal(raw);
  if (isNaN(v)) return "0";
  return String(Math.max(0, Math.floor(v * 2) / 2));
}

function blurQuarter(raw: string, pack: number): string {
  const v = parseBeratVal(raw);
  if (isNaN(v)) return "0";
  const n = Math.max(0, Math.round(v * 4) / 4);
  return String(n > 0 && n < pack ? pack : n);
}

export default function OrderForm({
  hargaAwal,
  mode = "publik",
  initialKastamer,
  onSukses,
}: OrderFormProps) {
  const [harga] = useState<HargaConfig>(hargaAwal);
  const [kgUtuh, setKgUtuh] = useState("0");
  const [kgKupas, setKgKupas] = useState("0");
  const [kgCumi, setKgCumi] = useState("0");
  const [kgKembung, setKgKembung] = useState("0");
  const [kgTeriNasi, setKgTeriNasi] = useState("0");
  const [bersihKembung, setBersihKembung] = useState(false);
  const [jenisKupas, setJenisKupas] = useState("Peel Tail-On");
  const [nama, setNama] = useState("");
  const [penerima, setPenerima] = useState("");
  const [alamat, setAlamat] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [pinLat, setPinLat] = useState("");
  const [pinLng, setPinLng] = useState("");
  const [bayar, setBayar] = useState("");
  const [kodePromo, setKodePromo] = useState("");
  const [catatan, setCatatan] = useState("");
  const [tglKirim, setTglKirim] = useState("");
  const [promo, setPromo] = useState<PromoConstraints | null>(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [errors, setErrors] = useState<{ berat?: string; nama?: string; alamat?: string; bayar?: string }>({});
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  // Admin pre-fill: saat initialKastamer berubah (kastamer dipilih / Isi
  // baru), sinkronkan field identitas + alamat. Mode publik tidak pernah
  // menerima initialKastamer jadi tidak terpengaruh.
  useEffect(() => {
    if (!initialKastamer) return;
    setNama(initialKastamer.nama);
    setPenerima(initialKastamer.noHp);
    setAlamat(initialKastamer.alamat);
    setMapsLink(initialKastamer.mapsLink);
  }, [initialKastamer]);

  const berat = useMemo(
    () => ({
      kgUtuh: parseBeratVal(kgUtuh) || 0,
      kgKupas: parseBeratVal(kgKupas) || 0,
      kgCumi: parseBeratVal(kgCumi) || 0,
      kgKembung: parseBeratVal(kgKembung) || 0,
      kgTeriNasi: parseBeratVal(kgTeriNasi) || 0,
      bersihKembung,
    }),
    [kgUtuh, kgKupas, kgCumi, kgKembung, kgTeriNasi, bersihKembung],
  );

  const pin = useMemo(() => {
    const lat = parseFloat(pinLat);
    const lng = parseFloat(pinLng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  }, [pinLat, pinLng]);

  const areaInfo = useMemo(() => getAreaInfo(alamat, pin, harga), [alamat, pin, harga]);

  const calc = useMemo(() => {
    const subtotalOnly = computeOrder(berat, alamat, pin, harga, null);
    let aktif = promo;
    if (promo) {
      const elig = checkPromoEligibility(
        promo,
        berat.kgUtuh,
        berat.kgKupas,
        subtotalOnly.subtotal,
        berat.kgCumi + berat.kgKembung + berat.kgTeriNasi,
      );
      if (!elig.ok) aktif = null;
    }
    return { ...computeOrder(berat, alamat, pin, harga, aktif), promoAktif: aktif };
  }, [berat, alamat, pin, harga, promo]);

  const promoDropped = promo && !calc.promoAktif;
  const beratOk = isBeratMinMet(berat, alamat, pin, harga);

  const tglKirimMin = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  async function handleApplyPromo() {
    const kode = kodePromo.trim().toUpperCase();
    if (!kode) {
      setPromoMsg("Masukkan kode promo dulu.");
      return;
    }
    setPromoChecking(true);
    setPromoMsg("Mengecek kode...");
    try {
      const subtotalNow = computeOrder(berat, alamat, pin, harga, null).subtotal;
      const res = await checkPromo({
        kodePromo: kode,
        kgUtuh: berat.kgUtuh,
        kgKupas: berat.kgKupas,
        kgExtra: berat.kgCumi + berat.kgKembung + berat.kgTeriNasi,
        subtotal: subtotalNow,
      });
      if (!res.ok) {
        setPromo(null);
        setPromoMsg(res.error);
        return;
      }
      const candidate = res.promo;
      const elig = checkPromoEligibility(
        candidate,
        berat.kgUtuh,
        berat.kgKupas,
        subtotalNow,
        berat.kgCumi + berat.kgKembung + berat.kgTeriNasi,
      );
      if (!elig.ok) {
        setPromo(null);
        setPromoMsg("❌ Kode butuh " + elig.reason);
        return;
      }
      setPromo(candidate);
      if (candidate.type === "discount") {
        setPromoMsg(`✅ Promo aktif! Potongan Rp${Math.trunc(candidate.value).toLocaleString("id-ID")} berhasil diterapkan.`);
      } else if (candidate.type === "free_product") {
        setPromoMsg("✅ Promo aktif! Produk gratis berhasil diterapkan.");
      } else {
        setPromoMsg("✅ Promo aktif! Ongkir gratis berhasil diterapkan.");
      }
    } catch (err) {
      setPromo(null);
      setPromoMsg(err instanceof Error ? err.message : "Gagal mengecek promo.");
    } finally {
      setPromoChecking(false);
    }
  }

  function handlePin() {
    const lat = parseFloat(pinLat);
    const lng = parseFloat(pinLng);
    if (!isFinite(lat) || !isFinite(lng)) {
      setSubmitMsg("Isi koordinat pin (lat,lng) dulu, atau tempel link Google Maps.");
      return;
    }
    setMapsLink(`https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`);
    setSubmitMsg("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!beratOk) nextErrors.berat = areaInfo.area === "bogor_tangerang"
      ? "Khusus area Bogor / Tangerang, total pesanan minimal 2 kg."
      : "Total pesanan minimal 0,5 kg.";
    if (!nama.trim()) nextErrors.nama = "Nama tidak boleh kosong.";
    if (!alamat.trim()) nextErrors.alamat = "Alamat detail tidak boleh kosong.";
    if (!bayar) nextErrors.bayar = "Pilih metode pembayaran.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const penerimaNorm = normalizePenerima(penerima);
    const tglKirimFormatted = tglKirim ? formatTanggalKirim(tglKirim) : "";

    // Mode admin: SKIP redirect WhatsApp — admin tidak chat ke diri sendiri.
    if (mode === "publik") {
      const message = buildWaMessage({
        nama: nama.trim(),
        penerima: penerimaNorm,
        alamat: alamat.trim(),
        mapsLink: mapsLink.trim(),
        kgUtuh: berat.kgUtuh,
        kgKupas: berat.kgKupas,
        kgCumi: berat.kgCumi,
        kgKembung: berat.kgKembung,
        kgTeriNasi: berat.kgTeriNasi,
        bersihKembung,
        jenisKupas,
        catatan: catatan.trim(),
        tglKirimFormatted,
        bayar,
        promoKode: calc.promoAktif ? calc.promoAktif.kode : null,
        calc,
      });
      window.open(buildWaUrl(message), "_blank");
    }

    const payload = {
      kgUtuh,
      kgKupas,
      kgCumi,
      kgKembung,
      kgTeriNasi,
      bersihKembung,
      jenisKupas,
      nama: nama.trim(),
      penerima,
      alamat: alamat.trim(),
      mapsLink: mapsLink.trim(),
      pinLat: pin ? pin.lat : null,
      pinLng: pin ? pin.lng : null,
      bayar,
      kodePromo: calc.promoAktif ? calc.promoAktif.kode : "",
      catatan: catatan.trim(),
      tglKirim,
      harga,
    };
    setSubmitBusy(true);
    setSubmitMsg(mode === "admin" ? "Menyimpan pesanan..." : "");
    submitPesanan(payload).then(
      (res) => {
        setSubmitBusy(false);
        if (!res.ok) {
          if (mode === "admin") setSubmitMsg(`Gagal menyimpan: ${res.error}`);
          else console.warn("submitPesanan gagal:", res.error);
          return;
        }
        if (mode === "admin") {
          setSubmitMsg(`Pesanan tersimpan (#${res.pesananId}).`);
          onSukses?.(res.pesananId);
        } else {
          setSubmitMsg(`Pesanan tersimpan (#${res.pesananId}). Konfirmasi via WhatsApp ya!`);
        }
      },
      (err) => {
        setSubmitBusy(false);
        const msg = err instanceof Error ? err.message : String(err);
        if (mode === "admin") setSubmitMsg(`Gagal menyimpan: ${msg}`);
        else console.warn("submitPesanan gagal:", msg);
      },
    );
  }

  const stepperCls = "flex items-center gap-1";
  const btnCls = "w-8 h-8 rounded border border-gray-300 text-lg leading-none disabled:opacity-40";
  const inputCls = "w-20 rounded border border-gray-300 px-2 py-1 text-right";

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto flex max-w-xl flex-col gap-6 p-4">
      <section>
        <h2 className="mb-2 text-lg font-bold">1. Pesanan</h2>
        <div className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">🦐 Udang Utuh</span>
            <div className={stepperCls}>
              <button type="button" className={btnCls} disabled={(parseBeratVal(kgUtuh) || 0) <= 0} onClick={() => setKgUtuh(stepHalf(kgUtuh, -0.5))} aria-label="Kurangi berat udang utuh">−</button>
              <input className={inputCls} inputMode="decimal" value={kgUtuh} onChange={(e) => setKgUtuh(e.target.value)} onBlur={(e) => setKgUtuh(blurHalf(e.target.value))} aria-label="Berat udang utuh dalam kg" />
              <span>kg</span>
              <button type="button" className={btnCls} onClick={() => setKgUtuh(stepHalf(kgUtuh, 0.5))} aria-label="Tambah berat udang utuh">+</button>
            </div>
          </div>
          <p className="mb-4 text-sm text-gray-500">{fmt(harga.udang.perKg)}/kg · ½kg {fmt(harga.udang.setengahKg)}</p>

          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">✂️ Udang Kupas</span>
            <div className={stepperCls}>
              <button type="button" className={btnCls} disabled={(parseBeratVal(kgKupas) || 0) <= 0} onClick={() => setKgKupas(stepHalf(kgKupas, -0.5))} aria-label="Kurangi berat udang kupas">−</button>
              <input className={inputCls} inputMode="decimal" value={kgKupas} onChange={(e) => setKgKupas(e.target.value)} onBlur={(e) => setKgKupas(blurHalf(e.target.value))} aria-label="Berat udang kupas dalam kg" />
              <span>kg</span>
              <button type="button" className={btnCls} onClick={() => setKgKupas(stepHalf(kgKupas, 0.5))} aria-label="Tambah berat udang kupas">+</button>
            </div>
          </div>
          <p className="mb-2 text-sm text-gray-500">{fmt(harga.udang.perKg + harga.udang.jasaKupasPerKg)}/kg · ½kg {fmt(harga.udang.setengahKg + harga.udang.kupasSetengahSurcharge)}</p>
          <div className="mb-2 flex gap-4">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="jenisKupas" value="Peel Tail-On" checked={jenisKupas === "Peel Tail-On"} onChange={(e) => setJenisKupas(e.target.value)} />
              Peel Tail-On
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" name="jenisKupas" value="Easy Peel" checked={jenisKupas === "Easy Peel"} onChange={(e) => setJenisKupas(e.target.value)} />
              Easy Peel
            </label>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">🦑 Cumi Bangka</span>
            <div className={stepperCls}>
              <button type="button" className={btnCls} disabled={(parseBeratVal(kgCumi) || 0) <= 0} onClick={() => setKgCumi(stepHalf(kgCumi, -0.5))} aria-label="Kurangi berat cumi">−</button>
              <input className={inputCls} inputMode="decimal" value={kgCumi} onChange={(e) => setKgCumi(e.target.value)} onBlur={(e) => setKgCumi(blurHalf(e.target.value))} aria-label="Berat cumi dalam kg" />
              <span>kg</span>
              <button type="button" className={btnCls} onClick={() => setKgCumi(stepHalf(kgCumi, 0.5))} aria-label="Tambah berat cumi">+</button>
            </div>
          </div>
          <p className="mb-4 text-sm text-gray-500">{fmt(harga.cumi.perKg)}/kg · ½kg {fmt(harga.cumi.setengahKg)}</p>

          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">🐟 Ikan Kembung</span>
            <div className={stepperCls}>
              <button type="button" className={btnCls} disabled={(parseBeratVal(kgKembung) || 0) <= 0} onClick={() => setKgKembung(stepHalf(kgKembung, -0.5))} aria-label="Kurangi berat ikan kembung">−</button>
              <input className={inputCls} inputMode="decimal" value={kgKembung} onChange={(e) => setKgKembung(e.target.value)} onBlur={(e) => setKgKembung(blurHalf(e.target.value))} aria-label="Berat ikan kembung dalam kg" />
              <span>kg</span>
              <button type="button" className={btnCls} onClick={() => setKgKembung(stepHalf(kgKembung, 0.5))} aria-label="Tambah berat ikan kembung">+</button>
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-500">{fmt(harga.kembung.perKg)}/kg · ½kg {fmt(harga.kembung.setengahKg)}</p>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bersihKembung} disabled={(parseBeratVal(kgKembung) || 0) <= 0} onChange={(e) => setBersihKembung(e.target.checked)} />
            Bersihkan ikan (lepas insang &amp; isi perut) — +{fmt(harga.kembung.jasaBersihPerKg)}/kg
          </label>
          <p className="mb-4 text-xs text-gray-500">Gratis untuk 0,5 kg pertama, kelebihannya +{fmt(harga.kembung.jasaBersihPerKg)}/kg</p>

          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold">🐟 Teri Nasi</span>
            <div className={stepperCls}>
              <button type="button" className={btnCls} disabled={(parseBeratVal(kgTeriNasi) || 0) <= 0} onClick={() => setKgTeriNasi(stepQuarter(kgTeriNasi, -0.25, harga.teriNasi.kgPerPack))} aria-label="Kurangi berat teri nasi">−</button>
              <input className={inputCls} inputMode="decimal" value={kgTeriNasi} onChange={(e) => setKgTeriNasi(e.target.value)} onBlur={(e) => setKgTeriNasi(blurQuarter(e.target.value, harga.teriNasi.kgPerPack))} aria-label="Berat teri nasi dalam kg" />
              <span>kg</span>
              <button type="button" className={btnCls} onClick={() => setKgTeriNasi(stepQuarter(kgTeriNasi, 0.25, harga.teriNasi.kgPerPack))} aria-label="Tambah berat teri nasi">+</button>
            </div>
          </div>
          <p className="text-sm text-gray-500">{fmt(harga.teriNasi.pricePerPack)}/{harga.teriNasi.kgPerPack * 1000}gr · 1kg {fmt(harga.teriNasi.hargaSatuKg)} · kelipatan {harga.teriNasi.kgPerPack * 1000}gr</p>

          <p className="mt-3 text-sm text-gray-500">
            {areaInfo.area === "bogor_tangerang" ? "Area Bogor / Tangerang — min. total 2 kg." : "Min. total 0,5 kg. Boleh isi salah satu atau semuanya."}
          </p>
          {errors.berat && <p className="mt-1 text-sm text-red-600">{errors.berat}</p>}
        </div>

        <div className="mt-3 rounded border p-4">
          <h3 className="mb-2 font-semibold">🧾 Ringkasan Pesanan</h3>
          {berat.kgUtuh > 0 && <NotaRow label={`Udang utuh ${berat.kgUtuh} kg`} value={fmt(calc.hargaUtuh)} />}
          {berat.kgKupas > 0 && <NotaRow label={`Udang kupas ${berat.kgKupas} kg · ${jenisKupas}`} value={fmt(calc.hargaKupas)} />}
          {berat.kgCumi > 0 && <NotaRow label={`Cumi ${berat.kgCumi} kg`} value={fmt(calc.hargaCumi)} />}
          {berat.kgKembung > 0 && <NotaRow label={`Ikan kembung ${berat.kgKembung} kg${bersihKembung ? " · dibersihkan" : ""}`} value={fmt(calc.hargaKembung)} />}
          {berat.kgTeriNasi > 0 && <NotaRow label={`Teri Nasi ${berat.kgTeriNasi} kg`} value={fmt(calc.hargaTeriNasi)} />}
          <NotaRow label="Ongkos kirim" value={calc.ongkirFinal === 0 ? "GRATIS 🎉" : `+${fmt(calc.ongkir)}`} />
          {calc.promoAktif && (
            <NotaRow label={`Promo (${calc.promoAktif.kode})`} value={`-${fmt(calc.promoAktif.type === "free_shipping" ? calc.ongkir : calc.diskon)}`} />
          )}
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded border border-gray-300 px-3 py-1 text-sm uppercase"
              placeholder="Kode promo (opsional)"
              value={kodePromo}
              onChange={(e) => setKodePromo(e.target.value.toUpperCase())}
              aria-label="Kode promo"
            />
            <button type="button" onClick={handleApplyPromo} disabled={promoChecking} className="rounded bg-yellow-700 px-3 py-1 text-sm font-bold text-white disabled:opacity-50">
              Pakai
            </button>
          </div>
          {promoMsg && <p className="mt-1 text-xs text-gray-600">{promoMsg}</p>}
          {promoDropped && <p className="mt-1 text-xs text-red-600">⚠️ Promo dilepas: berat/subtotal tidak lagi memenuhi syarat.</p>}
          <div className="mt-2 flex justify-between border-t pt-2 font-bold">
            <span>Total</span>
            <span>{fmt(calc.total)}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">2. Identitas</h2>
        <div className="rounded border p-4">
          <label htmlFor="nama" className="mb-1 block text-sm font-semibold">Nama *</label>
          <input id="nama" className="w-full rounded border border-gray-300 px-3 py-2" placeholder="Nama panggilan" autoComplete="name" value={nama} onChange={(e) => setNama(e.target.value)} />
          {errors.nama && <p className="mt-1 text-sm text-red-600">{errors.nama}</p>}
          <label htmlFor="penerima" className="mb-1 mt-3 block text-sm font-semibold">Nomor Penerima (opsional)</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">+62</span>
            <input id="penerima" type="tel" inputMode="numeric" className="w-full rounded border border-gray-300 px-3 py-2" placeholder="81234567890" autoComplete="tel" value={penerima} onChange={(e) => setPenerima(e.target.value)} />
          </div>
          <p className="mt-1 text-xs text-gray-500">Isi jika pesanan dikirim ke orang lain. Jika untuk diri sendiri, kosongkan saja.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">3. Alamat</h2>
        <div className="rounded border p-4">
          <label htmlFor="alamat" className="mb-1 block text-sm font-semibold">Alamat Detail *</label>
          <textarea id="alamat" rows={3} className="w-full rounded border border-gray-300 px-3 py-2" placeholder="Contoh: Jl. Mawar No. 5, RT 03/RW 02, Kel. Sukajadi, Kec. Bandung Utara" value={alamat} onChange={(e) => setAlamat(e.target.value)} />
          {errors.alamat && <p className="mt-1 text-sm text-red-600">{errors.alamat}</p>}
          <div className="mt-3">
            <span className="mb-1 block text-sm font-semibold">Pin Lokasi (opsional)</span>
            <input className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm" placeholder="Link Google Maps muncul di sini…" value={mapsLink} readOnly aria-label="Link Google Maps pin lokasi" />
            <div className="mt-2 flex gap-2">
              <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" inputMode="decimal" placeholder="lat, cth -6.150" value={pinLat} onChange={(e) => setPinLat(e.target.value)} aria-label="Latitude pin lokasi" />
              <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" inputMode="decimal" placeholder="lng, cth 106.900" value={pinLng} onChange={(e) => setPinLng(e.target.value)} aria-label="Longitude pin lokasi" />
              <button type="button" onClick={handlePin} className="shrink-0 rounded border px-3 py-1 text-sm font-semibold">📍 Pin Lokasi</button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Cukup pin titik — alamat akan terisi otomatis. Membantu kurir menemukan lokasimu lebih akurat.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">4. Pembayaran</h2>
        <div className="rounded border p-4">
          <span className="mb-2 block text-sm font-semibold">Metode Pembayaran *</span>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Metode pembayaran">
            {BAYAR_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                <input type="radio" name="bayar" value={opt.value} checked={bayar === opt.value} onChange={(e) => setBayar(e.target.value)} />
                <span>
                  <span className="font-semibold">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.desc}{REKENING[opt.value] ? ` · ${REKENING[opt.value]}` : ""}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.bayar && <p className="mt-1 text-sm text-red-600">{errors.bayar}</p>}
          <label htmlFor="kodePromoBayar" className="mb-1 mt-3 block text-sm font-semibold">Kode Promo (opsional)</label>
          <input id="kodePromoBayar" className="w-full rounded border border-gray-300 px-3 py-2 uppercase" placeholder="Kode promo" value={kodePromo} onChange={(e) => setKodePromo(e.target.value.toUpperCase())} />
          <label htmlFor="requestLain" className="mb-1 mt-3 block text-sm font-semibold">Catatan / Request Lain</label>
          <textarea id="requestLain" maxLength={300} rows={2} className="w-full rounded border border-gray-300 px-3 py-2" placeholder="Contoh: tolong dikemas rapi, minta segar hari ini…" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          <p className="text-xs text-gray-500">{catatan.length}/300</p>
          <label htmlFor="tanggalKirim" className="mb-1 mt-3 block text-sm font-semibold">Tanggal Pengiriman</label>
          <input id="tanggalKirim" type="date" min={tglKirimMin} className="w-full rounded border border-gray-300 px-3 py-2" value={tglKirim} onChange={(e) => setTglKirim(e.target.value)} />
          <p className="mt-1 text-xs text-gray-500">Ganti jika mau dijadwalkan untuk tanggal lain. Kosong = Besok (H+1).</p>
        </div>
      </section>

      <div className="rounded border bg-gray-50 p-4 text-sm">
        <div className="flex justify-between font-bold">
          <span>Total bayar</span>
          <span>{fmt(calc.total)}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">Ongkir {calc.ongkirFinal === 0 ? "GRATIS ✅" : `+${fmt(calc.ongkir)}`} · {bayar || "pilih pembayaran dulu"}</p>
      </div>

      {submitMsg && <p className="text-sm text-green-700">{submitMsg}</p>}

      <button type="submit" disabled={submitBusy} className="rounded bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50">
        {mode === "admin" ? (submitBusy ? "Menyimpan..." : "Simpan Pesanan") : "Pesan via WhatsApp"}
      </button>
    </form>
  );
}

function NotaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
