package server

import (
	"context"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	rutev1 "udangujang/das/internal/pb/udangujang/rute/v1"
)

func TestSaveGetDeleteRute_Roundtrip(t *testing.T) {
	s := NewRuteServer(newFakeRuteRepo())
	ctx := context.Background()

	got, err := s.GetRute(ctx, &rutev1.GetRuteRequest{Tanggal: "2026-09-09"})
	if err != nil {
		t.Fatalf("unexpected error getting missing rute: %v", err)
	}
	if got.GetRute() != nil {
		t.Fatalf("expected nil rute before save, got %+v", got.GetRute())
	}

	saved, err := s.SaveRute(ctx, &rutev1.SaveRuteRequest{
		Tanggal:    "2026-09-09",
		PesananIds: []string{"p1", "p2"},
	})
	if err != nil {
		t.Fatalf("unexpected error saving rute: %v", err)
	}
	if len(saved.GetRute().GetPesananIds()) != 2 {
		t.Fatalf("expected 2 pesananIds, got %+v", saved.GetRute())
	}
	createdAt := saved.GetRute().GetCreatedAt()

	resaved, err := s.SaveRute(ctx, &rutev1.SaveRuteRequest{
		Tanggal:    "2026-09-09",
		PesananIds: []string{"p2", "p1", "p3"},
	})
	if err != nil {
		t.Fatalf("unexpected error re-saving rute: %v", err)
	}
	if len(resaved.GetRute().GetPesananIds()) != 3 {
		t.Fatalf("expected upsert to reorder to 3 ids, got %+v", resaved.GetRute())
	}
	if resaved.GetRute().GetCreatedAt().AsTime() != createdAt.AsTime() {
		t.Fatalf("expected createdAt to be preserved on upsert")
	}

	got2, err := s.GetRute(ctx, &rutev1.GetRuteRequest{Tanggal: "2026-09-09"})
	if err != nil {
		t.Fatalf("unexpected error getting rute: %v", err)
	}
	if len(got2.GetRute().GetPesananIds()) != 3 {
		t.Fatalf("expected saved rute to roundtrip, got %+v", got2.GetRute())
	}

	if _, err := s.DeleteRute(ctx, &rutev1.DeleteRuteRequest{Tanggal: "2026-09-09"}); err != nil {
		t.Fatalf("unexpected error deleting rute: %v", err)
	}
	got3, err := s.GetRute(ctx, &rutev1.GetRuteRequest{Tanggal: "2026-09-09"})
	if err != nil {
		t.Fatalf("unexpected error getting deleted rute: %v", err)
	}
	if got3.GetRute() != nil {
		t.Fatalf("expected nil rute after delete, got %+v", got3.GetRute())
	}
}

func TestSaveRute_TanggalWajibDiisi(t *testing.T) {
	s := NewRuteServer(newFakeRuteRepo())
	_, err := s.SaveRute(context.Background(), &rutev1.SaveRuteRequest{PesananIds: []string{"p1"}})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", err)
	}
}

func TestDepot_UpdateAndGetRoundtrip(t *testing.T) {
	s := NewRuteServer(newFakeRuteRepo())
	ctx := context.Background()

	got, err := s.GetDepot(ctx, &rutev1.GetDepotRequest{})
	if err != nil {
		t.Fatalf("unexpected error getting missing depot: %v", err)
	}
	if got.GetDepot() != nil {
		t.Fatalf("expected nil depot before update, got %+v", got.GetDepot())
	}

	updated, err := s.UpdateDepot(ctx, &rutev1.UpdateDepotRequest{Depot: &rutev1.Depot{
		Nama:     "Gudang Utama",
		Alamat:   "Jl. Contoh No. 1",
		Lat:      -6.2,
		Lng:      106.8,
		MapsLink: "https://maps.google.com/?q=-6.2,106.8",
	}})
	if err != nil {
		t.Fatalf("unexpected error updating depot: %v", err)
	}
	if updated.GetDepot().GetNama() != "Gudang Utama" {
		t.Fatalf("expected depot nama to roundtrip, got %+v", updated.GetDepot())
	}

	got2, err := s.GetDepot(ctx, &rutev1.GetDepotRequest{})
	if err != nil {
		t.Fatalf("unexpected error getting depot: %v", err)
	}
	if got2.GetDepot().GetLat() != -6.2 || got2.GetDepot().GetLng() != 106.8 {
		t.Fatalf("expected depot to roundtrip, got %+v", got2.GetDepot())
	}
}

func TestUpdateDepot_ValidasiWajib(t *testing.T) {
	s := NewRuteServer(newFakeRuteRepo())
	ctx := context.Background()

	if _, err := s.UpdateDepot(ctx, &rutev1.UpdateDepotRequest{Depot: &rutev1.Depot{Lat: -6.2, Lng: 106.8}}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument for missing nama, got %v", err)
	}
	if _, err := s.UpdateDepot(ctx, &rutev1.UpdateDepotRequest{Depot: &rutev1.Depot{Nama: "Gudang"}}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument for missing lat/lng, got %v", err)
	}
}
