package domain

import (
	"context"
	"time"
)

// Kategori values for Transaksi — see docs/migration-context.md § transaksi.
const (
	KategoriTransaksiBelanja     = "belanja"
	KategoriTransaksiAset        = "aset"
	KategoriTransaksiPrive       = "prive"
	KategoriTransaksiPenyesuaian = "penyesuaian"
)

// Transaksi is a standalone bookkeeping ledger entry — not linked to
// Pesanan/Kastamer. Kg/HargaPerKg are only non-nil when Kategori is
// "belanja" (see reference/udang-dashboard/index.html saveTrx(), lines
// ~4681-4694); every other kategori always has both nil.
type Transaksi struct {
	ID         string
	Tanggal    string // YYYY-MM-DD
	Keterangan string
	Kategori   string
	Kg         *float64
	HargaPerKg *float64
	Jumlah     int64
	Urutan     int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type TransaksiFilter struct {
	TanggalDari   string
	TanggalSampai string
	Kategori      string
	Limit         int
}

// TransaksiRepository is the only write path for the ledger.
//
// Create assigns Urutan = the count of existing rows dated the same
// Tanggal (matches saveTrx()'s ADD_TRANSAKSI branch, reference/
// udang-dashboard/index.html lines ~4699).
//
// Reorder writes Urutan 0..len(ids)-1 following ids' order, but only after
// validating ids is exactly the set of rows dated tanggal — an id from a
// different date, a missing id, or an unknown id all fail with
// ErrReorderMismatch (matches applyGroupOrder() always operating on one
// date's full manualGroupByDate() result, lines ~4711-4721).
type TransaksiRepository interface {
	Create(ctx context.Context, t Transaksi) (Transaksi, error)
	GetByID(ctx context.Context, id string) (Transaksi, error)
	List(ctx context.Context, filter TransaksiFilter) ([]Transaksi, error)
	Update(ctx context.Context, t Transaksi) (Transaksi, error)
	Delete(ctx context.Context, id string) error
	Reorder(ctx context.Context, tanggal string, ids []string) ([]Transaksi, error)
}
