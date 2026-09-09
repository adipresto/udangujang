package firestore

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
)

type alamatDoc struct {
	KastamerID string    `firestore:"kastamerId"`
	WilayahID  string    `firestore:"wilayahId"`
	Label      string    `firestore:"label"`
	Alamat     string    `firestore:"alamat"`
	Lat        float64   `firestore:"lat"`
	Lng        float64   `firestore:"lng"`
	MapsLink   string    `firestore:"mapsLink"`
	IsDefault  bool      `firestore:"isDefault"`
	CreatedAt  time.Time `firestore:"createdAt"`
	UpdatedAt  time.Time `firestore:"updatedAt"`
}

// AlamatRepository implements domain.AlamatRepository against Firestore.
type AlamatRepository struct {
	client *firestore.Client
}

func NewAlamatRepository(client *firestore.Client) *AlamatRepository {
	return &AlamatRepository{client: client}
}

func (r *AlamatRepository) Create(ctx context.Context, a domain.Alamat) (domain.Alamat, error) {
	now := time.Now().UTC()
	if a.CreatedAt.IsZero() {
		a.CreatedAt = now
	}
	a.UpdatedAt = now

	ref := r.client.Collection(CollectionAlamat).NewDoc()
	if _, err := ref.Set(ctx, alamatToDoc(a)); err != nil {
		return domain.Alamat{}, fmt.Errorf("firestore: create alamat: %w", err)
	}
	a.ID = ref.ID
	return a, nil
}

func (r *AlamatRepository) ListByKastamer(ctx context.Context, kastamerID string) ([]domain.Alamat, error) {
	iter := r.client.Collection(CollectionAlamat).Where("kastamerId", "==", kastamerID).Documents(ctx)
	defer iter.Stop()

	var out []domain.Alamat
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list alamat by kastamer: %w", err)
		}
		var doc alamatDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode alamat %s: %w", snap.Ref.ID, err)
		}
		out = append(out, alamatFromDoc(snap.Ref.ID, doc))
	}
	return out, nil
}

// Update overwrites the mutable fields only — KastamerID and CreatedAt are
// preserved from the existing doc via read-merge-write, since
// UpdateAlamatRequest never carries them (see kastamer.proto).
func (r *AlamatRepository) Update(ctx context.Context, a domain.Alamat) (domain.Alamat, error) {
	ref := r.client.Collection(CollectionAlamat).Doc(a.ID)
	snap, err := ref.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Alamat{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Alamat{}, fmt.Errorf("firestore: get alamat %s: %w", a.ID, err)
	}
	var doc alamatDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Alamat{}, fmt.Errorf("firestore: decode alamat %s: %w", a.ID, err)
	}

	doc.WilayahID = a.WilayahID
	doc.Label = a.Label
	doc.Alamat = a.Alamat
	doc.Lat = a.Lat
	doc.Lng = a.Lng
	doc.MapsLink = a.MapsLink
	doc.IsDefault = a.IsDefault
	doc.UpdatedAt = time.Now().UTC()

	if _, err := ref.Set(ctx, doc); err != nil {
		return domain.Alamat{}, fmt.Errorf("firestore: update alamat %s: %w", a.ID, err)
	}
	return alamatFromDoc(a.ID, doc), nil
}

func alamatToDoc(a domain.Alamat) alamatDoc {
	return alamatDoc{
		KastamerID: a.KastamerID,
		WilayahID:  a.WilayahID,
		Label:      a.Label,
		Alamat:     a.Alamat,
		Lat:        a.Lat,
		Lng:        a.Lng,
		MapsLink:   a.MapsLink,
		IsDefault:  a.IsDefault,
		CreatedAt:  a.CreatedAt,
		UpdatedAt:  a.UpdatedAt,
	}
}

func alamatFromDoc(id string, doc alamatDoc) domain.Alamat {
	return domain.Alamat{
		ID:         id,
		KastamerID: doc.KastamerID,
		WilayahID:  doc.WilayahID,
		Label:      doc.Label,
		Alamat:     doc.Alamat,
		Lat:        doc.Lat,
		Lng:        doc.Lng,
		MapsLink:   doc.MapsLink,
		IsDefault:  doc.IsDefault,
		CreatedAt:  doc.CreatedAt,
		UpdatedAt:  doc.UpdatedAt,
	}
}
