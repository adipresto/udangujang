"use server";

import { revalidatePath } from "next/cache";
import { updateStatusPesanan } from "@/lib/das-client";

// Status values mirror domain.StatusPengiriman*/StatusPembayaran* in
// services/das/internal/domain/pesanan.go (verbatim quickStatus() behavior
// from reference/udang-dashboard/index.html: only the flipped field is
// sent, the server stamps tanggalKonfirmasiAntar/tanggalBayar + StatusLog).
export const STATUS_ANTAR = {
  BELUM: "belum_antar",
  SUDAH: "sudah_antar",
} as const;

export const STATUS_BAYAR = {
  BELUM: "belum_bayar",
  SUDAH: "sudah_bayar",
} as const;

export type UpdateStatusResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function validStatus(v: string, allowed: readonly string[]): boolean {
  return allowed.includes(v);
}

// updateAntar flips only status_pengiriman (status_pembayaran untouched —
// proto3 presence, see UpdateStatusPesananRequest).
export async function updateAntar(id: string, value: string): Promise<UpdateStatusResult> {
  if (!id) return { ok: false, error: "id wajib diisi." };
  if (!validStatus(value, [STATUS_ANTAR.BELUM, STATUS_ANTAR.SUDAH])) {
    return { ok: false, error: `status pengiriman tidak dikenal: ${value}` };
  }
  try {
    await updateStatusPesanan({ id, statusPengiriman: value });
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${id}`);
  return { ok: true };
}

// updateBayar flips only status_pembayaran (status_pengiriman untouched).
export async function updateBayar(id: string, value: string): Promise<UpdateStatusResult> {
  if (!id) return { ok: false, error: "id wajib diisi." };
  if (!validStatus(value, [STATUS_BAYAR.BELUM, STATUS_BAYAR.SUDAH])) {
    return { ok: false, error: `status pembayaran tidak dikenal: ${value}` };
  }
  try {
    await updateStatusPesanan({ id, statusPembayaran: value });
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
  revalidatePath("/admin/pesanan");
  revalidatePath(`/admin/pesanan/${id}`);
  return { ok: true };
}
