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

type transaksiDoc struct {
	Tanggal    string    `firestore:"tanggal"`
	Keterangan string    `firestore:"keterangan"`
	Kategori   string    `firestore:"kategori"`
	Kg         *float64  `firestore:"kg"`
	HargaPerKg *float64  `firestore:"hargaPerKg"`
	Jumlah     int64     `firestore:"jumlah"`
	Urutan     int       `firestore:"urutan"`
	CreatedAt  time.Time `firestore:"createdAt"`
	UpdatedAt  time.Time `firestore:"updatedAt"`
}

// TransaksiRepository implements domain.TransaksiRepository against
// Firestore's transaksi collection.
type TransaksiRepository struct {
	client *firestore.Client
}

func NewTransaksiRepository(client *firestore.Client) *TransaksiRepository {
	return &TransaksiRepository{client: client}
}

// Create's urutan mirrors saveTrx()'s ADD_TRANSAKSI branch (reference/
// udang-dashboard/index.html line ~4699): the count of existing rows
// dated the same tanggal.
func (r *TransaksiRepository) Create(ctx context.Context, t domain.Transaksi) (domain.Transaksi, error) {
	count, err := r.countByTanggal(ctx, t.Tanggal)
	if err != nil {
		return domain.Transaksi{}, err
	}

	now := time.Now().UTC()
	t.Urutan = count
	t.CreatedAt = now
	t.UpdatedAt = now

	ref := r.client.Collection(CollectionTransaksi).NewDoc()
	if _, err := ref.Set(ctx, transaksiToDoc(t)); err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: create transaksi: %w", err)
	}
	t.ID = ref.ID
	return t, nil
}

func (r *TransaksiRepository) countByTanggal(ctx context.Context, tanggal string) (int, error) {
	iter := r.client.Collection(CollectionTransaksi).Where("tanggal", "==", tanggal).Documents(ctx)
	defer iter.Stop()
	count := 0
	for {
		_, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return 0, fmt.Errorf("firestore: count transaksi tanggal %s: %w", tanggal, err)
		}
		count++
	}
	return count, nil
}

func (r *TransaksiRepository) GetByID(ctx context.Context, id string) (domain.Transaksi, error) {
	snap, err := r.client.Collection(CollectionTransaksi).Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Transaksi{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: get transaksi %s: %w", id, err)
	}
	var doc transaksiDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: decode transaksi %s: %w", id, err)
	}
	return transaksiFromDoc(snap.Ref.ID, doc), nil
}

func (r *TransaksiRepository) List(ctx context.Context, filter domain.TransaksiFilter) ([]domain.Transaksi, error) {
	q := r.client.Collection(CollectionTransaksi).Query
	if filter.TanggalDari != "" {
		q = q.Where("tanggal", ">=", filter.TanggalDari)
	}
	if filter.TanggalSampai != "" {
		q = q.Where("tanggal", "<=", filter.TanggalSampai)
	}
	if filter.Kategori != "" {
		q = q.Where("kategori", "==", filter.Kategori)
	}
	q = q.OrderBy("tanggal", firestore.Asc).OrderBy("urutan", firestore.Asc)
	if filter.Limit > 0 {
		q = q.Limit(filter.Limit)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var out []domain.Transaksi
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list transaksi: %w", err)
		}
		var doc transaksiDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode transaksi %s: %w", snap.Ref.ID, err)
		}
		out = append(out, transaksiFromDoc(snap.Ref.ID, doc))
	}
	return out, nil
}

