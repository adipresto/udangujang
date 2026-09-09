package server

import (
	"context"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
	transaksiv1 "udangujang/das/internal/pb/udangujang/transaksi/v1"
)

func TestCreateGetUpdateDeleteTransaksi_Roundtrip(t *testing.T) {
	s := NewTransaksiServer(newFakeTransaksiRepo())

	kg := 3.0
	hargaPerKg := 85000.0
	created, err := s.CreateTransaksi(context.Background(), &transaksiv1.CreateTransaksiRequest{Transaksi: &transaksiv1.Transaksi{
		Tanggal:    "2026-09-08",
		Keterangan: "Belanja Udang 3Kg",
		Kategori:   domain.KategoriTransaksiBelanja,
		Kg:         &kg,
		HargaPerKg: &hargaPerKg,
		Jumlah:     255000,
	}})
	if err != nil {
		t.Fatalf("unexpected error creating transaksi: %v", err)
	}
	id := created.GetTransaksi().GetId()
	if id == "" {
		t.Fatalf("expected an id to be assigned")
	}
	if created.GetTransaksi().GetUrutan() != 0 {
		t.Fatalf("expected first transaksi of the date to have urutan 0, got %d", created.GetTransaksi().GetUrutan())
	}
	if created.GetTransaksi().GetKg() != 3 || created.GetTransaksi().GetHargaPerKg() != 85000 {
		t.Fatalf("expected kg/hargaPerKg to be kept for kategori belanja: %+v", created.GetTransaksi())
	}

	got, err := s.GetTransaksi(context.Background(), &transaksiv1.GetTransaksiRequest{Id: id})
	if err != nil {
		t.Fatalf("unexpected error getting transaksi: %v", err)
	}
	if got.GetTransaksi().GetKeterangan() != "Belanja Udang 3Kg" {
		t.Fatalf("unexpected keterangan: %+v", got.GetTransaksi())
	}

	updated, err := s.UpdateTransaksi(context.Background(), &transaksiv1.UpdateTransaksiRequest{Id: id, Transaksi: &transaksiv1.Transaksi{
		Tanggal:    "2026-09-08",
		Keterangan: "Belanja Udang 3.5Kg",
		Kategori:   domain.KategoriTransaksiBelanja,
		Kg:         &kg,
		HargaPerKg: &hargaPerKg,
		Jumlah:     300000,
		Urutan:     99, // must be ignored — urutan only changes via Reorder
	}})
	if err != nil {
		t.Fatalf("unexpected error updating transaksi: %v", err)
	}
	if updated.GetTransaksi().GetJumlah() != 300000 {
		t.Fatalf("expected jumlah to update to 300000, got %d", updated.GetTransaksi().GetJumlah())
	}
	if updated.GetTransaksi().GetUrutan() != 0 {
		t.Fatalf("expected urutan to stay 0 after update, got %d", updated.GetTransaksi().GetUrutan())
	}

	if _, err := s.DeleteTransaksi(context.Background(), &transaksiv1.DeleteTransaksiRequest{Id: id}); err != nil {
		t.Fatalf("unexpected error deleting transaksi: %v", err)
	}
	if _, err := s.GetTransaksi(context.Background(), &transaksiv1.GetTransaksiRequest{Id: id}); status.Code(err) != codes.NotFound {
		t.Fatalf("expected NotFound after delete, got %v", err)
	}
}

