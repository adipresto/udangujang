package server

import (
	"context"
	"testing"

	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
)

func TestCreateAlamat_FirstBecomesDefault(t *testing.T) {
	ctx := context.Background()
	s := NewAlamatServer(newFakeAlamatRepo())

	resp, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{
		KastamerId: "kastamer-1",
		Alamat:     "Jl. Mawar 1",
		IsDefault:  false, // caller didn't ask for default; should still become default
	})
	if err != nil {
		t.Fatalf("CreateAlamat: unexpected error: %v", err)
	}
	if !resp.GetAlamat().GetIsDefault() {
		t.Fatal("expected first alamat for a kastamer to become default")
	}
}

func TestCreateAlamat_SubsequentKeepsRequestedDefault(t *testing.T) {
	ctx := context.Background()
	s := NewAlamatServer(newFakeAlamatRepo())

	first, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{KastamerId: "kastamer-1", Alamat: "Jl. Mawar 1"})
	if err != nil {
		t.Fatalf("CreateAlamat (first): unexpected error: %v", err)
	}
	if !first.GetAlamat().GetIsDefault() {
		t.Fatal("expected first alamat to be default")
	}

	second, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{
		KastamerId: "kastamer-1",
		Alamat:     "Jl. Kenanga 2",
		IsDefault:  false,
	})
	if err != nil {
		t.Fatalf("CreateAlamat (second): unexpected error: %v", err)
	}
	if second.GetAlamat().GetIsDefault() {
		t.Fatal("expected second alamat to keep the requested (non-default) value")
	}
}

func TestListAlamatByKastamer_Filtering(t *testing.T) {
	ctx := context.Background()
	s := NewAlamatServer(newFakeAlamatRepo())

	if _, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{KastamerId: "kastamer-1", Alamat: "Jl. Mawar 1"}); err != nil {
		t.Fatalf("CreateAlamat: unexpected error: %v", err)
	}
	if _, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{KastamerId: "kastamer-1", Alamat: "Jl. Kenanga 2"}); err != nil {
		t.Fatalf("CreateAlamat: unexpected error: %v", err)
	}
	if _, err := s.CreateAlamat(ctx, &kastamerv1.CreateAlamatRequest{KastamerId: "kastamer-2", Alamat: "Jl. Melati 3"}); err != nil {
		t.Fatalf("CreateAlamat: unexpected error: %v", err)
	}

	resp, err := s.ListAlamatByKastamer(ctx, &kastamerv1.ListAlamatByKastamerRequest{KastamerId: "kastamer-1"})
	if err != nil {
		t.Fatalf("ListAlamatByKastamer: unexpected error: %v", err)
	}
	if got := len(resp.GetAlamat()); got != 2 {
		t.Fatalf("expected 2 alamat for kastamer-1, got %d", got)
	}
	for _, a := range resp.GetAlamat() {
		if a.GetKastamerId() != "kastamer-1" {
			t.Fatalf("expected only kastamer-1 alamat, got one for %q", a.GetKastamerId())
		}
	}
}
