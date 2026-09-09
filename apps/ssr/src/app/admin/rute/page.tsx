import Link from "next/link";
import { getDepot, getPesananDetail, getRute, listPesanan, listWilayah } from "@/lib/das-client";
import type { Pesanan } from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";
import { formatTanggal } from "../pesanan/status";
import RuteHost, { type RuteDepot, type RuteStop } from "./RuteHost";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDayStart(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function parseDayEnd(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
}

function toIntlPhone(hp: string): string {
  const digits = (hp ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? "62" + digits.slice(1) : digits;
}

// Mode Rute — ports the dashboard's route mode tab
// (reference/udang-dashboard/index.html ~lines 2746-3260):
// getRouteState (~2783-2806) = saved pesananIds filtered to still-eligible +
// remaining eligible as bank. Differences vs the reference: coordinates come
// from Alamat.lat/lng via Pesanan.alamatId -> GetPesananDetail (the kastamer
// lat/lng fields no longer exist since UDMC-2), the depot comes from
// GetDepot (server-side, was localStorage udang-depot-v1), and there is no
// leaflet map — stops render as a numbered list with per-stop Google Maps
// links plus one whole-route GMaps link (no iframe without an API key).
export default async function RutePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawTanggal = first(sp.tanggal);
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(rawTanggal) ? rawTanggal : todayISO();

  // Parallel fetch: pesanan list (tanggalAntar=tanggal, antar=belum_antar) +
  // saved route + depot + wilayah names. Failures are tolerated — the page
  // renders with whatever loaded, like the reference's best-effort lookups.
  const [pesananRes, ruteRes, depotRes, wilayahRes] = await Promise.all([
    listPesanan({
      tanggalDari: parseDayStart(tanggal),
      tanggalSampai: parseDayEnd(tanggal),
      statusPengiriman: "belum_antar",
    }).catch(() => ({ pesanan: [] as Pesanan[] })),
    getRute(tanggal).catch(() => ({ rute: undefined })),
    getDepot().catch(() => ({ depot: undefined })),
    listWilayah().catch(() => ({ wilayah: [] })),
  ]);

  const rows: Pesanan[] = pesananRes.pesanan ?? [];
  const wilayahById = new Map((wilayahRes.wilayah ?? []).map((w) => [w.id, w.nama]));

  // Per-stop coordinates need the joined Alamat — fetch details in parallel,
  // best-effort (a failed lookup drops the stop, same as the reference's
  // getEligibleStopsForDate filter v.lat && v.lng).
  const stops: RuteStop[] = (
    await Promise.all(
      rows.map(async (p): Promise<RuteStop | null> => {
        try {
          const d = await getPesananDetail(p.id);
          const a = d.alamat;
          const lat = a?.lat ?? 0;
          const lng = a?.lng ?? 0;
          if (!lat || !lng) return null;
          const items = (p.items ?? []).map((i) => `${i.nama} ${i.qty}${i.satuan || "kg"}`).join(", ");
          return {
            id: p.id,
            nama: d.kastamer?.nama ?? "—",
            noHp: d.kastamer?.noHp ?? "",
            noHpIntl: toIntlPhone(d.kastamer?.noHp ?? ""),
            wilayah: wilayahById.get(a?.wilayahId ?? "") ?? "",
            alamat: a?.alamat ?? "",
            lat,
            lng,
            mapsLink: a?.mapsLink ?? "",
            pesanan: p.deskripsi || items,
            totalHarga: p.totalHarga ?? "",
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((s): s is RuteStop => s !== null);

  // getRouteState: saved order filtered to still-eligible + rest as bank.
  const eligById = new Map(stops.map((s) => [s.id, s]));
  const savedIds = ruteRes.rute?.pesananIds ?? [];
  let active: RuteStop[];
  let bank: RuteStop[];
  if (savedIds.length > 0) {
    active = savedIds.map((id) => eligById.get(id)).filter((s): s is RuteStop => !!s);
    const activeSet = new Set(active.map((s) => s.id));
    bank = stops.filter((s) => !activeSet.has(s.id));
  } else {
    active = stops;
    bank = [];
  }

  const depot: RuteDepot | null = depotRes.depot
    ? {
        nama: depotRes.depot.nama ?? "",
        alamat: depotRes.depot.alamat ?? "",
        lat: depotRes.depot.lat ?? 0,
        lng: depotRes.depot.lng ?? 0,
        mapsLink: depotRes.depot.mapsLink ?? "",
      }
    : null;

  const prevDay = shiftDay(tanggal, -1);
  const nextDay = shiftDay(tanggal, 1);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, flex: 1 }}>
          Rute Pengiriman
        </h1>
        <Link
          href={`/admin/rute?tanggal=${prevDay}`}
          style={dayNavStyle}
        >
          ◀
        </Link>
        <form method="get" action="/admin/rute" style={{ display: "inline-flex" }}>
          <input
            type="date"
            name="tanggal"
            defaultValue={tanggal}
            style={{
              fontSize: 13,
              padding: "6px 8px",
              border: "1px solid #CBD5E1",
              borderRadius: 8,
              color: "#0F172A",
            }}
          />
        </form>
        <Link href={`/admin/rute?tanggal=${nextDay}`} style={dayNavStyle}>
          ▶
        </Link>
      </div>
      <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
        Urutan pengiriman {formatTanggal(parseDayStart(tanggal))} · {active.length} stop di
        rute + {bank.length} belum di rute.
      </p>

      <RuteHost tanggal={tanggal} initialActive={active} initialBank={bank} initialDepot={depot} />
    </section>
  );
}

function shiftDay(ymd: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + delta);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayNavStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
  background: "#F1F5F9",
  borderRadius: 8,
  padding: "6px 10px",
  textDecoration: "none",
};