// TestCreateTransaksi_KgNullForNonBelanja ports saveTrx()'s
// `kg: kategori === 'belanja' ? kg : null` rule (reference/
// udang-dashboard/index.html line ~4693): kg/hargaPerKg sent for a
// non-belanja kategori must be dropped, not stored.
func TestCreateTransaksi_KgNullForNonBelanja(t *testing.T) {
	s := NewTransaksiServer(newFakeTransaksiRepo())

	kg := 5.0
	created, err := s.CreateTransaksi(context.Background(), &transaksiv1.CreateTransaksiRequest{Transaksi: &transaksiv1.Transaksi{
		Tanggal:    "2026-09-08",
		Keterangan: "Sterofoam Kecil",
		Kategori:   domain.KategoriTransaksiAset,
		Kg:         &kg, // should be dropped
		Jumlah:     25000,
	}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created.GetTransaksi().GetKg() != 0 {
		t.Fatalf("expected kg to be nulled out for kategori aset, got %v", created.GetTransaksi().GetKg())
	}
}

func TestCreateTransaksi_RequiredFields(t *testing.T) {
	s := NewTransaksiServer(newFakeTransaksiRepo())

	cases := []*transaksiv1.Transaksi{
		{Keterangan: "x", Jumlah: 1},                                            // missing tanggal
		{Tanggal: "2026-09-08", Jumlah: 1},                                      // missing keterangan
		{Tanggal: "2026-09-08", Keterangan: "x"},                                // missing jumlah
		{Tanggal: "2026-09-08", Keterangan: "x", Jumlah: 1, Kategori: "ga-ada"}, // unknown kategori
	}
	for i, c := range cases {
		if _, err := s.CreateTransaksi(context.Background(), &transaksiv1.CreateTransaksiRequest{Transaksi: c}); status.Code(err) != codes.InvalidArgument {
			t.Fatalf("case %d: expected InvalidArgument, got %v", i, err)
		}
	}
}

func TestListTransaksi_FiltersByTanggalAndKategori(t *testing.T) {
	s := NewTransaksiServer(newFakeTransaksiRepo())
	ctx := context.Background()

	mustCreate := func(tanggal, kategori string, jumlah int64) {
		if _, err := s.CreateTransaksi(ctx, &transaksiv1.CreateTransaksiRequest{Transaksi: &transaksiv1.Transaksi{
			Tanggal: tanggal, Keterangan: "x", Kategori: kategori, Jumlah: jumlah,
		}}); err != nil {
			t.Fatalf("unexpected error seeding transaksi: %v", err)
		}
	}
	mustCreate("2026-09-07", domain.KategoriTransaksiAset, 1)
	mustCreate("2026-09-08", domain.KategoriTransaksiAset, 2)
	mustCreate("2026-09-08", domain.KategoriTransaksiPrive, 3)

	resp, err := s.ListTransaksi(ctx, &transaksiv1.ListTransaksiRequest{
		TanggalDari: "2026-09-08", TanggalSampai: "2026-09-08", Kategori: domain.KategoriTransaksiAset,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.GetTransaksi()) != 1 || resp.GetTransaksi()[0].GetJumlah() != 2 {
		t.Fatalf("unexpected filtered list: %+v", resp.GetTransaksi())
	}
}

// TestReorderTransaksi ports applyGroupOrder()'s behavior (reference/
// udang-dashboard/index.html lines ~4711-4721): urutan becomes each id's
// index in the given order.
func TestReorderTransaksi(t *testing.T) {
	s := NewTransaksiServer(newFakeTransaksiRepo())
	ctx := context.Background()

	var ids []string
	for i := 0; i < 3; i++ {
		resp, err := s.CreateTransaksi(ctx, &transaksiv1.CreateTransaksiRequest{Transaksi: &transaksiv1.Transaksi{
			Tanggal: "2026-09-08", Keterangan: "x", Kategori: domain.KategoriTransaksiAset, Jumlah: int64(i + 1),
		}})
		if err != nil {
			t.Fatalf("unexpected error seeding transaksi: %v", err)
		}
		ids = append(ids, resp.GetTransaksi().GetId())
	}
	// Reverse the creation order.
	reordered := []string{ids[2], ids[0], ids[1]}

	resp, err := s.ReorderTransaksi(ctx, &transaksiv1.ReorderTransaksiRequest{Tanggal: "2026-09-08", Ids: reordered})
	if err != nil {
		t.Fatalf("unexpected error reordering: %v", err)
	}
	if len(resp.GetTransaksi()) != 3 {
		t.Fatalf("expected 3 transaksi returned, got %d", len(resp.GetTransaksi()))
	}
	for i, want := range reordered {
		got := resp.GetTransaksi()[i]
		if got.GetId() != want || got.GetUrutan() != int32(i) {
			t.Fatalf("index %d: expected id %q urutan %d, got id %q urutan %d", i, want, i, got.GetId(), got.GetUrutan())
		}
	}

	// An id from another date (or an unknown id) must be rejected.
	if _, err := s.ReorderTransaksi(ctx, &transaksiv1.ReorderTransaksiRequest{Tanggal: "2026-09-08", Ids: []string{"unknown-id"}}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument for mismatched ids, got %v", err)
	}
}
