package server

import (
	"context"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
)

func TestCreateKastamer_DuplicateNoHpRejected(t *testing.T) {
	ctx := context.Background()
	s := NewKastamerServer(newFakeKastamerRepo())

	if _, err := s.CreateKastamer(ctx, &kastamerv1.CreateKastamerRequest{Nama: "Budi", NoHp: "0812000001"}); err != nil {
		t.Fatalf("first CreateKastamer: unexpected error: %v", err)
	}

	_, err := s.CreateKastamer(ctx, &kastamerv1.CreateKastamerRequest{Nama: "Budi Lain", NoHp: "0812000001"})
	if err == nil {
		t.Fatal("second CreateKastamer with duplicate no_hp: expected error, got nil")
	}
	if got := status.Code(err); got != codes.AlreadyExists {
		t.Fatalf("expected codes.AlreadyExists, got %v (%v)", got, err)
	}
}

func TestGetKastamerByNoHp(t *testing.T) {
	ctx := context.Background()
	s := NewKastamerServer(newFakeKastamerRepo())

	created, err := s.CreateKastamer(ctx, &kastamerv1.CreateKastamerRequest{Nama: "Budi", NoHp: "0812000002"})
	if err != nil {
		t.Fatalf("CreateKastamer: unexpected error: %v", err)
	}

	got, err := s.GetKastamerByNoHp(ctx, &kastamerv1.GetKastamerByNoHpRequest{NoHp: "0812000002"})
	if err != nil {
		t.Fatalf("GetKastamerByNoHp: unexpected error: %v", err)
	}
	if got.GetKastamer().GetId() != created.GetKastamer().GetId() {
		t.Fatalf("expected id %q, got %q", created.GetKastamer().GetId(), got.GetKastamer().GetId())
	}

	_, err = s.GetKastamerByNoHp(ctx, &kastamerv1.GetKastamerByNoHpRequest{NoHp: "not-registered"})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("expected codes.NotFound for unknown no_hp, got %v (%v)", status.Code(err), err)
	}
}

func TestUpdateKastamer_PreservesNoHp(t *testing.T) {
	ctx := context.Background()
	s := NewKastamerServer(newFakeKastamerRepo())

	created, err := s.CreateKastamer(ctx, &kastamerv1.CreateKastamerRequest{Nama: "Budi", NoHp: "0812000003"})
	if err != nil {
		t.Fatalf("CreateKastamer: unexpected error: %v", err)
	}

	updated, err := s.UpdateKastamer(ctx, &kastamerv1.UpdateKastamerRequest{
		Id:      created.GetKastamer().GetId(),
		Nama:    "Budi Santoso",
		Catatan: "pelanggan lama",
	})
	if err != nil {
		t.Fatalf("UpdateKastamer: unexpected error: %v", err)
	}
	if updated.GetKastamer().GetNoHp() != "0812000003" {
		t.Fatalf("expected no_hp to be preserved, got %q", updated.GetKastamer().GetNoHp())
	}
	if updated.GetKastamer().GetNama() != "Budi Santoso" {
		t.Fatalf("expected nama to be updated, got %q", updated.GetKastamer().GetNama())
	}
}
