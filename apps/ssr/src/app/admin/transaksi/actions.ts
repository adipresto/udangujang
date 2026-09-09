"use server";

import { revalidatePath } from "next/cache";
import {
  createTransaksi,
  deleteTransaksi,
  reorderTransaksi,
  updateTransaksi,
  type Transaksi,
} from "@/lib/das-client";

// Kategori values mirror domain.KategoriTransaksi* in
// services/das/internal/domain/transaksi.go (reference saveTrx validation,
// reference/udang-dashboard/index.html ~lines 4681-4699).
export const KATEGORI_TRANSAKSI = ["belanja", "aset", "prive", "penyesuaian"] as const;

export interface TransaksiFormInput {
  tanggal: string; // YYYY-MM-DD
  keterangan: string;
  kategori: string;
  kg: number | null;
  hargaPerKg: number | null;
  jumlah: number;
}

export type TransaksiActionResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function validateInput(input: TransaksiFormInput): string | null {
  if (!input.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(input.tanggal)) {
    return "Tanggal wajib diisi.";
  }
  if (!input.keterangan.trim()) {
    return "Keterangan wajib diisi.";
  }
  if (!isFinite(input.jumlah) || !(input.jumlah > 0)) {
    return "Total harga wajib diisi.";
  }
  if (input.kategori && !(KATEGORI_TRANSAKSI as readonly string[]).includes(input.kategori)) {
    return `Kategori tidak dikenal: ${input.kategori}`;
  }
  return null;
}

// toProto mirrors saveTrx()'s data shaping (reference ~4681-4694): kg /
// hargaPerKg are only sent when kategori is "belanja" — the DAS also forces
// them to nil server-side for every other kategori. id/urutan/createdAt are
// server-assigned, so create sends blanks and update only carries the id.
function toProto(input: TransaksiFormInput): Transaksi {
  const kategori = input.kategori || "belanja";
  return {
    id: "",
    tanggal: input.tanggal,
    keterangan: input.keterangan.trim(),
    kategori,
    kg: kategori === "belanja" ? (input.kg ?? undefined) : undefined,
    hargaPerKg: kategori === "belanja" ? (input.hargaPerKg ?? undefined) : undefined,
    jumlah: Math.round(input.jumlah),
    urutan: 0,
    createdAt: undefined,
    updatedAt: undefined,
  };
}

export async function createTransaksiAction(
  input: TransaksiFormInput,
): Promise<TransaksiActionResult> {
  const err = validateInput(input);
  if (err) return { ok: false, error: err };
  try {
    await createTransaksi(toProto(input));
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
  revalidatePath("/admin/transaksi");
  return { ok: true };
}

export async function updateTransaksiAction(
  id: string,
  input: TransaksiFormInput,
): Promise<TransaksiActionResult> {
  if (!id) return { ok: false, error: "id wajib diisi." };
  const err = validateInput(input);
  if (err) return { ok: false, error: err };
  try {
    await updateTransaksi(id, toProto(input));
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
  revalidatePath("/admin/transaksi");
  return { ok: true };
}

export async function deleteTransaksiAction(id: string): Promise<TransaksiActionResult> {
  if (!id) return { ok: false, error: "id wajib diisi." };
  try {
    await deleteTransaksi(id);
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
  revalidatePath("/admin/transaksi");
  return { ok: true };
}

// reorderTransaksiAction mirrors applyGroupOrder() (reference ~4711-4721):
// ids must be exactly the set of manual transaksi ids dated tanggal, in the
// desired final order — the DAS writes urutan 0..n-1 following that order.
export async function reorderTransaksiAction(
  tanggal: string,
  ids: string[],
): Promise<TransaksiActionResult> {
  if (!tanggal) return { ok: false, error: "Tanggal wajib diisi." };
  if (!ids || ids.length === 0) return { ok: false, error: "Urutan baru wajib diisi." };
  try {
    await reorderTransaksi(tanggal, ids);
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
  revalidatePath("/admin/transaksi");
  return { ok: true };
}
