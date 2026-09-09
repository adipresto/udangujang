package server

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
	pesananv1 "udangujang/das/internal/pb/udangujang/pesanan/v1"
)

func newTestPesananServer() (*PesananServer, *fakeKastamerRepo, *fakeAlamatRepo, *fakePromoRepo) {
	kastamerRepo := newFakeKastamerRepo()
	alamatRepo := newFakeAlamatRepo()
	promoRepo := newFakePromoRepo()
	s := NewPesananServer(newFakePesananRepo(), kastamerRepo, alamatRepo, promoRepo)
	return s, kastamerRepo, alamatRepo, promoRepo
}

func validCreatePesananRequest() *pesananv1.CreatePesananRequest {
	return &pesananv1.CreatePesananRequest{
		Nama:             "Budi",
		NoHp:             "081200000001",
		Alamat:           "Jl. Mawar 1",
		MetodePembayaran: "transfer",
		MetodePengiriman: "kurir",
		Items: []*pesananv1.PesananItemInput{
			{Nama: "Udang 1kg", Qty: 1, Satuan: "kg", Harga: 98000},
		},
	}
}

func TestCreatePesanan_ValidReturnsIDAndItems(t *testing.T) {
	ctx := context.Background()
	s, _, _, _ := newTestPesananServer()

	resp, err := s.CreatePesanan(ctx, validCreatePesananRequest())
	if err != nil {
		t.Fatalf("CreatePesanan: unexpected error: %v", err)
	}
	if resp.GetPesananId() == "" {
		t.Fatal("expected non-empty pesanan_id")
	}
	if got := len(resp.GetPesanan().GetItems()); got != 1 {
		t.Fatalf("expected 1 item, got %d", got)
	}
	item := resp.GetPesanan().GetItems()[0]
	if item.GetNama() != "Udang 1kg" || item.GetHarga() != 98000 || item.GetSubtotal() != 98000 {
		t.Fatalf("unexpected item: %+v", item)
	}
	if resp.GetPesanan().GetStatusPengiriman() != domain.StatusPengirimanBelumAntar {
		t.Fatalf("expected status_pengiriman=%q, got %q", domain.StatusPengirimanBelumAntar, resp.GetPesanan().GetStatusPengiriman())
	}
	if resp.GetPesanan().GetStatusPembayaran() != domain.StatusPembayaranBelumBayar {
		t.Fatalf("expected status_pembayaran=%q, got %q", domain.StatusPembayaranBelumBayar, resp.GetPesanan().GetStatusPembayaran())
	}
}

func TestCreatePesanan_DuplicateNoHpReusesKastamer(t *testing.T) {
	ctx := context.Background()
	s, kastamerRepo, _, _ := newTestPesananServer()

	req1 := validCreatePesananRequest()
	resp1, err := s.CreatePesanan(ctx, req1)
	if err != nil {
		t.Fatalf("first CreatePesanan: unexpected error: %v", err)
	}

	req2 := validCreatePesananRequest()
	req2.Alamat = "Jl. Kenanga 2" // different address, same person
	resp2, err := s.CreatePesanan(ctx, req2)
	if err != nil {
		t.Fatalf("second CreatePesanan: unexpected error: %v", err)
	}

	if resp1.GetPesanan().GetKastamerId() != resp2.GetPesanan().GetKastamerId() {
		t.Fatalf("expected same kastamer_id for repeat no_hp, got %q and %q", resp1.GetPesanan().GetKastamerId(), resp2.GetPesanan().GetKastamerId())
	}
	all, err := kastamerRepo.List(ctx)
	if err != nil {
		t.Fatalf("List: unexpected error: %v", err)
	}
	if got := len(all); got != 1 {
		t.Fatalf("expected exactly 1 kastamer (no dupes), got %d", got)
	}
}

func TestCreatePesanan_MatchingAlamatReused(t *testing.T) {
	ctx := context.Background()
	s, _, alamatRepo, _ := newTestPesananServer()

	req1 := validCreatePesananRequest()
	resp1, err := s.CreatePesanan(ctx, req1)
	if err != nil {
		t.Fatalf("first CreatePesanan: unexpected error: %v", err)
	}

	req2 := validCreatePesananRequest() // same nama/no_hp/alamat string
	resp2, err := s.CreatePesanan(ctx, req2)
	if err != nil {
		t.Fatalf("second CreatePesanan: unexpected error: %v", err)
	}

	if resp1.GetPesanan().GetAlamatId() != resp2.GetPesanan().GetAlamatId() {
		t.Fatalf("expected matching alamat string to be reused, got %q and %q", resp1.GetPesanan().GetAlamatId(), resp2.GetPesanan().GetAlamatId())
	}
	list, err := alamatRepo.ListByKastamer(ctx, resp1.GetPesanan().GetKastamerId())
	if err != nil {
		t.Fatalf("ListByKastamer: unexpected error: %v", err)
	}
	if got := len(list); got != 1 {
		t.Fatalf("expected exactly 1 alamat (reused, not duplicated), got %d", got)
	}
}

