// Command migrate moves the pre-merge Firestore "kastamer" collection
// (id, wilayahId, nama, noHp, alamat, lat, lng, catatan, mapsLink,
// createdAt, updatedAt — see docs/migration-context.md § Alamat) into the
// UDMC-2 shape: a pure "kastamer" profile plus one "alamat" doc per old
// kastamer, marked isDefault=true.
//
// It prints a dry-run plan by default; pass --apply to actually write.
// Pass --from-json to read the old docs from a JSON dump instead of
// Firestore, so the plan can be demoed without production credentials.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"udangujang/das/internal/domain"
	fsstore "udangujang/das/internal/store/firestore"
)

// oldKastamerDoc is the pre-merge "kastamer" doc shape — see
// docs/migration-context.md § Alamat for the verified field list.
type oldKastamerDoc struct {
	ID        string    `json:"id" firestore:"-"`
	WilayahID string    `json:"wilayahId" firestore:"wilayahId"`
	Nama      string    `json:"nama" firestore:"nama"`
	NoHp      string    `json:"noHp" firestore:"noHp"`
	Alamat    string    `json:"alamat" firestore:"alamat"`
	Lat       float64   `json:"lat" firestore:"lat"`
	Lng       float64   `json:"lng" firestore:"lng"`
	Catatan   string    `json:"catatan" firestore:"catatan"`
	MapsLink  string    `json:"mapsLink" firestore:"mapsLink"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// migrationPlan is one old kastamer's worth of migrated output: the
// simplified kastamer profile (same doc ID, so pesanan.kastamerId FKs stay
// valid) and its single default alamat.
type migrationPlan struct {
	OldID    string
	Kastamer domain.Kastamer
	Alamat   domain.Alamat
}

func planFor(old oldKastamerDoc) migrationPlan {
	createdAt := old.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	updatedAt := old.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = createdAt
	}

	return migrationPlan{
		OldID: old.ID,
		Kastamer: domain.Kastamer{
			ID:        old.ID,
			Nama:      old.Nama,
			NoHp:      old.NoHp,
			Catatan:   old.Catatan,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		},
		Alamat: domain.Alamat{
			KastamerID: old.ID,
			WilayahID:  old.WilayahID,
			Alamat:     old.Alamat,
			Lat:        old.Lat,
			Lng:        old.Lng,
			MapsLink:   old.MapsLink,
			IsDefault:  true,
			CreatedAt:  createdAt,
			UpdatedAt:  updatedAt,
		},
	}
}

func main() {
	fromJSON := flag.String("from-json", "", "path to a JSON array dump of old kastamer docs; skips reading Firestore")
	apply := flag.Bool("apply", false, "write the migrated docs to Firestore (default: dry-run, print the plan only)")
	flag.Parse()

	ctx := context.Background()

	oldDocs, err := loadOldDocs(ctx, *fromJSON)
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}

	plans := make([]migrationPlan, 0, len(oldDocs))
	for _, old := range oldDocs {
		plans = append(plans, planFor(old))
	}

	printPlan(plans)

	if !*apply {
		fmt.Printf("\ndry-run only (%d kastamer would be migrated) — pass --apply to write\n", len(plans))
		return
	}

	if *fromJSON != "" {
		log.Fatal("migrate: --apply cannot be combined with --from-json (JSON dump mode is for dry-run demos only); run against Firestore instead")
	}

	client, err := fsstore.NewClient(ctx)
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}
	defer client.Close()

	if err := applyPlans(ctx, client, plans); err != nil {
		log.Fatalf("migrate: apply: %v", err)
	}
	fmt.Printf("migrated %d kastamer\n", len(plans))
}

func loadOldDocs(ctx context.Context, fromJSON string) ([]oldKastamerDoc, error) {
	if fromJSON != "" {
		return readFromJSON(fromJSON)
	}
	client, err := fsstore.NewClient(ctx)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	return readFromFirestore(ctx, client)
}

func readFromJSON(path string) ([]oldKastamerDoc, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	var docs []oldKastamerDoc
	if err := json.NewDecoder(f).Decode(&docs); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	return docs, nil
}

func readFromFirestore(ctx context.Context, client *firestore.Client) ([]oldKastamerDoc, error) {
	iter := client.Collection(fsstore.CollectionKastamer).Documents(ctx)
	defer iter.Stop()

	var out []oldKastamerDoc
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("list kastamer: %w", err)
		}
		var doc oldKastamerDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("decode kastamer %s: %w", snap.Ref.ID, err)
		}
		doc.ID = snap.Ref.ID
		out = append(out, doc)
	}
	return out, nil
}

func applyPlans(ctx context.Context, client *firestore.Client, plans []migrationPlan) error {
	for _, p := range plans {
		// Preserve the original kastamer doc ID so existing pesanan.kastamerId
		// FKs stay valid — this replaces the doc's contents with the
		// simplified profile shape (alamat/lat/lng/wilayahId/mapsLink dropped).
		kastamerRef := client.Collection(fsstore.CollectionKastamer).Doc(p.OldID)
		if _, err := kastamerRef.Set(ctx, map[string]any{
			"nama":      p.Kastamer.Nama,
			"noHp":      p.Kastamer.NoHp,
			"catatan":   p.Kastamer.Catatan,
			"createdAt": p.Kastamer.CreatedAt,
			"updatedAt": p.Kastamer.UpdatedAt,
		}); err != nil {
			return fmt.Errorf("write kastamer %s: %w", p.OldID, err)
		}

		alamatRef := client.Collection(fsstore.CollectionAlamat).NewDoc()
		if _, err := alamatRef.Set(ctx, map[string]any{
			"kastamerId": p.Alamat.KastamerID,
			"wilayahId":  p.Alamat.WilayahID,
			"label":      p.Alamat.Label,
			"alamat":     p.Alamat.Alamat,
			"lat":        p.Alamat.Lat,
			"lng":        p.Alamat.Lng,
			"mapsLink":   p.Alamat.MapsLink,
			"isDefault":  p.Alamat.IsDefault,
			"createdAt":  p.Alamat.CreatedAt,
			"updatedAt":  p.Alamat.UpdatedAt,
		}); err != nil {
			return fmt.Errorf("write alamat for kastamer %s: %w", p.OldID, err)
		}
	}
	return nil
}

func printPlan(plans []migrationPlan) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	for _, p := range plans {
		fmt.Printf("kastamer %s (no_hp=%s):\n", p.OldID, p.Kastamer.NoHp)
		fmt.Print("  new kastamer: ")
		_ = enc.Encode(p.Kastamer)
		fmt.Print("  new alamat (isDefault=true): ")
		_ = enc.Encode(p.Alamat)
	}
}
