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

type kastamerDoc struct {
	Nama      string    `firestore:"nama"`
	NoHp      string    `firestore:"noHp"`
	Catatan   string    `firestore:"catatan"`
	CreatedAt time.Time `firestore:"createdAt"`
	UpdatedAt time.Time `firestore:"updatedAt"`
}

// KastamerRepository implements domain.KastamerRepository against
// Firestore. NoHp uniqueness (the collection's historical dedup key — see
// docs/migration-context.md) is enforced here via a query-before-write,
// since Firestore has no native unique-index constraint.
type KastamerRepository struct {
	client *firestore.Client
}

func NewKastamerRepository(client *firestore.Client) *KastamerRepository {
	return &KastamerRepository{client: client}
}

func (r *KastamerRepository) Create(ctx context.Context, k domain.Kastamer) (domain.Kastamer, error) {
	switch _, err := r.GetByNoHp(ctx, k.NoHp); {
	case err == nil:
		return domain.Kastamer{}, domain.ErrDuplicateNoHp
	case err != domain.ErrNotFound:
		return domain.Kastamer{}, err
	}

	now := time.Now().UTC()
	if k.CreatedAt.IsZero() {
		k.CreatedAt = now
	}
	k.UpdatedAt = now

	ref := r.client.Collection(CollectionKastamer).NewDoc()
	doc := kastamerDoc{Nama: k.Nama, NoHp: k.NoHp, Catatan: k.Catatan, CreatedAt: k.CreatedAt, UpdatedAt: k.UpdatedAt}
	if _, err := ref.Set(ctx, doc); err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: create kastamer: %w", err)
	}
	k.ID = ref.ID
	return k, nil
}

func (r *KastamerRepository) GetByNoHp(ctx context.Context, noHp string) (domain.Kastamer, error) {
	iter := r.client.Collection(CollectionKastamer).Where("noHp", "==", noHp).Limit(1).Documents(ctx)
	defer iter.Stop()

	snap, err := iter.Next()
	if err == iterator.Done {
		return domain.Kastamer{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: get kastamer by no_hp: %w", err)
	}
	var doc kastamerDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: decode kastamer %s: %w", snap.Ref.ID, err)
	}
	return kastamerFromDoc(snap.Ref.ID, doc), nil
}

func (r *KastamerRepository) List(ctx context.Context) ([]domain.Kastamer, error) {
	iter := r.client.Collection(CollectionKastamer).Documents(ctx)
	defer iter.Stop()

	var out []domain.Kastamer
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list kastamer: %w", err)
		}
		var doc kastamerDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode kastamer %s: %w", snap.Ref.ID, err)
		}
		out = append(out, kastamerFromDoc(snap.Ref.ID, doc))
	}
	return out, nil
}

// Update only overwrites Nama/Catatan — NoHp (the unique key) and CreatedAt
// are preserved from the existing doc via read-merge-write, since
// UpdateKastamerRequest never carries them (see kastamer.proto).
func (r *KastamerRepository) Update(ctx context.Context, k domain.Kastamer) (domain.Kastamer, error) {
	ref := r.client.Collection(CollectionKastamer).Doc(k.ID)
	snap, err := ref.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Kastamer{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: get kastamer %s: %w", k.ID, err)
	}
	var doc kastamerDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: decode kastamer %s: %w", k.ID, err)
	}

	doc.Nama = k.Nama
	doc.Catatan = k.Catatan
	doc.UpdatedAt = time.Now().UTC()

	if _, err := ref.Set(ctx, doc); err != nil {
		return domain.Kastamer{}, fmt.Errorf("firestore: update kastamer %s: %w", k.ID, err)
	}
	return kastamerFromDoc(k.ID, doc), nil
}

func kastamerFromDoc(id string, doc kastamerDoc) domain.Kastamer {
	return domain.Kastamer{
		ID:        id,
		Nama:      doc.Nama,
		NoHp:      doc.NoHp,
		Catatan:   doc.Catatan,
		CreatedAt: doc.CreatedAt,
		UpdatedAt: doc.UpdatedAt,
	}
}
