"use server";

import { createPromo, deletePromo, setPromoActive, updatePromo } from "@/lib/das-client";

// PromoFormInput mirrors every promo_codes field the dashboard form edits
// (reference/udang-dashboard/index.html ~lines 1029-1082). usedCount stays
// read-only — the DAS ignores it on create/update (payment flow owns it).
export interface PromoFormInput {
  code: string;
  type: string;
  value: number;
  active: boolean;
  expires: string; // YYYY-MM-DD, required (reference savePromo ~4939)
  minKg: number;
  maxKg: number;
  minKgUtuh: number;
  minKgKupas: number;
  minSubtotal: number;
  maxUses: number;
}

export type PromoActionResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Reference savePromo validation (~4938-4952): code + expires required,
// discount needs value > 0. Optional numeric constraints default to 0
// (= no limit, reference ~4956-4962).
function validateInput(input: PromoFormInput): string | null {
  const code = (input.code || "").trim().toUpperCase();
  if (!code) return "Kode promo wajib diisi.";
  if (!input.expires) return "Tanggal kedaluwarsa wajib diisi.";
  if (input.type === "discount" && !(input.value > 0)) {
    return "Nominal potongan wajib diisi untuk tipe diskon.";
  }
  for (const [k, v] of [
    ["value", input.value],
    ["minKg", input.minKg],
    ["maxKg", input.maxKg],
    ["minKgUtuh", input.minKgUtuh],
    ["minKgKupas", input.minKgKupas],
    ["minSubtotal", input.minSubtotal],
    ["maxUses", input.maxUses],
  ] as const) {
    if (typeof v !== "number" || !isFinite(v) || v < 0) {
      return `Field "${k}" harus diisi angka >= 0.`;
    }
  }
  return null;
}

function toProto(input: PromoFormInput) {
  const code = input.code.trim().toUpperCase();
  // Reference stores end-of-day local time (expiresStr + 'T23:59:59').
  const expires = new Date(`${input.expires}T23:59:59`);
  return {
    code,
    type: input.type,
    value: input.type === "discount" ? input.value : 0,
    active: input.active,
    expires: isNaN(expires.getTime()) ? undefined : expires,
    minKg: input.minKg || 0,
    maxKg: input.maxKg || 0,
    minKgUtuh: input.minKgUtuh || 0,
    minKgKupas: input.minKgKupas || 0,
    minSubtotal: input.minSubtotal || 0,
    maxUses: Math.round(input.maxUses) || 0,
    usedCount: 0, // read-only — DAS ignores on create/update
  };
}

export async function createPromoAction(input: PromoFormInput): Promise<PromoActionResult> {
  const err = validateInput(input);
  if (err) return { ok: false, error: err };
  try {
    await createPromo({ promo: toProto(input) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function updatePromoAction(input: PromoFormInput): Promise<PromoActionResult> {
  const err = validateInput(input);
  if (err) return { ok: false, error: err };
  try {
    await updatePromo({ promo: toProto(input) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function deletePromoAction(code: string): Promise<PromoActionResult> {
  if (!code.trim()) return { ok: false, error: "Kode promo wajib diisi." };
  try {
    await deletePromo(code.trim().toUpperCase());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function setPromoActiveAction(
  code: string,
  active: boolean,
): Promise<PromoActionResult> {
  if (!code.trim()) return { ok: false, error: "Kode promo wajib diisi." };
  try {
    await setPromoActive(code.trim().toUpperCase(), active);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}