func TestCreatePesanan_NewAlamatCreatedWhenNotMatching(t *testing.T) {
	ctx := context.Background()
	s, _, alamatRepo, _ := newTestPesananServer()

	req1 := validCreatePesananRequest()
	resp1, err := s.CreatePesanan(ctx, req1)
	if err != nil {
		t.Fatalf("first CreatePesanan: unexpected error: %v", err)
	}

	req2 := validCreatePesananRequest()
	req2.Alamat = "Jl. Kenanga 2"
	resp2, err := s.CreatePesanan(ctx, req2)
	if err != nil {
		t.Fatalf("second CreatePesanan: unexpected error: %v", err)
	}

	if resp1.GetPesanan().GetAlamatId() == resp2.GetPesanan().GetAlamatId() {
		t.Fatal("expected a new alamat for a different address string")
	}
	list, err := alamatRepo.ListByKastamer(ctx, resp1.GetPesanan().GetKastamerId())
	if err != nil {
		t.Fatalf("ListByKastamer: unexpected error: %v", err)
	}
	if got := len(list); got != 2 {
		t.Fatalf("expected 2 alamat, got %d", got)
	}
}

func TestCreatePesanan_InvalidPhoneRejected(t *testing.T) {
	ctx := context.Background()
	s, _, _, _ := newTestPesananServer()

	req := validCreatePesananRequest()
	req.NoHp = "not-a-phone"

	_, err := s.CreatePesanan(ctx, req)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected codes.InvalidArgument for invalid no_hp, got %v (%v)", status.Code(err), err)
	}
}

func TestCreatePesanan_MissingNamaRejected(t *testing.T) {
	ctx := context.Background()
	s, _, _, _ := newTestPesananServer()

	req := validCreatePesananRequest()
	req.Nama = ""

	_, err := s.CreatePesanan(ctx, req)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected codes.InvalidArgument for missing nama, got %v (%v)", status.Code(err), err)
	}
}

func TestCreatePesanan_InactivePromoRejected(t *testing.T) {
	ctx := context.Background()
	s, _, _, promoRepo := newTestPesananServer()
	promoRepo.put(domain.Promo{Code: "MATI2026", Active: false, Type: domain.PromoTypeDiscount, Value: 10000})

	req := validCreatePesananRequest()
	req.KodePromo = "MATI2026"

	_, err := s.CreatePesanan(ctx, req)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected codes.InvalidArgument for inactive promo, got %v (%v)", status.Code(err), err)
	}
}

func TestCreatePesanan_ExpiredPromoRejected(t *testing.T) {
	ctx := context.Background()
	s, _, _, promoRepo := newTestPesananServer()
	promoRepo.put(domain.Promo{
		Code:    "LAMA2020",
		Active:  true,
		Type:    domain.PromoTypeDiscount,
		Value:   10000,
		Expires: time.Now().Add(-24 * time.Hour),
	})

	req := validCreatePesananRequest()
	req.KodePromo = "LAMA2020"

	_, err := s.CreatePesanan(ctx, req)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected codes.InvalidArgument for expired promo, got %v (%v)", status.Code(err), err)
	}
}

func TestCreatePesanan_ValidPromoAccepted(t *testing.T) {
	ctx := context.Background()
	s, _, _, promoRepo := newTestPesananServer()
	promoRepo.put(domain.Promo{
		Code:    "JUMATBERKAH8068",
		Active:  true,
		Type:    domain.PromoTypeDiscount,
		Value:   75000,
		Expires: time.Now().Add(24 * time.Hour),
		MaxUses: 1,
	})

	req := validCreatePesananRequest()
	req.KodePromo = "jumatberkah8068" // lowercase input, doc ID is uppercase

	resp, err := s.CreatePesanan(ctx, req)
	if err != nil {
		t.Fatalf("CreatePesanan: unexpected error: %v", err)
	}
	if resp.GetPesanan().GetKodePromo() != "jumatberkah8068" {
		t.Fatalf("expected kode_promo to be stored as submitted, got %q", resp.GetPesanan().GetKodePromo())
	}
}

func TestCreatePesanan_PromoBelowMinKgRejected(t *testing.T) {
	ctx := context.Background()
	s, _, _, promoRepo := newTestPesananServer()
	promoRepo.put(domain.Promo{
		Code:   "BERAT5KG",
		Active: true,
		Type:   domain.PromoTypeDiscount,
		Value:  10000,
		MinKg:  5,
	})

	req := validCreatePesananRequest() // items total 1kg
	req.KodePromo = "BERAT5KG"

	_, err := s.CreatePesanan(ctx, req)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected codes.InvalidArgument for below-minKg promo, got %v (%v)", status.Code(err), err)
	}
}
