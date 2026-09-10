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
  { value: "Transfer - Jago", label: "Jago", desc: "Bank Jago · transfer antar bank", logo: "jago", logoText: "J", rekeningLabel: "No. Rekening Jago", rekeningNum: "101962407482" },
  { value: "Transfer - BCA", label: "BCA", desc: "Bank Central Asia", logo: "bca", logoText: "BCA", rekeningLabel: "No. Rekening BCA", rekeningNum: "5221698607" },
  { value: "Transfer - OVO", label: "OVO", desc: "Dompet digital OVO", logo: "ovo", logoText: "OVO", rekeningLabel: "No. OVO", rekeningNum: "085888031940" },
  { value: "Cash on Delivery (COD)", label: "Cash on Delivery", desc: "Bayar tunai saat pesanan tiba", logo: "cod", logoText: "💵", rekeningLabel: "", rekeningNum: "" },
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

  const showBeratError = Boolean(errors.berat);

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-body">
        <section className="step-section" id="section-1">
          <div className="step-heading">
            <div className="step-num">1</div>
            <div className="step-title">Pesanan</div>
          </div>
          <div className="card">
            <div className="field-group-label">Pesanan <span className="required">*</span></div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>🦐 Udang Utuh</div>
                <div className="berat-wrap" style={{ margin: 0 }}>
                  <button type="button" className="berat-btn" disabled={(parseBeratVal(kgUtuh) || 0) <= 0} onClick={() => setKgUtuh(stepHalf(kgUtuh, -0.5))} aria-label="Kurangi berat udang utuh">−</button>
                  <input className="berat-input" inputMode="decimal" value={kgUtuh} onChange={(e) => setKgUtuh(e.target.value)} onBlur={(e) => setKgUtuh(blurHalf(e.target.value))} aria-label="Berat udang utuh dalam kg" />
                  <span className="berat-unit">kg</span>
                  <button type="button" className="berat-btn" onClick={() => setKgUtuh(stepHalf(kgUtuh, 0.5))} aria-label="Tambah berat udang utuh">+</button>
                </div>
              </div>
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.udang.perKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.udang.setengahKg)}</div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>✂️ Udang Kupas</div>
                <div className="berat-wrap" style={{ margin: 0 }}>
                  <button type="button" className="berat-btn" disabled={(parseBeratVal(kgKupas) || 0) <= 0} onClick={() => setKgKupas(stepHalf(kgKupas, -0.5))} aria-label="Kurangi berat udang kupas">−</button>
                  <input className="berat-input" inputMode="decimal" value={kgKupas} onChange={(e) => setKgKupas(e.target.value)} onBlur={(e) => setKgKupas(blurHalf(e.target.value))} aria-label="Berat udang kupas dalam kg" />
                  <span className="berat-unit">kg</span>
                  <button type="button" className="berat-btn" onClick={() => setKgKupas(stepHalf(kgKupas, 0.5))} aria-label="Tambah berat udang kupas">+</button>
                </div>
              </div>
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.udang.perKg + harga.udang.jasaKupasPerKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.udang.setengahKg + harga.udang.kupasSetengahSurcharge)}</div>
              <div className="toggle-group" style={{ marginTop: 10 }}>
                <div className="toggle-option">
                  <input type="radio" id="kupasTailOn" name="jenisKupas" value="Peel Tail-On" checked={jenisKupas === "Peel Tail-On"} onChange={(e) => setJenisKupas(e.target.value)} />
                  <label htmlFor="kupasTailOn">Peel Tail-On</label>
                </div>
                <div className="toggle-option">
                  <input type="radio" id="kupasEasyPeel" name="jenisKupas" value="Easy Peel" checked={jenisKupas === "Easy Peel"} onChange={(e) => setJenisKupas(e.target.value)} />
                  <label htmlFor="kupasEasyPeel">Easy Peel</label>
                </div>
              </div>
            </div>

            <p className="berat-hint" style={{ marginTop: 10 }}>
              {areaInfo.area === "bogor_tangerang" ? "Area Bogor / Tangerang — min. total 2 kg." : "Min. total 0,5 kg. Boleh isi salah satu atau semuanya."}
            </p>
            {showBeratError && <div className="field-error" style={{ display: "block" }}>{errors.berat}</div>}
          </div>

          <div className="card produk-lain-card">
            <div className="field-group-label">Tambah Produk Lain <span className="optional-tag">Opsional</span></div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>🦑 Cumi Bangka</div>
                <div className="berat-wrap" style={{ margin: 0 }}>
                  <button type="button" className="berat-btn" disabled={(parseBeratVal(kgCumi) || 0) <= 0} onClick={() => setKgCumi(stepHalf(kgCumi, -0.5))} aria-label="Kurangi berat cumi">−</button>
                  <input className="berat-input" inputMode="decimal" value={kgCumi} onChange={(e) => setKgCumi(e.target.value)} onBlur={(e) => setKgCumi(blurHalf(e.target.value))} aria-label="Berat cumi dalam kg" />
                  <span className="berat-unit">kg</span>
                  <button type="button" className="berat-btn" onClick={() => setKgCumi(stepHalf(kgCumi, 0.5))} aria-label="Tambah berat cumi">+</button>
                </div>
              </div>
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.cumi.perKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.cumi.setengahKg)}</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>🐟 Ikan Kembung</div>
                <div className="berat-wrap" style={{ margin: 0 }}>
                  <button type="button" className="berat-btn" disabled={(parseBeratVal(kgKembung) || 0) <= 0} onClick={() => setKgKembung(stepHalf(kgKembung, -0.5))} aria-label="Kurangi berat ikan kembung">−</button>
                  <input className="berat-input" inputMode="decimal" value={kgKembung} onChange={(e) => setKgKembung(e.target.value)} onBlur={(e) => setKgKembung(blurHalf(e.target.value))} aria-label="Berat ikan kembung dalam kg" />
                  <span className="berat-unit">kg</span>
                  <button type="button" className="berat-btn" onClick={() => setKgKembung(stepHalf(kgKembung, 0.5))} aria-label="Tambah berat ikan kembung">+</button>
                </div>
              </div>
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.kembung.perKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.kembung.setengahKg)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input type="checkbox" id="bersih-kembung" checked={bersihKembung} disabled={(parseBeratVal(kgKembung) || 0) <= 0} onChange={(e) => setBersihKembung(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <label htmlFor="bersih-kembung" style={{ margin: 0, textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: "0.83rem", color: "#374151" }}>
                  Bersihkan ikan (lepas insang &amp; isi perut) — +{fmt(harga.kembung.jasaBersihPerKg)}/kg
                </label>
              </div>
              <div className="berat-hint" style={{ marginTop: 3 }}>Gratis untuk 0,5 kg pertama, kelebihannya +{fmt(harga.kembung.jasaBersihPerKg)}/kg</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>🐟 Teri Nasi</div>
                <div className="berat-wrap" style={{ margin: 0 }}>
                  <button type="button" className="berat-btn" disabled={(parseBeratVal(kgTeriNasi) || 0) <= 0} onClick={() => setKgTeriNasi(stepQuarter(kgTeriNasi, -0.25, harga.teriNasi.kgPerPack))} aria-label="Kurangi berat teri nasi">−</button>
                  <input className="berat-input" inputMode="decimal" value={kgTeriNasi} onChange={(e) => setKgTeriNasi(e.target.value)} onBlur={(e) => setKgTeriNasi(blurQuarter(e.target.value, harga.teriNasi.kgPerPack))} aria-label="Berat teri nasi dalam kg" />
                  <span className="berat-unit">kg</span>
                  <button type="button" className="berat-btn" onClick={() => setKgTeriNasi(stepQuarter(kgTeriNasi, 0.25, harga.teriNasi.kgPerPack))} aria-label="Tambah berat teri nasi">+</button>
                </div>
              </div>
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.teriNasi.pricePerPack)}/{harga.teriNasi.kgPerPack * 1000}gr &nbsp;·&nbsp; 1kg {fmt(harga.teriNasi.hargaSatuKg)} &nbsp;·&nbsp; kelipatan {harga.teriNasi.kgPerPack * 1000}gr</div>
            </div>
          </div>

          <div className="card nota-card">
            <div className="nota-header">🧾 Ringkasan Pesanan</div>
            <div className="nota-rows">
              {berat.kgUtuh > 0 && <NotaRow label={`Udang utuh ${berat.kgUtuh} kg`} value={fmt(calc.hargaUtuh)} />}
              {berat.kgKupas > 0 && <NotaRow label={`Udang kupas ${berat.kgKupas} kg · ${jenisKupas}`} value={fmt(calc.hargaKupas)} />}
              {berat.kgCumi > 0 && <NotaRow label={`Cumi ${berat.kgCumi} kg`} value={fmt(calc.hargaCumi)} />}
              {berat.kgKembung > 0 && <NotaRow label={`Ikan kembung ${berat.kgKembung} kg${bersihKembung ? " · dibersihkan" : ""}`} value={fmt(calc.hargaKembung)} />}
              {berat.kgTeriNasi > 0 && <NotaRow label={`Teri Nasi ${berat.kgTeriNasi} kg`} value={fmt(calc.hargaTeriNasi)} />}
              <div className="nota-row">
                <span className="nota-label">Ongkos kirim</span>
                <span className={calc.ongkirFinal === 0 ? "nota-val nota-free" : "nota-val nota-extra"}>{calc.ongkirFinal === 0 ? "GRATIS 🎉" : `+${fmt(calc.ongkir)}`}</span>
              </div>
            </div>
            {calc.promoAktif && (
              <div className="nota-row">
                <span className="nota-label">Promo ({calc.promoAktif.kode})</span>
                <span className="nota-val" style={{ color: "#16a34a", fontWeight: 700 }}>-{fmt(calc.promoAktif.type === "free_shipping" ? calc.ongkir : calc.diskon)}</span>
              </div>
            )}
            <div className="nota-divider"></div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Kode promo (opsional)"
                value={kodePromo}
                onChange={(e) => setKodePromo(e.target.value.toUpperCase())}
                aria-label="Kode promo"
                style={{ flex: 1, padding: "8px 12px", border: "1.5px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem", textTransform: "uppercase" }}
              />
              <button
                type="button"
                onClick={handleApplyPromo}
                disabled={promoChecking}
                style={{ padding: "8px 14px", background: "#92680a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}
              >
                Pakai
              </button>
            </div>
            {promoMsg && <div style={{ fontSize: "0.82rem", minHeight: 18, marginBottom: 4 }}>{promoMsg}</div>}
            {promoDropped && <div style={{ fontSize: "0.82rem", color: "#dc2626", marginBottom: 4 }}>⚠️ Promo dilepas: berat/subtotal tidak lagi memenuhi syarat.</div>}
            <div className="nota-total-row">
              <span className="nota-total-label">Total</span>
              <span className="nota-total-val">{fmt(calc.total)}</span>
            </div>
          </div>

          <div className="card">
            <label htmlFor="requestLain">Catatan / Request Lain</label>
            <textarea id="requestLain" placeholder="Contoh: tolong dikemas rapi, minta segar hari ini…" maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            <div className="char-count">{catatan.length}/300</div>
          </div>
        </section>

        <section className="step-section" id="section-2">
          <div className="step-heading">
            <div className="step-num">2</div>
            <div className="step-title">Identitas</div>
          </div>
          <div className="card">
            <label htmlFor="nama">Nama <span className="required">*</span></label>
            <input type="text" id="nama" placeholder="Nama panggilan" autoComplete="name" inputMode="text" value={nama} onChange={(e) => setNama(e.target.value)} />
            {errors.nama && <div className="field-error" style={{ display: "block" }}>{errors.nama}</div>}
            <label htmlFor="penerima" style={{ marginTop: 16 }}>Nomor Penerima <span className="optional-tag">opsional</span></label>
            <div className="phone-wrap">
              <span className="phone-prefix">+62</span>
              <input type="tel" id="penerima" placeholder="81234567890" autoComplete="tel" inputMode="numeric" value={penerima} onChange={(e) => setPenerima(e.target.value)} />
            </div>
            <p className="maps-hint" style={{ marginTop: 6 }}>Isi jika pesanan dikirim ke orang lain. Jika untuk diri sendiri, kosongkan saja.</p>
          </div>
        </section>

        <section className="step-section" id="section-3">
          <div className="step-heading">
            <div className="step-num">3</div>
            <div className="step-title">Alamat</div>
          </div>
          <div className="card">
            <label htmlFor="alamat">Alamat Detail <span className="required">*</span></label>
            <textarea id="alamat" placeholder="Contoh: Jl. Mawar No. 5, RT 03/RW 02, Kel. Sukajadi, Kec. Bandung Utara" inputMode="text" rows={3} value={alamat} onChange={(e) => setAlamat(e.target.value)} />
            {errors.alamat && <div className="field-error" style={{ display: "block" }}>{errors.alamat}</div>}
          </div>
          <div className="card">
            <div className="field-group-label">Pin Lokasi <span className="optional-tag">opsional</span></div>
            <div className="maps-wrap">
              <div className="maps-row">
                <input type="text" placeholder="Link Google Maps muncul di sini…" inputMode="text" readOnly value={mapsLink} aria-label="Link Google Maps pin lokasi" />
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input type="text" inputMode="decimal" placeholder="lat, cth -6.150" value={pinLat} onChange={(e) => setPinLat(e.target.value)} aria-label="Latitude pin lokasi" />
                  <input type="text" inputMode="decimal" placeholder="lng, cth 106.900" value={pinLng} onChange={(e) => setPinLng(e.target.value)} aria-label="Longitude pin lokasi" />
                  <button type="button" className="btn-maps" onClick={handlePin}>📍 Pin Lokasi</button>
                </div>
              </div>
              <p className="maps-hint">Cukup pin titik — alamat akan terisi otomatis. Membantu kurir menemukan lokasimu lebih akurat.</p>
            </div>
          </div>
        </section>

        <section className="step-section" id="section-4">
          <div className="step-heading">
            <div className="step-num">4</div>
            <div className="step-title">Pembayaran</div>
          </div>
          <div className="card">
            <div className="field-group-label">Metode Pembayaran <span className="required">*</span></div>
            <div className="pay-group" role="radiogroup" aria-label="Metode pembayaran">
              <p className="pay-section-label">Transfer</p>
              {BAYAR_OPTIONS.slice(0, 3).map((opt) => (
                <PayOption key={opt.value} opt={opt} bayar={bayar} setBayar={setBayar} />
              ))}
              <div className="pay-divider"></div>
              <p className="pay-section-label">Tunai</p>
              <PayOption opt={BAYAR_OPTIONS[3]} bayar={bayar} setBayar={setBayar} />
            </div>
            {errors.bayar && <div className="field-error" style={{ display: "block" }}>{errors.bayar}</div>}
          </div>
        </section>

        <div className="tanggal-kirim-bar" style={{ maxWidth: 560, margin: "0 auto", padding: "8px 12px", background: "white", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label className="tk-label" htmlFor="tanggalKirim">Tanggal Pengiriman</label>
            <input type="date" id="tanggalKirim" className="tk-input" min={tglKirimMin} value={tglKirim} onChange={(e) => setTglKirim(e.target.value)} />
          </div>
          <p className="maps-hint" style={{ marginTop: 4 }}>Ganti jika mau dijadwalkan untuk tanggal lain. Kosong = Besok (H+1).</p>
        </div>

        {submitMsg && <div style={{ fontSize: "0.85rem", color: "#15803d" }}>{submitMsg}</div>}

        <div className="submit-bar">
          <button type="submit" disabled={submitBusy} className="btn-submit" style={{ flex: 1 }}>
            {mode === "admin" ? (submitBusy ? "Menyimpan..." : "Simpan Pesanan") : "Pesan via WhatsApp"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PayOption({ opt, bayar, setBayar }: {
  opt: { value: string; label: string; desc: string; logo: string; logoText: string; rekeningLabel: string; rekeningNum: string };
  bayar: string;
  setBayar: (v: string) => void;
}) {
  const id = `pay-${opt.logo}`;
  const rekening = REKENING[opt.value];
  return (
    <div className="pay-option">
      <input type="radio" id={id} name="bayar" value={opt.value} checked={bayar === opt.value} onChange={(e) => setBayar(e.target.value)} />
      <label className="pay-label" htmlFor={id}>
        <div className={`pay-logo ${opt.logo}`}>{opt.logoText}</div>
        <div className="pay-info">
          <div className="pay-name">{opt.label}</div>
          <div className="pay-desc">{opt.desc}{rekening ? ` · ${rekening}` : ""}</div>
        </div>
        <div className="pay-check"></div>
      </label>
      {opt.rekeningNum && (
        <div className="pay-account">
          <div className="pay-account-info">
            <div className="pay-account-label">{opt.rekeningLabel}</div>
            <div className="pay-account-num">{opt.rekeningNum}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="nota-row">
      <span className="nota-label">{label}</span>
      <span className="nota-val">{value}</span>
    </div>
  );
}
