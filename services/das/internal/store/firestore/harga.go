package firestore

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"

	"udangujang/das/internal/domain"
)

type hargaDoc struct {
	Udang struct {
		PerKg                  int64 `firestore:"perKg"`
		SetengahKg             int64 `firestore:"setengahKg"`
		JasaKupasPerKg         int64 `firestore:"jasaKupasPerKg"`
		KupasSetengahSurcharge int64 `firestore:"kupasSetengahSurcharge"`
	} `firestore:"udang"`
	Cumi struct {
		PerKg      int64 `firestore:"perKg"`
		SetengahKg int64 `firestore:"setengahKg"`
	} `firestore:"cumi"`
	Kembung struct {
		PerKg           int64 `firestore:"perKg"`
		SetengahKg      int64 `firestore:"setengahKg"`
		JasaBersihPerKg int64 `firestore:"jasaBersihPerKg"`
	} `firestore:"kembung"`
	TeriNasi struct {
		PricePerPack int64   `firestore:"pricePerPack"`
		KgPerPack    float64 `firestore:"kgPerPack"`
		HargaSatuKg  int64   `firestore:"hargaSatuKg"`
	} `firestore:"teriNasi"`
	Ongkir struct {
		Normal              int64   `firestore:"normal"`
		BogorTangerang      int64   `firestore:"bogorTangerang"`
		MinKgBogorTangerang float64 `firestore:"minKgBogorTangerang"`
		MinKgDefault        float64 `firestore:"minKgDefault"`
	} `firestore:"ongkir"`
	UpdatedAt time.Time `firestore:"updatedAt"`
}

// HargaRepository implements domain.HargaRepository against Firestore.
// config/harga is a singleton doc (collection "config", doc ID "harga") —
// see docs/migration-context.md § shared/config/harga.
type HargaRepository struct {
	client *firestore.Client
}

func NewHargaRepository(client *firestore.Client) *HargaRepository {
	return &HargaRepository{client: client}
}

func (r *HargaRepository) Get(ctx context.Context) (domain.HargaConfig, error) {
	snap, err := r.client.Collection(CollectionConfig).Doc(ConfigHargaDocID).Get(ctx)
	if err != nil {
		return domain.HargaConfig{}, fmt.Errorf("firestore: get config/harga: %w", err)
	}
	var doc hargaDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.HargaConfig{}, fmt.Errorf("firestore: decode config/harga: %w", err)
	}

	var cfg domain.HargaConfig
	cfg.Udang.PerKg = doc.Udang.PerKg
	cfg.Udang.SetengahKg = doc.Udang.SetengahKg
	cfg.Udang.JasaKupasPerKg = doc.Udang.JasaKupasPerKg
	cfg.Udang.KupasSetengahSurcharge = doc.Udang.KupasSetengahSurcharge
	cfg.Cumi.PerKg = doc.Cumi.PerKg
	cfg.Cumi.SetengahKg = doc.Cumi.SetengahKg
	cfg.Kembung.PerKg = doc.Kembung.PerKg
	cfg.Kembung.SetengahKg = doc.Kembung.SetengahKg
	cfg.Kembung.JasaBersihPerKg = doc.Kembung.JasaBersihPerKg
	cfg.TeriNasi.PricePerPack = doc.TeriNasi.PricePerPack
	cfg.TeriNasi.KgPerPack = doc.TeriNasi.KgPerPack
	cfg.TeriNasi.HargaSatuKg = doc.TeriNasi.HargaSatuKg
	cfg.Ongkir.Normal = doc.Ongkir.Normal
	cfg.Ongkir.BogorTangerang = doc.Ongkir.BogorTangerang
	cfg.Ongkir.MinKgBogorTangerang = doc.Ongkir.MinKgBogorTangerang
	cfg.Ongkir.MinKgDefault = doc.Ongkir.MinKgDefault
	cfg.UpdatedAt = doc.UpdatedAt
	return cfg, nil
}
