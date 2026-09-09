package domain

import (
	"context"
	"time"
)

// Alamat is one delivery address belonging to a Kastamer. A Kastamer may
// have many Alamat (see docs/migration-context.md § Alamat); IsDefault
// marks which one is used when a flow doesn't ask the customer to pick.
type Alamat struct {
	ID         string
	KastamerID string
	WilayahID  string
	Label      string
	Alamat     string
	Lat        float64
	Lng        float64
	MapsLink   string
	IsDefault  bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type AlamatRepository interface {
	Create(ctx context.Context, a Alamat) (Alamat, error)
	ListByKastamer(ctx context.Context, kastamerID string) ([]Alamat, error)
	Update(ctx context.Context, a Alamat) (Alamat, error)
}
