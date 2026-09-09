package firestore

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
)

type ruteHarianDoc struct {
	Tanggal    string    `firestore:"tanggal"`
	PesananIDs []string  `firestore:"pesananIds"`
	CreatedAt  time.Time `firestore:"createdAt"`
	UpdatedAt  time.Time `firestore:"updatedAt"`
}

type depotDoc struct {
	Nama     string  `firestore:"nama"`
	Alamat   string  `firestore:"alamat"`
	Lat      float64 `firestore:"lat"`
	Lng      float64 `firestore:"lng"`
	MapsLink string  `firestore:"mapsLink"`
}

// RuteRepository implements domain.RuteRepository against Firestore. Route
// docs live in the ruteHarian collection, doc ID = tanggal. Depot lives at
// config/depot, a singleton doc like config/harga.
type RuteRepository struct {
	client *firestore.Client
}

func NewRuteRepository(client *firestore.Client) *RuteRepository {
	return &RuteRepository{client: client}
}

func (r *RuteRepository) Get(ctx context.Context, tanggal string) (domain.RuteHarian, error) {
	snap, err := r.client.Collection(CollectionRuteHarian).Doc(tanggal).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.RuteHarian{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.RuteHarian{}, fmt.Errorf("firestore: get ruteHarian %s: %w", tanggal, err)
	}
	var doc ruteHarianDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.RuteHarian{}, fmt.Errorf("firestore: decode ruteHarian %s: %w", tanggal, err)
	}
	return ruteHarianFromDoc(doc), nil
}

// Save upserts pesananIds for tanggal — matches persistRouteOrder()'s
// upsert-by-tanggal semantics (reference/udang-dashboard/index.html
// ~2808-2814): CreatedAt is preserved on update, set fresh on insert.
func (r *RuteRepository) Save(ctx context.Context, tanggal string, pesananIDs []string) (domain.RuteHarian, error) {
	docRef := r.client.Collection(CollectionRuteHarian).Doc(tanggal)
	snap, err := docRef.Get(ctx)
	now := time.Now().UTC()
	createdAt := now
	if err == nil {
		var existing ruteHarianDoc
		if decodeErr := snap.DataTo(&existing); decodeErr != nil {
			return domain.RuteHarian{}, fmt.Errorf("firestore: decode ruteHarian %s: %w", tanggal, decodeErr)
		}
		createdAt = existing.CreatedAt
	} else if status.Code(err) != codes.NotFound {
		return domain.RuteHarian{}, fmt.Errorf("firestore: get ruteHarian %s: %w", tanggal, err)
	}

	doc := ruteHarianDoc{
		Tanggal:    tanggal,
		PesananIDs: pesananIDs,
		CreatedAt:  createdAt,
		UpdatedAt:  now,
	}
	if _, err := docRef.Set(ctx, doc); err != nil {
		return domain.RuteHarian{}, fmt.Errorf("firestore: save ruteHarian %s: %w", tanggal, err)
	}
	return ruteHarianFromDoc(doc), nil
}

func (r *RuteRepository) Delete(ctx context.Context, tanggal string) error {
	if _, err := r.client.Collection(CollectionRuteHarian).Doc(tanggal).Delete(ctx); err != nil {
		return fmt.Errorf("firestore: delete ruteHarian %s: %w", tanggal, err)
	}
	return nil
}

func (r *RuteRepository) GetDepot(ctx context.Context) (domain.Depot, error) {
	snap, err := r.client.Collection(CollectionConfig).Doc(ConfigDepotDocID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Depot{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Depot{}, fmt.Errorf("firestore: get config/depot: %w", err)
	}
	var doc depotDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Depot{}, fmt.Errorf("firestore: decode config/depot: %w", err)
	}
	return depotFromDoc(doc), nil
}

func (r *RuteRepository) UpdateDepot(ctx context.Context, depot domain.Depot) (domain.Depot, error) {
	doc := depotDoc{
		Nama:     depot.Nama,
		Alamat:   depot.Alamat,
		Lat:      depot.Lat,
		Lng:      depot.Lng,
		MapsLink: depot.MapsLink,
	}
	if _, err := r.client.Collection(CollectionConfig).Doc(ConfigDepotDocID).Set(ctx, doc); err != nil {
		return domain.Depot{}, fmt.Errorf("firestore: update config/depot: %w", err)
	}
	return depotFromDoc(doc), nil
}

func ruteHarianFromDoc(doc ruteHarianDoc) domain.RuteHarian {
	return domain.RuteHarian{
		Tanggal:    doc.Tanggal,
		PesananIDs: doc.PesananIDs,
		CreatedAt:  doc.CreatedAt,
		UpdatedAt:  doc.UpdatedAt,
	}
}

func depotFromDoc(doc depotDoc) domain.Depot {
	return domain.Depot{
		Nama:     doc.Nama,
		Alamat:   doc.Alamat,
		Lat:      doc.Lat,
		Lng:      doc.Lng,
		MapsLink: doc.MapsLink,
	}
}
