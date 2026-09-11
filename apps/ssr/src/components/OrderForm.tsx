"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { checkPromo, submitPesanan } from "@/app/actions/submitPesanan";
import MapPinModal from "@/components/MapPinModal";
import {
  checkPromoEligibility,
  computeOrder,
  fmt,
  getAreaInfo,
  isBeratMinMet,
  parseBeratVal,
  rekeningInfo,
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
  WA_NUMBER,
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

// MIN_KG_PRODUK ports the produk-lain (tongkol, nila) floor
// (reference/uua/index.html line 2544) — chip steppers clamp to >= 0.5,
// step 0.5, mirroring stepProduk/onProdukBlur (lines 2545-2561).
const MIN_KG_PRODUK = 0.5;

function stepProduk(raw: string, delta: number): string {
  const val = parseBeratVal(raw) || MIN_KG_PRODUK;
  return String(Math.max(MIN_KG_PRODUK, Math.round((val + delta) * 2) / 2));
}

function blurProduk(raw: string): string {
  let v = parseBeratVal(raw);
  if (isNaN(v) || v < MIN_KG_PRODUK) v = MIN_KG_PRODUK;
  return String(Math.round(v * 2) / 2);
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
  const [tongkolAktif, setTongkolAktif] = useState(false);
  const [nilaAktif, setNilaAktif] = useState(false);
  const [kgTongkol, setKgTongkol] = useState("0.5");
  const [kgNila, setKgNila] = useState("0.5");
  const [produkCustom] = useState<string[]>([]);
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
  // Reminder banner (reference/uua/index.html:1026-1036,2911-2944):
  // muncul jika localStorage udang_reminder sudah jatuh tempo.
  const [reminderShow, setReminderShow] = useState(false);
  const [reminderNama, setReminderNama] = useState("");
  // Progress nav 4 step — state sederhana, diupdate IntersectionObserver
  // (reference/uua/index.html:1044-1078,1715-1731).
  const [stepAktif, setStepAktif] = useState(1);
  // Modal pengingat WA (reference/uua/index.html:1471-1485,2827-2909):
  // input tanggal + simpan ke localStorage + buka wa.me format "Pesan Nanti".
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTgl, setReminderTgl] = useState("");
  const [reminderHint, setReminderHint] = useState("");
  const [reminderSaved, setReminderSaved] = useState(false);
  // FAQ drawer (reference/uua/index.html:3099-3117,3150-3170).
  const [faqOpen, setFaqOpen] = useState(false);
  const faqRef = useRef<HTMLDivElement | null>(null);
  const dreamlebsRef = useRef<HTMLSpanElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  // Map pin modal (reference/uua/index.html:1487-1525,1793-2073) —
  // MapPinModal.tsx does the Leaflet/geocode work, this just wires the
  // result back into mapsLink/pinLat/pinLng + shows the .location-status
  // line.
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [locStatus, setLocStatus] = useState<{ type: "loading" | "success" | "fail"; msg: string } | null>(null);
  const lastAutoAddrRef = useRef("");

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("udang_reminder");
      if (!raw) return;
      const data = JSON.parse(raw) as { nama?: string; reminderDatetime?: string; reminderDate?: string };
      const remind = new Date(data.reminderDatetime || data.reminderDate || "");
      if (!isNaN(remind.getTime()) && new Date() >= remind) {
        setReminderNama(data.nama || "");
        setReminderShow(true);
      }
    } catch {
      // abaikan reminder korup
    }
  }, []);

  // Highlight step yang sedang terlihat saat user scroll.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = [1, 2, 3, 4].map((n) => document.getElementById(`section-${n}`));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const n = parseInt(entry.target.id.replace("section-", ""), 10);
            if (n >= 1 && n <= 4) setStepAktif(n);
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      if (s) observer.observe(s);
    });
    return () => observer.disconnect();
  }, []);

  function scrollToStep(n: number) {
    document.getElementById(`section-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Default tanggal pengingat = besok (reference reminderInitDatetime,
  // index.html:2715-2745). Hint "Diingatkan besok / dalam N hari".
  useEffect(() => {
    if (!reminderOpen) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const max = new Date(now);
    max.setMonth(max.getMonth() + 1);
    const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let def = new Date(now);
    def.setDate(def.getDate() + 1);
    if (def > max) def = max;
    setReminderTgl((prev) => prev || toLocal(def));
    setReminderSaved(false);
  }, [reminderOpen]);

  useEffect(() => {
    if (!reminderTgl) {
      setReminderHint("");
      return;
    }
    const sel = new Date(reminderTgl + "T00:00:00");
    const diff = sel.getTime() - Date.now();
    if (isNaN(sel.getTime()) || diff <= 0) {
      setReminderHint("Pilih tanggal yang akan datang.");
      return;
    }
    const days = Math.floor(diff / 86400000);
    setReminderHint(days <= 1 ? "Diingatkan besok." : `Diingatkan dalam ${days} hari.`);
  }, [reminderTgl]);

  // Tutup FAQ jika klik di luar drawer & tombol pemicu
  // (reference/uua/index.html:3161-3170).
  useEffect(() => {
    if (!faqOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node | null;
      if (
        t &&
        faqRef.current && !faqRef.current.contains(t) &&
        dreamlebsRef.current && !dreamlebsRef.current.contains(t)
      ) {
        setFaqOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [faqOpen]);

  // .bottom-dock is position:fixed, so it can cover the tail of the
  // scrollable form content — uua.css's body padding-bottom (120px) was
  // sized for the reference's original, shorter dock and doesn't account
  // for this merge's taller one (FAQ drawer + tanggal-kirim-bar +
  // submit-bar + footer), let alone the FAQ drawer expanding it further
  // when opened. Keep body padding in sync with the dock's real height
  // instead of guessing a static number.
  useEffect(() => {
    if (mode !== "publik" || !dockRef.current) return;
    const el = dockRef.current;
    const sync = () => {
      document.body.style.paddingBottom = `${el.getBoundingClientRect().height + 16}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [mode]);

  function reminderOpenWA() {
    const msg = reminderNama
      ? `Halo, saya ${reminderNama} mau pesan udang segar lagi 🦐`
      : "Halo, saya mau pesan udang segar lagi 🦐";
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
    reminderDismiss();
  }

  function reminderDismiss() {
    try {
      localStorage.removeItem("udang_reminder");
    } catch {
      // abaikan
    }
    setReminderShow(false);
  }

  // saveReminder verbatim (reference/uua/index.html:2845-2909): validasi
  // tanggal future, bangun pesan "Pesan Nanti", simpan localStorage,
  // buka wa.me. Harga/promo diambil dari calc agar konsisten dengan nota.
  function saveReminder() {
    if (!reminderTgl) return;
    const target = new Date(reminderTgl + "T00:00:00");
    if (isNaN(target.getTime()) || target <= new Date()) {
      setReminderHint("Pilih tanggal yang akan datang.");
      return;
    }
    const tgl = formatTanggalKirim(reminderTgl);
    const lines: (string | null)[] = [
      "*Pesan Nanti – Udang Segar*",
      "",
      nama.trim() ? "Nama       : " + nama.trim() : null,
      alamat.trim() ? "Alamat     : " + alamat.trim() : null,
      mapsLink.trim() ? "Pin Lokasi : " + mapsLink.trim() : null,
      "",
      berat.kgUtuh > 0 ? "Udang utuh : " + berat.kgUtuh + " kg — " + fmt(calc.hargaUtuh) : null,
      berat.kgKupas > 0
        ? "Udang kupas: " + berat.kgKupas + " kg (" + jenisKupas + ") — " + fmt(calc.hargaKupas)
        : null,
      berat.kgCumi > 0 ? "Cumi       : " + berat.kgCumi + " kg — " + fmt(calc.hargaCumi) : null,
      berat.kgKembung > 0
        ? "Ikan kembung: " + berat.kgKembung + " kg" + (bersihKembung ? " (dibersihkan)" : "") + " — " + fmt(calc.hargaKembung)
        : null,
      berat.kgTeriNasi > 0 ? "Teri Nasi  : " + berat.kgTeriNasi + " kg — " + fmt(calc.hargaTeriNasi) : null,
      catatan.trim() ? "Catatan    : " + catatan.trim() : null,
      "",
      calc.ongkirFinal === 0 ? "Ongkir     : GRATIS ✅" : "Ongkir     : +" + fmt(calc.ongkir),
      calc.promoAktif ? "Promo (" + calc.promoAktif.kode + "): -" + fmt(calc.diskon || calc.ongkir) : null,
      "*Total     : " + fmt(calc.total) + "*",
      "",
      bayar ? "Pembayaran : " + bayar : null,
      rekeningInfo(bayar) ? "Rekening   : " + rekeningInfo(bayar) : null,
      "",
      "📅 Tanggal pesan: " + tgl,
    ];
    try {
      localStorage.setItem(
        "udang_reminder",
        JSON.stringify({ nama: nama.trim(), reminderDatetime: reminderTgl, savedAt: new Date().toISOString() }),
      );
    } catch {
      // abaikan — wa tetap dibuka
    }
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.filter((l) => l !== null).join("\n"))}`, "_blank");
    setReminderSaved(true);
  }

  // simpanUntukNanti verbatim (reference/uua/index.html:2776-2825):
  // bangun pesan "Simpan untuk Nanti" dari state form + calc, buka wa.me.
  // Dipakai tombol "Chat Admin" (reference line 3132).
  function chatAdmin() {
    const lines: (string | null)[] = [
      "*Simpan untuk Nanti – Udang Segar* 🦐",
      "",
      nama.trim() ? "Nama       : " + nama.trim() : null,
      alamat.trim() ? "Alamat     : " + alamat.trim() : null,
      mapsLink.trim() ? "Pin Lokasi : " + mapsLink.trim() : null,
      "",
      berat.kgUtuh > 0 ? "Udang utuh : " + berat.kgUtuh + " kg — " + fmt(calc.hargaUtuh) : null,
      berat.kgKupas > 0
        ? "Udang kupas: " + berat.kgKupas + " kg (" + jenisKupas + ") — " + fmt(calc.hargaKupas)
        : null,
      berat.kgCumi > 0 ? "Cumi       : " + berat.kgCumi + " kg — " + fmt(calc.hargaCumi) : null,
      berat.kgKembung > 0
        ? "Ikan kembung: " + berat.kgKembung + " kg" + (bersihKembung ? " (dibersihkan)" : "") + " — " + fmt(calc.hargaKembung)
        : null,
      berat.kgTeriNasi > 0 ? "Teri Nasi  : " + berat.kgTeriNasi + " kg — " + fmt(calc.hargaTeriNasi) : null,
      catatan.trim() ? "Catatan    : " + catatan.trim() : null,
      "",
      calc.ongkirFinal === 0 ? "Ongkir     : GRATIS ✅" : "Ongkir     : +" + fmt(calc.ongkir),
      calc.promoAktif ? "Promo (" + calc.promoAktif.kode + "): -" + fmt(calc.diskon || calc.ongkir) : null,
      "*Total     : " + fmt(calc.total) + "*",
      "",
      bayar ? "Pembayaran : " + bayar : null,
      rekeningInfo(bayar) ? "Rekening   : " + rekeningInfo(bayar) : null,
      "",
      "_Saya tertarik tapi belum bisa pesan sekarang. Boleh diingatkan nanti?_",
    ];
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.filter((l) => l !== null).join("\n"))}`, "_blank");
  }

  function toggleFaqSeo(e: ReactMouseEvent) {
    e.stopPropagation();
    setFaqOpen((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          faqRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
      }
      return next;
    });
  }

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
  // kgTongkol/kgNila ikut gate min-berat seperti reference getProdukLainKg
  // + isStep1Done (index.html:1626-1645): chip aktif menambah total kg,
  // meski harganya Rp0 (konfirmasi via WA). pricing.ts frozen jadi
  // penjumlahannya di sini, bukan di computeOrder/isBeratMinMet.
  const kgTongkolNum = tongkolAktif ? parseBeratVal(kgTongkol) || 0 : 0;
  const kgNilaNum = nilaAktif ? parseBeratVal(kgNila) || 0 : 0;
  const beratOk =
    produkCustom.length > 0 ||
    isBeratMinMet({ ...berat, kgUtuh: berat.kgUtuh + kgTongkolNum + kgNilaNum }, alamat, pin, harga);

  // tglKirimMin/tglKirim default (besok, H+1 — reference lines 2750-2758)
  // are computed client-only in an effect, not eagerly during render: doing
  // it eagerly (e.g. a bare useMemo) evaluates `new Date()` during SSR too,
  // and if the server's timezone differs from the browser's, "tomorrow"
  // can resolve to a different calendar date — a real hydration mismatch
  // on the <input min> attribute, not just a cosmetic one.
  const [tglKirimMin, setTglKirimMin] = useState("");
  useEffect(() => {
    const d = new Date(Date.now() + 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const besok = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setTglKirimMin(besok);
    setTglKirim(besok);
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

  // handleMapConfirm ports confirmMapPin (reference lines 2043-2073): sets
  // the maps link, auto-fills Alamat Detail from the reverse-geocoded
  // address only if it's empty or still holds the previous auto-fill (so
  // manually typed text is never clobbered), and shows the same
  // "pinned" / "area free ongkir" status line.
  function handleMapConfirm(lat: number, lng: number, pinAddress: string) {
    setPinLat(String(lat));
    setPinLng(String(lng));
    setMapsLink(`https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`);

    let filledAddr = false;
    let nextAlamat = alamat;
    if (pinAddress) {
      const cur = alamat.trim();
      if (cur === "" || cur === lastAutoAddrRef.current) {
        nextAlamat = pinAddress;
        lastAutoAddrRef.current = pinAddress;
        setAlamat(pinAddress);
        filledAddr = true;
      }
    }

    const ongkirNow = getAreaInfo(nextAlamat, { lat, lng }, harga).ongkir;
    let statusMsg = filledAddr
      ? "📍 Alamat terisi otomatis dari titik peta"
      : `📍 Lokasi dipin: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (ongkirNow === 0) statusMsg += " — ✅ Area FREE ONGKIR!";
    setLocStatus({ type: "success", msg: statusMsg });
    setMapModalOpen(false);
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
    // getProdukLainLines verbatim (index.html:2575-2589): chip aktif +
    // custom list masuk pesan WA sebagai baris teks (harga konfirmasi WA).
    // wa-message.ts frozen — baris digabung ke catatan agar tetap terkirim.
    const produkLainLines: string[] = [];
    if (tongkolAktif) produkLainLines.push(`🐟 Ikan Tongkol : ${kgTongkolNum} kg (harga konfirmasi WA)`);
    if (nilaAktif) produkLainLines.push(`🐠 Ikan Nila : ${kgNilaNum} kg (harga konfirmasi WA)`);
    for (const item of produkCustom) produkLainLines.push(`Lainnya    : ${item}`);
    const catatanFull = [catatan.trim(), ...produkLainLines].filter((l) => !!l).join("\n");

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
        catatan: catatanFull,
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
      catatan: catatanFull,
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

  const progSteps = [
    { n: 1, label: "Pesanan", title: "Pesanan" },
    { n: 2, label: "Nama", title: "Nama & WhatsApp" },
    { n: 3, label: "Alamat", title: "Alamat" },
    { n: 4, label: "Bayar", title: "Pembayaran" },
  ];
  // stepDone ports isStep1Done..isStep4Done (reference lines 1640-1654):
  // "done" means that step's own data is filled in, independent of scroll
  // position — kept separate from stepAktif ("currently visible"), matching
  // renderProgress's done-takes-precedence-over-active rule (line 1699).
  const stepDone = [beratOk, nama.trim().length > 0, alamat.trim().length > 0, bayar.length > 0];

  return (
    <Fragment>
    {mode === "publik" && reminderShow && (
      <div className="reminder-banner show" id="reminderBanner">
        <div className="reminder-banner-title">🦐 Waktunya pesan udang lagi!</div>
        <div className="reminder-banner-body" id="reminderBannerBody">
          {reminderNama
            ? `Halo ${reminderNama}! Sudah waktunya pesan udang segar lagi. Yuk langsung pesan sekarang!`
            : "Kamu punya pengingat untuk memesan. Yuk langsung pesan sekarang!"}
        </div>
        <div className="reminder-banner-row">
          <button type="button" className="btn-reminder-wa" onClick={reminderOpenWA}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.556 4.121 1.528 5.855L.057 23.854a.5.5 0 00.608.608l6.074-1.458A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.942 9.942 0 01-5.031-1.362l-.36-.214-3.733.897.915-3.642-.236-.374A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" /></svg>
            Pesan Sekarang
          </button>
          <button type="button" className="btn-reminder-dismiss" onClick={reminderDismiss}>Nanti dulu</button>
        </div>
      </div>
    )}
    {mode === "publik" && (
    <header>
      <div className="header-top">
        <h1>Form Pesanan</h1>
        <p>Isi data di bawah, kami akan segera konfirmasi via WhatsApp</p>
      </div>
    <div className="progress-nav-wrap">
      <div className="progress-nav">
        {progSteps.map((s, i) => {
          const done = stepDone[i];
          return (
          <Fragment key={s.n}>
            {i > 0 && <div className={`prog-line${stepDone[i - 1] ? " done" : ""}`} id={`pl-${s.n - 1}`}></div>}
            <div
              className={`prog-step${done ? " done" : stepAktif === s.n ? " active" : ""}`}
              id={`ps-${s.n}`}
              onClick={() => scrollToStep(s.n)}
              title={s.title}
            >
              <div className="prog-circle">
                <span>{s.n}</span>
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><polyline points="1.5,6 4.5,9.5 10.5,2.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="prog-label">{s.label}</div>
            </div>
          </Fragment>
          );
        })}
      </div>
    </div>
    </header>
    )}
    <form id="orderForm" onSubmit={handleSubmit} noValidate>
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
              <div className="berat-hint" style={{ marginTop: 3 }}>1 thinwall ≈ 38–40 ekor · berat bersih 1 kg (tanpa thinwall)</div>
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
              <div className="berat-hint" style={{ marginTop: 3 }}>Udang ditimbang utuh (1 kg = 38–40 ekor), lalu dikupas — jumlah ekor tetap sama</div>
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
              {areaInfo.area === "bogor_tangerang" ? "Area Bogor / Tangerang — min. total 2 kg." : "Min. total 0,5 kg. Boleh isi salah satu atau keduanya."}
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
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.cumi.perKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.cumi.setengahKg)} &nbsp;·&nbsp; Ukuran 10 &nbsp;·&nbsp; min. 1 kg</div>
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
              <div className="berat-hint" style={{ marginTop: 4 }}>{fmt(harga.kembung.perKg)}/kg &nbsp;·&nbsp; ½kg {fmt(harga.kembung.setengahKg)} &nbsp;·&nbsp; Ukuran 12 &nbsp;·&nbsp; min. 1 kg</div>
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

            <div className="produk-chip-row" id="produk-chip-row">
              <button type="button" className={`produk-chip${tongkolAktif ? " active" : ""}`} id="chip-tongkol" onClick={() => setTongkolAktif(!tongkolAktif)}>
                <span className="chip-check">✓</span>🐟 Ikan Tongkol
              </button>
              <button type="button" className={`produk-chip${nilaAktif ? " active" : ""}`} id="chip-nila" onClick={() => setNilaAktif(!nilaAktif)}>
                <span className="chip-check">✓</span>🐠 Ikan Nila
              </button>
            </div>

            <div className={`produk-stepper${tongkolAktif ? " show" : ""}`} id="stepper-tongkol">
              <div className="produk-stepper-label">🐟 Ikan Tongkol</div>
              <div className="produk-stepper-wrap">
                <button type="button" className="produk-stepper-btn" id="btn-tongkol-min" disabled={kgTongkolNum <= MIN_KG_PRODUK} onClick={() => setKgTongkol(stepProduk(kgTongkol, -0.5))}>−</button>
                <input className="produk-stepper-input" inputMode="decimal" id="kg-tongkol" value={kgTongkol} autoComplete="off" aria-label="Berat Ikan Tongkol dalam kg" onChange={(e) => setKgTongkol(e.target.value)} onBlur={(e) => setKgTongkol(blurProduk(e.target.value))} />
                <span className="produk-stepper-unit">kg</span>
                <button type="button" className="produk-stepper-btn" onClick={() => setKgTongkol(stepProduk(kgTongkol, 0.5))}>+</button>
              </div>
              <button type="button" className="produk-stepper-remove" onClick={() => setTongkolAktif(false)} aria-label="Hapus Ikan Tongkol dari pesanan">×</button>
            </div>

            <div className={`produk-stepper${nilaAktif ? " show" : ""}`} id="stepper-nila">
              <div className="produk-stepper-label">🐠 Ikan Nila</div>
              <div className="produk-stepper-wrap">
                <button type="button" className="produk-stepper-btn" id="btn-nila-min" disabled={kgNilaNum <= MIN_KG_PRODUK} onClick={() => setKgNila(stepProduk(kgNila, -0.5))}>−</button>
                <input className="produk-stepper-input" inputMode="decimal" id="kg-nila" value={kgNila} autoComplete="off" aria-label="Berat Ikan Nila dalam kg" onChange={(e) => setKgNila(e.target.value)} onBlur={(e) => setKgNila(blurProduk(e.target.value))} />
                <span className="produk-stepper-unit">kg</span>
                <button type="button" className="produk-stepper-btn" onClick={() => setKgNila(stepProduk(kgNila, 0.5))}>+</button>
              </div>
              <button type="button" className="produk-stepper-remove" onClick={() => setNilaAktif(false)} aria-label="Hapus Ikan Nila dari pesanan">×</button>
            </div>

            <ul id="produk-custom-list" style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {produkCustom.map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--gray-50)", border: "1.5px solid var(--gray-200)", borderRadius: 8, padding: "8px 10px", fontSize: "0.88rem" }}>
                  <span style={{ flex: 1, color: "var(--gray-800)" }}>{item}</span>
                </li>
              ))}
            </ul>
            <p className="berat-hint" style={{ marginTop: 8 }}>Harga produk lain dikonfirmasi via WhatsApp.</p>
          </div>

          <div className="card nota-card">
            <div className="nota-header">🧾 Ringkasan Pesanan</div>
            <div className="nota-rows">
              {berat.kgUtuh > 0 && <NotaRow label={`Udang utuh ${berat.kgUtuh} kg`} value={fmt(calc.hargaUtuh)} />}
              {berat.kgKupas > 0 && <NotaRow label={`Udang kupas ${berat.kgKupas} kg · ${jenisKupas}`} value={fmt(calc.hargaKupas)} />}
              {berat.kgCumi > 0 && <NotaRow label={`Cumi ${berat.kgCumi} kg`} value={fmt(calc.hargaCumi)} />}
              {berat.kgKembung > 0 && <NotaRow label={`Ikan kembung ${berat.kgKembung} kg${bersihKembung ? " · dibersihkan" : ""}`} value={fmt(calc.hargaKembung)} />}
              {berat.kgTeriNasi > 0 && <NotaRow label={`Teri Nasi ${berat.kgTeriNasi} kg`} value={fmt(calc.hargaTeriNasi)} />}
              {tongkolAktif && <NotaRow label={`Ikan Tongkol ${kgTongkolNum} kg`} value="(harga konfirmasi WA)" />}
              {nilaAktif && <NotaRow label={`Ikan Nila ${kgNilaNum} kg`} value="(harga konfirmasi WA)" />}
              {produkCustom.map((item) => (
                <NotaRow key={item} label={`Lainnya: ${item}`} value="(harga konfirmasi WA)" />
              ))}
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
            {mode === "publik" && (
              <button type="button" className="btn-reminder-toggle" style={{ marginTop: 10 }} onClick={() => setReminderOpen(true)}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                Ingatkan Saya Nanti
              </button>
            )}
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
                <button type="button" className="btn-maps" onClick={() => setMapModalOpen(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  Pin Lokasi
                </button>
              </div>
              {locStatus && <div className={`location-status ${locStatus.type}`} style={{ display: "block" }}>{locStatus.msg}</div>}
              <p className="maps-hint">Cukup pin titik di peta — alamat akan terisi otomatis. Membantu kurir menemukan lokasimu lebih akurat.</p>
            </div>
          </div>
        </section>

        {mapModalOpen && <MapPinModal onClose={() => setMapModalOpen(false)} onConfirm={handleMapConfirm} />}

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
      </div>
    </form>
    {mode !== "publik" && (
      <div className="form-body" style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
        <TanggalDanSubmit
          mode={mode}
          tglKirim={tglKirim}
          setTglKirim={setTglKirim}
          tglKirimMin={tglKirimMin}
          submitMsg={submitMsg}
          submitBusy={submitBusy}
          onChatAdmin={chatAdmin}
        />
      </div>
    )}
    {mode === "publik" && (
      <div className="bottom-dock" ref={dockRef}>
        <div id="faq-seo-drawer" ref={faqRef} className={`faq-seo-container${faqOpen ? " open" : ""}`}>
          <div className="faq-seo-title">Pertanyaan Umum (FAQ) - Udang Segar Tambak Tegal</div>
          <div className="faq-seo-item">
            <div className="faq-seo-question">Q: Di mana saya bisa membeli udang segar tambak Tegal asli di Jabodetabek?</div>
            <div className="faq-seo-answer">A: Kamu bisa memesannya langsung di sini! Kami menyediakan udang segar tambak Tegal asli yang dikirim langsung ke wilayah Jakarta, Depok, dan Bekasi (Jadebek).</div>
          </div>
          <div className="faq-seo-item">
            <div className="faq-seo-question">Q: Apakah udang yang dikirim adalah udang beku (freezer)?</div>
            <div className="faq-seo-answer">A: Tidak, kami berkomitmen menyajikan kualitas terbaik dengan sistem <strong>non-freezer (segar tanpa dibekukan / no freezer)</strong>, sehingga rasa manis alami dan tekstur udang tetap terjaga sempurna saat tiba di kulkas kamu.</div>
          </div>
          <div className="faq-seo-item">
            <div className="faq-seo-question">Q: Bagaimana dengan biaya pengiriman ke wilayah Jakarta, Depok, dan Bekasi?</div>
            <div className="faq-seo-answer">A: Kami memberikan penawaran istimewa berupa layanan <strong>gratis ongkir (free ongkir) langsung antar</strong> untuk seluruh area <strong>Sunter, Kelapa Gading, JGC, Sedayu, PGC, Harapan Indah, Pulogebang, Summarecon Bekasi</strong> tanpa biaya tambahan.</div>
          </div>
          <div className="faq-seo-item">
            <div className="faq-seo-question">Q: Bagaimana cara memesan udang segar ini?</div>
            <div className="faq-seo-answer">A: Sangat mudah! Kamu cukup mengisi form pemesanan udang segar di halaman web ini, lalu konfirmasi pesanan kamu akan dikirim langsung via WhatsApp.</div>
          </div>
        </div>
        <TanggalDanSubmit
          mode={mode}
          tglKirim={tglKirim}
          setTglKirim={setTglKirim}
          tglKirimMin={tglKirimMin}
          submitMsg={submitMsg}
          submitBusy={submitBusy}
          onChatAdmin={chatAdmin}
        />
        <div className="bottom-navbar">Manufactured by <span>adipresto</span> — <span className="dreamlebs-btn" ref={dreamlebsRef} onClick={toggleFaqSeo}>dreamlebs</span></div>
      </div>
    )}
    {mode === "publik" && reminderOpen && (
      <div className="reminder-modal-backdrop show" id="reminderModal" onClick={(e) => { if (e.target === e.currentTarget) setReminderOpen(false); }}>
        <div className="reminder-modal-sheet" id="reminderModalSheet">
          <div className="reminder-modal-header">
            <div className="reminder-modal-title">Kami ingatkan kamu via WhatsApp</div>
            <button type="button" className="reminder-modal-close" onClick={() => setReminderOpen(false)} aria-label="Tutup">✕</button>
          </div>
          <div className="reminder-modal-body">
            <label className="reminder-dt-label" htmlFor="reminderDatetime">Tanggal pengingat</label>
            <input type="date" id="reminderDatetime" className="reminder-dt-input" value={reminderTgl} onChange={(e) => setReminderTgl(e.target.value)} />
            <div className="reminder-dt-hint" id="reminderDtHint" style={reminderHint === "Pilih tanggal yang akan datang." ? { color: "#ef4444" } : undefined}>{reminderHint}</div>
            <button type="button" className="btn-save-reminder" onClick={saveReminder} disabled={reminderSaved} style={reminderSaved ? { opacity: 0.5 } : undefined}>Kirim Pengingat</button>
            {reminderSaved && <div className="reminder-saved-msg show" id="reminderSavedMsg">✅ Pengingat tersimpan! Kami akan ingatkan kamu.</div>}
          </div>
        </div>
      </div>
    )}
    </Fragment>
  );
}

// TanggalDanSubmit ports the tanggal-kirim-bar + submit-bar block
// (reference lines 3119-3145) — lives OUTSIDE <form id="orderForm"> (mirrors
// the reference: the submit button there is `form="orderForm"`) so the
// public build can render it inside the fixed .bottom-dock while admin mode
// keeps it inline in the page flow.
function TanggalDanSubmit({
  mode,
  tglKirim,
  setTglKirim,
  tglKirimMin,
  submitMsg,
  submitBusy,
  onChatAdmin,
}: {
  mode: "publik" | "admin";
  tglKirim: string;
  setTglKirim: (v: string) => void;
  tglKirimMin: string;
  submitMsg: string;
  submitBusy: boolean;
  onChatAdmin: () => void;
}) {
  return (
    <>
      <div className="tanggal-kirim-bar" style={{ maxWidth: 560, margin: "0 auto", padding: "8px 12px", background: "white", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label className="tk-label" htmlFor="tanggalKirim">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2.5" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Tanggal Pengiriman
          </label>
          <input type="date" id="tanggalKirim" form="orderForm" name="tanggalKirim" className="tk-input" min={tglKirimMin} value={tglKirim} onChange={(e) => setTglKirim(e.target.value)} />
        </div>
        <p className="maps-hint" id="tanggalKirimHint" style={{ marginTop: 4 }}>Ganti jika mau dijadwalkan untuk tanggal lain.</p>
      </div>

      {submitMsg && <div style={{ fontSize: "0.85rem", color: "#15803d", padding: mode === "publik" ? "0 16px" : undefined }}>{submitMsg}</div>}

      <div className="submit-bar">
        {mode === "publik" && (
          <button type="button" form="orderForm" className="btn-reminder-toggle" id="btnReminderToggle" onClick={onChatAdmin}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Chat Admin
          </button>
        )}
        <button type="submit" form="orderForm" disabled={submitBusy} className="btn-submit" style={{ flex: 1 }}>
          {mode === "admin" ? (submitBusy ? "Menyimpan..." : "Simpan Pesanan") : (
            <Fragment>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.556 4.121 1.528 5.855L.057 23.854a.5.5 0 00.608.608l6.074-1.458A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.942 9.942 0 01-5.031-1.362l-.36-.214-3.733.897.915-3.642-.236-.374A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Pesan
            </Fragment>
          )}
        </button>
      </div>
    </>
  );
}

function PayOption({ opt, bayar, setBayar }: {
  opt: { value: string; label: string; desc: string; logo: string; logoText: string; rekeningLabel: string; rekeningNum: string };
  bayar: string;
  setBayar: (v: string) => void;
}) {
  const id = `pay-${opt.logo}`;
  // copyAccount verbatim (reference/uua/index.html:1734-1759):
  // clipboard + fallback textarea, feedback "Tersalin ✓" 1600ms.
  const [copied, setCopied] = useState(false);
  function copyAccount(num: string) {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    };
    const fallbackCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = num;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        // abaikan
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(num).then(done).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  };
  return (
    <div className="pay-option">
      <input type="radio" id={id} name="bayar" value={opt.value} checked={bayar === opt.value} onChange={(e) => setBayar(e.target.value)} />
      <label className="pay-label" htmlFor={id}>
        <div className={`pay-logo ${opt.logo}`}>{opt.logoText}</div>
        <div className="pay-info">
          <div className="pay-name">{opt.label}</div>
          <div className="pay-desc">{opt.desc}</div>
        </div>
        <div className="pay-check"></div>
      </label>
      {opt.rekeningNum && (
        <div className="pay-account">
          <div className="pay-account-info">
            <div className="pay-account-label">{opt.rekeningLabel}</div>
            <div className="pay-account-num">{opt.rekeningNum}</div>
          </div>
          <button type="button" className={`btn-copy-acct${copied ? " copied" : ""}`} onClick={() => copyAccount(opt.rekeningNum)}>
            {copied ? "Tersalin ✓" : "Salin"}
          </button>
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
