"use server";

import {
  getKastamerByNoHp,
  listAlamatByKastamer,
  listKastamer,
  type Alamat,
  type Kastamer,
} from "@/lib/das-client";

// Search kastamer ala reference searchKastamerForReorder
// (reference/udang-dashboard/index.html ~3585): filter nama/noHp
// contains, max 8 hasil. ListKastamer proto tidak punya query param,
// jadi filter dilakukan di sini (server-side, gRPC tidak ke browser).
export interface KastamerHit {
  nama: string;
  noHp: string;
}

export async function searchKastamer(query: string): Promise<KastamerHit[]> {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 1) return [];
  let rows: Kastamer[] = [];
  try {
    const resp = await listKastamer();
    rows = resp.kastamer ?? [];
  } catch {
    return [];
  }
  return rows
    .filter(
      (k) =>
        (k.nama || "").toLowerCase().includes(q) || (k.noHp || "").includes(q),
    )
    .slice(0, 8)
    .map((k) => ({ nama: k.nama, noHp: k.noHp }));
}

export interface KastamerPrefill {
  nama: string;
  noHp: string;
  alamat: string;
  mapsLink: string;
}

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// getKastamerPrefill ports selectReorderKastamer (reference ~3620):
// profil via GetKastamerByNoHp + alamat utama via ListAlamatByKastamer
// (isDefault diutamakan, fallback alamat pertama).
export async function getKastamerPrefill(
  noHp: string,
): Promise<{ ok: true; prefill: KastamerPrefill } | { ok: false; error: string }> {
  if (!noHp) return { ok: false, error: "noHp wajib diisi." };
  try {
    const kResp = await getKastamerByNoHp(noHp);
    const k = kResp.kastamer;
    if (!k) return { ok: false, error: "Kastamer tidak ditemukan." };
    let utama: Alamat | undefined;
    try {
      const aResp = await listAlamatByKastamer(k.id);
      const list = aResp.alamat ?? [];
      utama = list.find((a) => a.isDefault) ?? list[0];
    } catch {
      utama = undefined;
    }
    return {
      ok: true,
      prefill: {
        nama: k.nama,
        noHp: k.noHp,
        alamat: utama?.alamat ?? "",
        mapsLink: utama?.mapsLink ?? "",
      },
    };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
