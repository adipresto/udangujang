package firestore

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
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
	return domain.Promo{
		Code:        docID,
		Type:        doc.Type,
		Value:       doc.Value,
		Active:      doc.Active,
		Expires:     doc.Expires,
		MinKg:       doc.MinKg,
		MinKgUtuh:   doc.MinKgUtuh,
		MinKgKupas:  doc.MinKgKupas,
		MinSubtotal: doc.MinSubtotal,
		MaxUses:     doc.MaxUses,
		UsedCount:   doc.UsedCount,
	}, nil
}
