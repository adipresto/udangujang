package domain

import (
	"context"
	"time"
)

// Kastamer is a pure customer profile. Address data used to live inline on
// this record (alamat/lat/lng/wilayahId/mapsLink) but has been split out
// into Alamat (1 Kastamer : N Alamat) — see docs/migration-context.md § Alamat.
type Kastamer struct {
	ID        string
	Nama      string
	NoHp      string
	Catatan   string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// KastamerRepository implementations must enforce NoHp uniqueness: Create
// returns ErrDuplicateNoHp if a Kastamer with the same NoHp already exists.
// This was the unique key in the pre-merge schema too (dedup by noHp).
type KastamerRepository interface {
	Create(ctx context.Context, k Kastamer) (Kastamer, error)
	GetByNoHp(ctx context.Context, noHp string) (Kastamer, error)
	List(ctx context.Context) ([]Kastamer, error)
	Update(ctx context.Context, k Kastamer) (Kastamer, error)
}
