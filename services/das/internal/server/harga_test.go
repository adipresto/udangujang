package server

import (
	"context"
	"testing"
	"time"

	"udangujang/das/internal/domain"
	hargav1 "udangujang/das/internal/pb/udangujang/harga/v1"
)

type fakeHargaRepo struct {
	cfg domain.HargaConfig
}

func (f *fakeHargaRepo) Get(ctx context.Context) (domain.HargaConfig, error) {
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
