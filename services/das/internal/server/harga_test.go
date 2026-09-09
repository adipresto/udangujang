package server

import (
	"context"
	"errors"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
	hargav1 "udangujang/das/internal/pb/udangujang/harga/v1"
)

type fakeHargaRepo struct {
	cfg domain.HargaConfig
}

func (f *fakeHargaRepo) Get(ctx context.Context) (domain.HargaConfig, error) {
	return f.cfg, nil
}

func (f *fakeHargaRepo) Update(ctx context.Context, cfg domain.HargaConfig) (domain.HargaConfig, error) {
	cfg.UpdatedAt = time.Now()
	f.cfg = cfg
	return f.cfg, nil
}

func newPromoRepoWith(promos ...domain.Promo) *fakePromoRepo {
	repo := newFakePromoRepo()
	for _, p := range promos {
		repo.put(p)
	}
	return repo
}

func TestValidatePromo_Eligible(t *testing.T) {
	repo := newPromoRepoWith(domain.Promo{
		Code:    "HEMAT10",
		Type:    domain.PromoTypeDiscount,
		Value:   10000,
		Active:  true,
		Expires: time.Now().Add(24 * time.Hour),
		MinKg:   1,
		MaxUses: 100,
	})
	s := NewHargaServer(&fakeHargaRepo{}, repo)

	resp, err := s.ValidatePromo(context.Background(), &hargav1.ValidatePromoRequest{
		KodePromo: "hemat10",
		KgUtuh:    1.5,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.GetValid() {
		t.Fatalf("expected valid promo, got reason %q", resp.GetReason())
	}
	if resp.GetType() != domain.PromoTypeDiscount || resp.GetValue() != 10000 {
		t.Fatalf("unexpected type/value: %+v", resp)
	}
}

func TestValidatePromo_Expired(t *testing.T) {
	repo := newPromoRepoWith(domain.Promo{
		Code:    "LAMA",
		Type:    domain.PromoTypeDiscount,
		Active:  true,
		Expires: time.Now().Add(-24 * time.Hour),
	})
	s := NewHargaServer(&fakeHargaRepo{}, repo)

	resp, err := s.ValidatePromo(context.Background(), &hargav1.ValidatePromoRequest{KodePromo: "LAMA"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetValid() {
		t.Fatalf("expected expired promo to be invalid")
	}
	if resp.GetReason() != "kode promo sudah kedaluwarsa." {
		t.Fatalf("unexpected reason: %q", resp.GetReason())
	}
}

func TestValidatePromo_MinKgFail(t *testing.T) {
	repo := newPromoRepoWith(domain.Promo{
		Code:   "BERAT2KG",
		Type:   domain.PromoTypeDiscount,
		Active: true,
		MinKg:  2,
	})
	s := NewHargaServer(&fakeHargaRepo{}, repo)

	resp, err := s.ValidatePromo(context.Background(), &hargav1.ValidatePromoRequest{
		KodePromo: "BERAT2KG",
		KgUtuh:    1,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetValid() {
		t.Fatalf("expected promo to fail minKg check")
	}
	if resp.GetReason() == "" {
		t.Fatalf("expected a reason to be set")
	}
}

func TestValidatePromo_QuotaOut(t *testing.T) {
	repo := newPromoRepoWith(domain.Promo{
		Code:      "HABIS",
		Type:      domain.PromoTypeDiscount,
		Active:    true,
		MaxUses:   5,
		UsedCount: 5,
	})
	s := NewHargaServer(&fakeHargaRepo{}, repo)

	resp, err := s.ValidatePromo(context.Background(), &hargav1.ValidatePromoRequest{KodePromo: "HABIS"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetValid() {
		t.Fatalf("expected promo quota to be exhausted")
	}
	if resp.GetReason() != "kuota promo sudah habis." {
		t.Fatalf("unexpected reason: %q", resp.GetReason())
	}
}

func TestValidatePromo_NotFound(t *testing.T) {
	s := NewHargaServer(&fakeHargaRepo{}, newFakePromoRepo())

	resp, err := s.ValidatePromo(context.Background(), &hargav1.ValidatePromoRequest{KodePromo: "GAADA"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetValid() {
		t.Fatalf("expected not-found promo to be invalid")
	}
}

func TestGetHarga(t *testing.T) {
	cfg := domain.HargaConfig{}
	cfg.Udang.PerKg = 98000
	cfg.Ongkir.Normal = 10000
	s := NewHargaServer(&fakeHargaRepo{cfg: cfg}, newFakePromoRepo())

	resp, err := s.GetHarga(context.Background(), &hargav1.GetHargaRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetHarga().GetUdang().GetPerKg() != 98000 {
		t.Fatalf("unexpected udang.perKg: %+v", resp.GetHarga())
	}
	if resp.GetHarga().GetOngkir().GetNormal() != 10000 {
		t.Fatalf("unexpected ongkir.normal: %+v", resp.GetHarga())
	}
}

func TestUpdateHarga_Roundtrip(t *testing.T) {
	s := NewHargaServer(&fakeHargaRepo{}, newFakePromoRepo())

	req := &hargav1.UpdateHargaRequest{Harga: &hargav1.HargaConfig{
		Udang:    &hargav1.HargaUdang{PerKg: 99000, SetengahKg: 53000, JasaKupasPerKg: 5000, KupasSetengahSurcharge: 3000},
		Cumi:     &hargav1.HargaCumi{PerKg: 102000, SetengahKg: 53000},
		Kembung:  &hargav1.HargaKembung{PerKg: 58000, SetengahKg: 30000, JasaBersihPerKg: 5000},
		TeriNasi: &hargav1.HargaTeriNasi{PricePerPack: 20000, KgPerPack: 0.25, HargaSatuKg: 75000},
		Ongkir:   &hargav1.HargaOngkir{Normal: 10000, BogorTangerang: 15000, MinKgBogorTangerang: 2, MinKgDefault: 0.5},
	}}
	resp, err := s.UpdateHarga(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetHarga().GetUdang().GetPerKg() != 99000 {
		t.Fatalf("unexpected udang.perKg after update: %+v", resp.GetHarga())
	}
	if resp.GetHarga().GetUpdatedAt() == nil {
		t.Fatalf("expected updated_at to be set server-side")
	}

	getResp, err := s.GetHarga(context.Background(), &hargav1.GetHargaRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if getResp.GetHarga().GetUdang().GetPerKg() != 99000 {
		t.Fatalf("GetHarga did not reflect UpdateHarga: %+v", getResp.GetHarga())
	}
}

func TestUpdateHarga_RejectsNegative(t *testing.T) {
	s := NewHargaServer(&fakeHargaRepo{}, newFakePromoRepo())

	req := &hargav1.UpdateHargaRequest{Harga: &hargav1.HargaConfig{
		Udang:    &hargav1.HargaUdang{PerKg: -1},
		Cumi:     &hargav1.HargaCumi{},
		Kembung:  &hargav1.HargaKembung{},
		TeriNasi: &hargav1.HargaTeriNasi{},
		Ongkir:   &hargav1.HargaOngkir{},
	}}
	if _, err := s.UpdateHarga(context.Background(), req); err == nil {
		t.Fatalf("expected error for negative field")
	}
}

func TestPromoLifecycle_CreateToggleDelete(t *testing.T) {
	s := NewHargaServer(&fakeHargaRepo{}, newFakePromoRepo())

	created, err := s.CreatePromo(context.Background(), &hargav1.CreatePromoRequest{Promo: &hargav1.Promo{
		Code:   "udang25",
		Type:   domain.PromoTypeDiscount,
		Value:  25000,
		Active: true,
	}})
	if err != nil {
		t.Fatalf("unexpected error creating promo: %v", err)
	}
	if created.GetPromo().GetCode() != "UDANG25" {
		t.Fatalf("expected code to be uppercased, got %q", created.GetPromo().GetCode())
	}
	if created.GetPromo().GetUsedCount() != 0 {
		t.Fatalf("expected new promo usedCount 0, got %d", created.GetPromo().GetUsedCount())
	}

	// Duplicate create must fail.
	if _, err := s.CreatePromo(context.Background(), &hargav1.CreatePromoRequest{Promo: &hargav1.Promo{
		Code: "UDANG25", Type: domain.PromoTypeDiscount, Value: 1,
	}}); err == nil {
		t.Fatalf("expected error creating duplicate promo code")
	}

	toggled, err := s.SetPromoActive(context.Background(), &hargav1.SetPromoActiveRequest{Code: "udang25", Active: false})
	if err != nil {
		t.Fatalf("unexpected error toggling promo: %v", err)
	}
	if toggled.GetPromo().GetActive() {
		t.Fatalf("expected promo to be inactive after toggle")
	}

	list, err := s.ListPromos(context.Background(), &hargav1.ListPromosRequest{})
	if err != nil {
		t.Fatalf("unexpected error listing promos: %v", err)
	}
	if len(list.GetPromos()) != 1 {
		t.Fatalf("expected 1 promo in list, got %d", len(list.GetPromos()))
	}

	if _, err := s.DeletePromo(context.Background(), &hargav1.DeletePromoRequest{Code: "UDANG25"}); err != nil {
		t.Fatalf("unexpected error deleting promo: %v", err)
	}
	if _, err := s.promoRepo.GetPromo(context.Background(), "UDANG25"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected promo to be gone after delete, err=%v", err)
	}
}

func TestUpdatePromo_UsedCountUnchanged(t *testing.T) {
	repo := newPromoRepoWith(domain.Promo{
		Code:      "HEMAT10",
		Type:      domain.PromoTypeDiscount,
		Value:     10000,
		Active:    true,
		UsedCount: 7,
	})
	s := NewHargaServer(&fakeHargaRepo{}, repo)

	resp, err := s.UpdatePromo(context.Background(), &hargav1.UpdatePromoRequest{Promo: &hargav1.Promo{
		Code:      "HEMAT10",
		Type:      domain.PromoTypeDiscount,
		Value:     20000,
		Active:    true,
		UsedCount: 999, // must be ignored — usedCount is read-only via RPC
	}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.GetPromo().GetUsedCount() != 7 {
		t.Fatalf("expected usedCount to stay 7, got %d", resp.GetPromo().GetUsedCount())
	}
	if resp.GetPromo().GetValue() != 20000 {
		t.Fatalf("expected value to update to 20000, got %v", resp.GetPromo().GetValue())
	}
}

func TestUpdatePromo_NotFound(t *testing.T) {
	s := NewHargaServer(&fakeHargaRepo{}, newFakePromoRepo())

	if _, err := s.UpdatePromo(context.Background(), &hargav1.UpdatePromoRequest{Promo: &hargav1.Promo{
		Code: "GAADA", Type: domain.PromoTypeDiscount, Value: 1,
	}}); !errors.Is(err, domain.ErrNotFound) {
		if st, ok := status.FromError(err); !ok || st.Code() != codes.NotFound {
			t.Fatalf("expected NotFound error, got %v", err)
		}
	}
}