// Update preserves the stored Urutan/CreatedAt (urutan only changes via
// Reorder) and recomputes UpdatedAt — matches saveTrx()'s
// UPDATE_TRANSAKSI branch, which never touches urutan.
func (r *TransaksiRepository) Update(ctx context.Context, t domain.Transaksi) (domain.Transaksi, error) {
	docRef := r.client.Collection(CollectionTransaksi).Doc(t.ID)
	snap, err := docRef.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Transaksi{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: get transaksi %s: %w", t.ID, err)
	}
	var existingDoc transaksiDoc
	if err := snap.DataTo(&existingDoc); err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: decode transaksi %s: %w", t.ID, err)
	}
	existing := transaksiFromDoc(snap.Ref.ID, existingDoc)

	t.Urutan = existing.Urutan
	t.CreatedAt = existing.CreatedAt
	t.UpdatedAt = time.Now().UTC()

	if _, err := docRef.Set(ctx, transaksiToDoc(t)); err != nil {
		return domain.Transaksi{}, fmt.Errorf("firestore: update transaksi %s: %w", t.ID, err)
	}
	return t, nil
}

func (r *TransaksiRepository) Delete(ctx context.Context, id string) error {
	if _, err := r.client.Collection(CollectionTransaksi).Doc(id).Delete(ctx); err != nil {
		return fmt.Errorf("firestore: delete transaksi %s: %w", id, err)
	}
	return nil
}

// Reorder validates ids is exactly the set of rows dated tanggal before
// writing anything, then commits urutan = 0..len(ids)-1 following ids'
// order in a single batch — matches applyGroupOrder() always operating on
// one date's full manualGroupByDate() result (reference/udang-dashboard/
// index.html lines ~4711-4721).
func (r *TransaksiRepository) Reorder(ctx context.Context, tanggal string, ids []string) ([]domain.Transaksi, error) {
	iter := r.client.Collection(CollectionTransaksi).Where("tanggal", "==", tanggal).Documents(ctx)
	defer iter.Stop()

	byID := make(map[string]domain.Transaksi)
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list transaksi tanggal %s: %w", tanggal, err)
		}
		var doc transaksiDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode transaksi %s: %w", snap.Ref.ID, err)
		}
		byID[snap.Ref.ID] = transaksiFromDoc(snap.Ref.ID, doc)
	}
	if len(ids) != len(byID) {
		return nil, domain.ErrReorderMismatch
	}
	for _, id := range ids {
		if _, ok := byID[id]; !ok {
			return nil, domain.ErrReorderMismatch
		}
	}

	now := time.Now().UTC()
	batch := r.client.Batch()
	for i, id := range ids {
		docRef := r.client.Collection(CollectionTransaksi).Doc(id)
		batch.Update(docRef, []firestore.Update{
			{Path: "urutan", Value: i},
			{Path: "updatedAt", Value: now},
		})
	}
	if _, err := batch.Commit(ctx); err != nil {
		return nil, fmt.Errorf("firestore: reorder transaksi tanggal %s: %w", tanggal, err)
	}

	out := make([]domain.Transaksi, 0, len(ids))
	for i, id := range ids {
		t := byID[id]
		t.Urutan = i
		t.UpdatedAt = now
		out = append(out, t)
	}
	return out, nil
}

func transaksiToDoc(t domain.Transaksi) transaksiDoc {
	return transaksiDoc{
		Tanggal:    t.Tanggal,
		Keterangan: t.Keterangan,
		Kategori:   t.Kategori,
		Kg:         t.Kg,
		HargaPerKg: t.HargaPerKg,
		Jumlah:     t.Jumlah,
		Urutan:     t.Urutan,
		CreatedAt:  t.CreatedAt,
		UpdatedAt:  t.UpdatedAt,
	}
}

func transaksiFromDoc(id string, doc transaksiDoc) domain.Transaksi {
	return domain.Transaksi{
		ID:         id,
		Tanggal:    doc.Tanggal,
		Keterangan: doc.Keterangan,
		Kategori:   doc.Kategori,
		Kg:         doc.Kg,
		HargaPerKg: doc.HargaPerKg,
		Jumlah:     doc.Jumlah,
		Urutan:     doc.Urutan,
		CreatedAt:  doc.CreatedAt,
		UpdatedAt:  doc.UpdatedAt,
	}
}
