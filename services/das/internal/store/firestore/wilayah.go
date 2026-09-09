package firestore

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"udangujang/das/internal/domain"
)

type wilayahDoc struct {
	Nama      string    `firestore:"nama"`
	Kota      string    `firestore:"kota"`
	Provinsi  string    `firestore:"provinsi"`
	CreatedAt time.Time `firestore:"createdAt"`
}

// WilayahRepository implements domain.WilayahRepository against Firestore.
type WilayahRepository struct {
	client *firestore.Client
}

func NewWilayahRepository(client *firestore.Client) *WilayahRepository {
	return &WilayahRepository{client: client}
}

func (r *WilayahRepository) Create(ctx context.Context, w domain.Wilayah) (domain.Wilayah, error) {
	if w.CreatedAt.IsZero() {
		w.CreatedAt = time.Now().UTC()
	}
	ref := r.client.Collection(CollectionWilayah).NewDoc()
	doc := wilayahDoc{Nama: w.Nama, Kota: w.Kota, Provinsi: w.Provinsi, CreatedAt: w.CreatedAt}
	if _, err := ref.Set(ctx, doc); err != nil {
		return domain.Wilayah{}, fmt.Errorf("firestore: create wilayah: %w", err)
	}
	w.ID = ref.ID
	return w, nil
}

func (r *WilayahRepository) List(ctx context.Context) ([]domain.Wilayah, error) {
	iter := r.client.Collection(CollectionWilayah).Documents(ctx)
	defer iter.Stop()

	var out []domain.Wilayah
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list wilayah: %w", err)
		}
		var doc wilayahDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode wilayah %s: %w", snap.Ref.ID, err)
		}
		out = append(out, domain.Wilayah{
			ID:        snap.Ref.ID,
			Nama:      doc.Nama,
			Kota:      doc.Kota,
			Provinsi:  doc.Provinsi,
			CreatedAt: doc.CreatedAt,
		})
	}
	return out, nil
}
