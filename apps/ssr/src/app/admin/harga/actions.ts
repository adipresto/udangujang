"use server";

import { updateHarga } from "@/lib/das-client";
import { HARGA_FIELDS } from "./harga-fields";

export type UpdateHargaResult =
  | { ok: true; updatedAtIso: string | null }
  | { ok: false; error: string };

// updateHargaAction ports saveHarga()'s validation + write (reference lines
// ~5127-5153): every HARGA_FIELDS entry must be present and >= 0, then the
// full config replaces the config/harga doc via DAS UpdateHarga.
export async function updateHargaAction(
  values: Record<string, number>,
): Promise<UpdateHargaResult> {
  for (const path of HARGA_FIELDS) {
    const v = values[path];
    if (typeof v !== "number" || !isFinite(v) || v < 0) {
      return { ok: false, error: `Field "${path}" harus diisi angka >= 0` };
    }
  }

  const rp = (path: (typeof HARGA_FIELDS)[number]) => Math.round(values[path]);

  try {
    const resp = await updateHarga({
      harga: {
        udang: {
          perKg: rp("udang.perKg"),
          setengahKg: rp("udang.setengahKg"),
          jasaKupasPerKg: rp("udang.jasaKupasPerKg"),
          kupasSetengahSurcharge: rp("udang.kupasSetengahSurcharge"),
        },
        cumi: {
          perKg: rp("cumi.perKg"),
          setengahKg: rp("cumi.setengahKg"),
        },
        kembung: {
          perKg: rp("kembung.perKg"),
          setengahKg: rp("kembung.setengahKg"),
          jasaBersihPerKg: rp("kembung.jasaBersihPerKg"),
        },
        teriNasi: {
          pricePerPack: rp("teriNasi.pricePerPack"),
          kgPerPack: values["teriNasi.kgPerPack"],
          hargaSatuKg: rp("teriNasi.hargaSatuKg"),
        },
        ongkir: {
          normal: rp("ongkir.normal"),
          bogorTangerang: rp("ongkir.bogorTangerang"),
          minKgBogorTangerang: values["ongkir.minKgBogorTangerang"],
          minKgDefault: values["ongkir.minKgDefault"],
        },
      },
    });
    const u = resp.harga?.updatedAt;
    return {
      ok: true,
      updatedAtIso: u instanceof Date && !isNaN(u.getTime()) ? u.toISOString() : null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
