// Client-side CSV export — verbatim port of exportAccountingCSV()
// (reference/udang-dashboard/index.html ~lines 4761-4783): header
// Tanggal,Keterangan,Keluar,Masuk + one row per ledger line + TOTAL + Saldo,
// UTF-8 BOM, downloaded via blob as keuangan-ujang-YYYY-MM-DD.csv.

export interface CsvLedgerRow {
  tanggal: string;
  keterangan: string;
  keluar: number;
  masuk: number;
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportLedgerCSV(rows: CsvLedgerRow[]): void {
  const head = ["Tanggal", "Keterangan", "Keluar", "Masuk"];
  const lines = [head.join(",")];
  let totKeluar = 0;
  let totMasuk = 0;
  for (const r of rows) {
    totKeluar += r.keluar;
    totMasuk += r.masuk;
    lines.push(
      [
        r.tanggal,
        csvCell(r.keterangan),
        r.keluar || "",
        r.masuk || "",
      ].join(","),
    );
  }
  lines.push(["TOTAL", "", totKeluar, totMasuk].join(","));
  lines.push(["Saldo", "", "", totMasuk - totKeluar].join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keuangan-ujang-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
