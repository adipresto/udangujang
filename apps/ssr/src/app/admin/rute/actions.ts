"use server";

import { revalidatePath } from "next/cache";
import { deleteRute, saveRute, updateDepot, type Depot } from "@/lib/das-client";

// saveRuteAction mirrors persistRouteOrder() (reference/udang-dashboard/
// index.html ~line 2808): upsert pesananIds for tanggal. Called per action
// from the client island — no debounce, keep it simple.
export async function saveRuteAction(
  tanggal: string,
  pesananIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, error: "Tanggal tidak valid (YYYY-MM-DD)." };
  }
  try {
    await saveRute(tanggal, pesananIds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/rute");
  return { ok: true };
}

// resetRuteAction mirrors resetRuteHariIni() (reference ~line 3002): delete
// the saved order for tanggal so stops fall back to default order.
export async function resetRuteAction(
  tanggal: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, error: "Tanggal tidak valid (YYYY-MM-DD)." };
  }
  try {
    await deleteRute(tanggal);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/rute");
  return { ok: true };
}

export interface DepotInput {
  nama: string;
  alamat: string;
  lat: number;
  lng: number;
  mapsLink: string;
}

// updateDepotAction mirrors saveDepot() (reference ~line 3180): nama + lat/lng
// required — the DAS also enforces this server-side.
export async function updateDepotAction(
  input: DepotInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.nama.trim()) return { ok: false, error: "Nama tempat wajib diisi." };
  if (!isFinite(input.lat) || !isFinite(input.lng) || (input.lat === 0 && input.lng === 0)) {
    return { ok: false, error: "Latitude & Longitude wajib diisi." };
  }
  const depot: Depot = {
    nama: input.nama.trim(),
    alamat: input.alamat.trim(),
    lat: input.lat,
    lng: input.lng,
    mapsLink: input.mapsLink.trim(),
  };
  try {
    await updateDepot(depot);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/rute");
  return { ok: true };
}
