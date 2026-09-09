package server

import (
	"context"
	"testing"

	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
)

func TestCreateAndListWilayah(t *testing.T) {
	ctx := context.Background()
	s := NewWilayahServer(newFakeWilayahRepo())

	if _, err := s.CreateWilayah(ctx, &kastamerv1.CreateWilayahRequest{Nama: "Kemang", Kota: "Jakarta Selatan", Provinsi: "DKI Jakarta"}); err != nil {
		t.Fatalf("CreateWilayah: unexpected error: %v", err)
	}

	resp, err := s.ListWilayah(ctx, &kastamerv1.ListWilayahRequest{})
	if err != nil {
		t.Fatalf("ListWilayah: unexpected error: %v", err)
	}
	if got := len(resp.GetWilayah()); got != 1 {
		t.Fatalf("expected 1 wilayah, got %d", got)
	}
	if resp.GetWilayah()[0].GetNama() != "Kemang" {
		t.Fatalf("expected nama %q, got %q", "Kemang", resp.GetWilayah()[0].GetNama())
	}
}
