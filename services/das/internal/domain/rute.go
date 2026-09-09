package domain

import (
	"context"
	"time"
)

// RuteHarian mirrors a ruteHarian doc — doc ID is Tanggal. Standalone: not
// joined to Pesanan/Alamat here, that join happens SSR-side (see
// reference/udang-dashboard/index.html getRuteHarian ~2769, persistRouteOrder
// ~2808).
type RuteHarian struct {
	Tanggal    string // YYYY-MM-DD, doc ID
	PesananIDs []string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// Depot is the single depot/gudang point — was localStorage udang-depot-v1
// pre-merge (reference/udang-dashboard/index.html ~2749-2767, ~3204-3221),
// now stored server-side so it's consistent across devices.
type Depot struct {
	Nama     string
	Alamat   string
	Lat      float64
	Lng      float64
	MapsLink string
}

// RuteRepository is the only read/write path for daily routes and the depot.
type RuteRepository interface {
	// Get returns ErrNotFound if no route has been saved yet for tanggal.
	Get(ctx context.Context, tanggal string) (RuteHarian, error)
	// Save upserts pesananIds for tanggal, matching persistRouteOrder()'s
	// upsert-by-tanggal semantics (preserves CreatedAt on update).
	Save(ctx context.Context, tanggal string, pesananIDs []string) (RuteHarian, error)
	Delete(ctx context.Context, tanggal string) error
	// GetDepot returns ErrNotFound if no depot has been configured yet.
	GetDepot(ctx context.Context) (Depot, error)
	UpdateDepot(ctx context.Context, depot Depot) (Depot, error)
}
