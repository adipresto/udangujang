package firestore

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
)

type promoDoc struct {
	Type        string    `firestore:"type"`
	Value       float64   `firestore:"value"`
	Active      bool      `firestore:"active"`
	Expires     time.Time `firestore:"expires"`
	MinKg       float64   `firestore:"minKg"`
	MaxKg       float64   `firestore:"maxKg"`
	MinKgUtuh   float64   `firestore:"minKgUtuh"`
	MinKgKupas  float64   `firestore:"minKgKupas"`
	MinSubtotal float64   `firestore:"minSubtotal"`
	MaxUses     int       `firestore:"maxUses"`
	UsedCount   int       `firestore:"usedCount"`
}

// PromoRepository implements domain.PromoRepository against Firestore.
// promo_codes doc IDs are the uppercase promo code (see
// docs/migration-context.md § shared/promo_codes) — GetPromo normalizes
// the caller's code to uppercase before the lookup.
type PromoRepository struct {
	client *firestore.Client
}

func NewPromoRepository(client *firestore.Client) *PromoRepository {
	return &PromoRepository{client: client}
}

func (r *PromoRepository) GetPromo(ctx context.Context, code string) (domain.Promo, error) {
	docID := strings.ToUpper(code)
	snap, err := r.client.Collection(CollectionPromoCode).Doc(docID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Promo{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: get promo %s: %w", docID, err)
	}
	var doc promoDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: decode promo %s: %w", docID, err)
	}
	return promoFromDoc(docID, doc), nil
}

// ListPromos returns every promo_codes doc, for the admin promo list
// (renderPromoList() — reference/udang-dashboard/index.html lines
// ~4986-4988).
func (r *PromoRepository) ListPromos(ctx context.Context) ([]domain.Promo, error) {
	iter := r.client.Collection(CollectionPromoCode).Documents(ctx)
	defer iter.Stop()

	var out []domain.Promo
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list promo_codes: %w", err)
		}
		var doc promoDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode promo %s: %w", snap.Ref.ID, err)
		}
		out = append(out, promoFromDoc(snap.Ref.ID, doc))
	}
	return out, nil
}

// CreatePromo fails with ErrDuplicateCode if the code is already taken —
// see savePromo()'s overwrite-with-confirm UX (reference/udang-dashboard/
// index.html lines ~4964-4969), ported as a hard reject here. UsedCount is
// always forced to 0, regardless of what p carries.
func (r *PromoRepository) CreatePromo(ctx context.Context, p domain.Promo) (domain.Promo, error) {
	docID := strings.ToUpper(p.Code)
	ref := r.client.Collection(CollectionPromoCode).Doc(docID)

	if _, err := ref.Get(ctx); status.Code(err) != codes.NotFound {
		if err == nil {
			return domain.Promo{}, domain.ErrDuplicateCode
		}
		return domain.Promo{}, fmt.Errorf("firestore: get promo %s: %w", docID, err)
	}

	p.Code = docID
	p.UsedCount = 0
	if _, err := ref.Set(ctx, toPromoDoc(p)); err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: create promo %s: %w", docID, err)
	}
	return p, nil
}

// UpdatePromo requires the code to already exist (ErrNotFound otherwise)
// and preserves the stored UsedCount regardless of what p carries —
// mirrors savePromo()'s isEdit branch (reference/udang-dashboard/
// index.html lines ~4965-4967).
func (r *PromoRepository) UpdatePromo(ctx context.Context, p domain.Promo) (domain.Promo, error) {
	docID := strings.ToUpper(p.Code)
	ref := r.client.Collection(CollectionPromoCode).Doc(docID)

	snap, err := ref.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Promo{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: get promo %s: %w", docID, err)
	}
	var existing promoDoc
	if err := snap.DataTo(&existing); err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: decode promo %s: %w", docID, err)
	}

	p.Code = docID
	p.UsedCount = existing.UsedCount
	if _, err := ref.Set(ctx, toPromoDoc(p)); err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: update promo %s: %w", docID, err)
	}
	return p, nil
}

// DeletePromo mirrors deletePromo()'s deleteDoc call (reference/
// udang-dashboard/index.html lines ~5029-5034), which does not check
// existence first — deleting an already-absent doc is a no-op, not an
// error.
func (r *PromoRepository) DeletePromo(ctx context.Context, code string) error {
	docID := strings.ToUpper(code)
	if _, err := r.client.Collection(CollectionPromoCode).Doc(docID).Delete(ctx); err != nil {
		return fmt.Errorf("firestore: delete promo %s: %w", docID, err)
	}
	return nil
}

// SetPromoActive flips only the active field, matching togglePromoActive()
// (reference/udang-dashboard/index.html lines ~5015-5023).
func (r *PromoRepository) SetPromoActive(ctx context.Context, code string, active bool) (domain.Promo, error) {
	docID := strings.ToUpper(code)
	ref := r.client.Collection(CollectionPromoCode).Doc(docID)

	if _, err := ref.Update(ctx, []firestore.Update{{Path: "active", Value: active}}); err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.Promo{}, domain.ErrNotFound
		}
		return domain.Promo{}, fmt.Errorf("firestore: set promo %s active: %w", docID, err)
	}

	snap, err := ref.Get(ctx)
	if err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: get promo %s: %w", docID, err)
	}
	var doc promoDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Promo{}, fmt.Errorf("firestore: decode promo %s: %w", docID, err)
	}
	return promoFromDoc(docID, doc), nil
}

func promoFromDoc(code string, doc promoDoc) domain.Promo {
	return domain.Promo{
		Code:        code,
		Type:        doc.Type,
		Value:       doc.Value,
		Active:      doc.Active,
		Expires:     doc.Expires,
		MinKg:       doc.MinKg,
		MaxKg:       doc.MaxKg,
		MinKgUtuh:   doc.MinKgUtuh,
		MinKgKupas:  doc.MinKgKupas,
		MinSubtotal: doc.MinSubtotal,
		MaxUses:     doc.MaxUses,
		UsedCount:   doc.UsedCount,
	}
}

func toPromoDoc(p domain.Promo) promoDoc {
	return promoDoc{
		Type:        p.Type,
		Value:       p.Value,
		Active:      p.Active,
		Expires:     p.Expires,
		MinKg:       p.MinKg,
		MaxKg:       p.MaxKg,
		MinKgUtuh:   p.MinKgUtuh,
		MinKgKupas:  p.MinKgKupas,
		MinSubtotal: p.MinSubtotal,
		MaxUses:     p.MaxUses,
		UsedCount:   p.UsedCount,
	}
}
