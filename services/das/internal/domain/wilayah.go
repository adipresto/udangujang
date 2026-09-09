package domain

import (
	"context"
	"time"
)

// Wilayah is a delivery area, unchanged in shape from the pre-merge schema
// (see docs/migration-context.md) — it is now the FK target of Alamat
// instead of Kastamer directly.
type Wilayah struct {
	ID        string
	Nama      string
	Kota      string
	Provinsi  string
	CreatedAt time.Time
}

type WilayahRepository interface {
	Create(ctx context.Context, w Wilayah) (Wilayah, error)
	List(ctx context.Context) ([]Wilayah, error)
}
