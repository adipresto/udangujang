// Package domain holds DAS's storage-agnostic entities and repository
// interfaces. Nothing here may import a storage SDK (e.g. Firestore) or a
// generated proto package — see docs/architecture.md's repository pattern.
package domain

import "errors"

var (
	// ErrNotFound is returned by repositories when a lookup finds no record.
	ErrNotFound = errors.New("domain: not found")

	// ErrDuplicateNoHp is returned by KastamerRepository.Create when a
	// Kastamer with the same NoHp already exists — NoHp is the unique key.
	ErrDuplicateNoHp = errors.New("domain: kastamer with this no_hp already exists")

	// ErrDuplicateCode is returned by PromoRepository.CreatePromo when a
	// Promo with the same Code already exists — Code is the unique key.
	ErrDuplicateCode = errors.New("domain: promo with this code already exists")
)
