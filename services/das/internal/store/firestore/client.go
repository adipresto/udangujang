// Package firestore implements DAS's repository interfaces (see
// internal/domain) against Firestore. Handlers in internal/server must
// depend on the domain interfaces, never on this package's types, so that
// a future postgres/ implementation can be swapped in without touching
// callers — see docs/architecture.md.
package firestore

import (
	"context"
	"fmt"
	"os"

	"cloud.google.com/go/firestore"
)

// defaultProjectID matches the Firestore project shared with the pre-merge
// UUA/udang-dashboard sources — see docs/migration-context.md.
const defaultProjectID = "atminujangudang"

const (
	CollectionKastamer   = "kastamer"
	CollectionAlamat     = "alamat"
	CollectionWilayah    = "wilayah"
	CollectionPesanan    = "pesanan"
	CollectionPromoCode  = "promo_codes"
	CollectionConfig     = "config"
	CollectionTransaksi  = "transaksi"
	CollectionRuteHarian = "ruteHarian"

	// CollectionStatusLog is a subcollection under each pesanan doc
	// (pesanan/{id}/statusLog) — see docs/migration-context.md § pesanan.
	CollectionStatusLog = "statusLog"
)

// ConfigHargaDocID is the singleton doc ID of config/harga — see
// docs/migration-context.md § shared/config/harga.
const ConfigHargaDocID = "harga"

// ConfigDepotDocID is the singleton doc ID of config/depot — was
// localStorage udang-depot-v1 pre-merge, now server-side.
const ConfigDepotDocID = "depot"

// NewClient builds a Firestore client for the project named by
// FIRESTORE_PROJECT_ID, falling back to the production project ID.
func NewClient(ctx context.Context) (*firestore.Client, error) {
	projectID := os.Getenv("FIRESTORE_PROJECT_ID")
	if projectID == "" {
		projectID = defaultProjectID
	}
	client, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("firestore: new client (project %q): %w", projectID, err)
	}
	return client, nil
}
