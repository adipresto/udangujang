package server

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
	transaksiv1 "udangujang/das/internal/pb/udangujang/transaksi/v1"
)

// TransaksiServer implements transaksiv1.TransaksiServiceServer — a
// standalone bookkeeping ledger, not linked to Pesanan/Kastamer.
type TransaksiServer struct {
	transaksiv1.UnimplementedTransaksiServiceServer
	repo domain.TransaksiRepository
}

func NewTransaksiServer(repo domain.TransaksiRepository) *TransaksiServer {
	return &TransaksiServer{repo: repo}
}

var validKategoriTransaksi = map[string]bool{
	domain.KategoriTransaksiBelanja:     true,
	domain.KategoriTransaksiAset:        true,
	domain.KategoriTransaksiPrive:       true,
	domain.KategoriTransaksiPenyesuaian: true,
}

func (s *TransaksiServer) CreateTransaksi(ctx context.Context, req *transaksiv1.CreateTransaksiRequest) (*transaksiv1.CreateTransaksiResponse, error) {
	t, err := transaksiFromProto(req.GetTransaksi())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	created, err := s.repo.Create(ctx, t)
	if err != nil {
		return nil, err
	}
	return &transaksiv1.CreateTransaksiResponse{Transaksi: transaksiToProto(created)}, nil
}

func (s *TransaksiServer) GetTransaksi(ctx context.Context, req *transaksiv1.GetTransaksiRequest) (*transaksiv1.GetTransaksiResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id wajib diisi")
	}
	t, err := s.repo.GetByID(ctx, req.GetId())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &transaksiv1.GetTransaksiResponse{Transaksi: transaksiToProto(t)}, nil
}

func (s *TransaksiServer) ListTransaksi(ctx context.Context, req *transaksiv1.ListTransaksiRequest) (*transaksiv1.ListTransaksiResponse, error) {
	list, err := s.repo.List(ctx, domain.TransaksiFilter{
		TanggalDari:   req.GetTanggalDari(),
		TanggalSampai: req.GetTanggalSampai(),
		Kategori:      req.GetKategori(),
		Limit:         int(req.GetLimit()),
	})
	if err != nil {
		return nil, err
	}
	out := make([]*transaksiv1.Transaksi, 0, len(list))
	for _, t := range list {
		out = append(out, transaksiToProto(t))
	}
	return &transaksiv1.ListTransaksiResponse{Transaksi: out}, nil
}

func (s *TransaksiServer) UpdateTransaksi(ctx context.Context, req *transaksiv1.UpdateTransaksiRequest) (*transaksiv1.UpdateTransaksiResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id wajib diisi")
	}
	t, err := transaksiFromProto(req.GetTransaksi())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	t.ID = req.GetId()
	updated, err := s.repo.Update(ctx, t)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &transaksiv1.UpdateTransaksiResponse{Transaksi: transaksiToProto(updated)}, nil
}

func (s *TransaksiServer) DeleteTransaksi(ctx context.Context, req *transaksiv1.DeleteTransaksiRequest) (*transaksiv1.DeleteTransaksiResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id wajib diisi")
	}
	if err := s.repo.Delete(ctx, req.GetId()); err != nil {
		return nil, err
	}
	return &transaksiv1.DeleteTransaksiResponse{}, nil
}

func (s *TransaksiServer) ReorderTransaksi(ctx context.Context, req *transaksiv1.ReorderTransaksiRequest) (*transaksiv1.ReorderTransaksiResponse, error) {
	if req.GetTanggal() == "" {
		return nil, status.Error(codes.InvalidArgument, "tanggal wajib diisi")
	}
	if len(req.GetIds()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "ids wajib diisi")
	}
	reordered, err := s.repo.Reorder(ctx, req.GetTanggal(), req.GetIds())
	if err != nil {
		if errors.Is(err, domain.ErrReorderMismatch) {
			return nil, status.Error(codes.InvalidArgument, err.Error())
		}
		return nil, err
	}
	out := make([]*transaksiv1.Transaksi, 0, len(reordered))
	for _, t := range reordered {
		out = append(out, transaksiToProto(t))
	}
	return &transaksiv1.ReorderTransaksiResponse{Transaksi: out}, nil
}

func transaksiToProto(t domain.Transaksi) *transaksiv1.Transaksi {
	return &transaksiv1.Transaksi{
		Id:         t.ID,
		Tanggal:    t.Tanggal,
		Keterangan: t.Keterangan,
		Kategori:   t.Kategori,
		Kg:         t.Kg,
		HargaPerKg: t.HargaPerKg,
		Jumlah:     t.Jumlah,
		Urutan:     int32(t.Urutan),
		CreatedAt:  timeToProtoOrNil(t.CreatedAt),
		UpdatedAt:  timeToProtoOrNil(t.UpdatedAt),
	}
}

// transaksiFromProto ports saveTrx()'s validation (reference/
// udang-dashboard/index.html lines ~4681-4699): tanggal, keterangan, and a
// non-zero jumlah are required. kg/hargaPerKg are only kept when kategori
// is "belanja" — every other kategori forces them to nil server-side,
// regardless of what the caller sent.
func transaksiFromProto(t *transaksiv1.Transaksi) (domain.Transaksi, error) {
	if t == nil || t.GetTanggal() == "" {
		return domain.Transaksi{}, fmt.Errorf("transaksi: tanggal wajib diisi")
	}
	if t.GetKeterangan() == "" {
		return domain.Transaksi{}, fmt.Errorf("transaksi: keterangan wajib diisi")
	}
	kategori := t.GetKategori()
	if kategori == "" {
		kategori = domain.KategoriTransaksiBelanja
	}
	if !validKategoriTransaksi[kategori] {
		return domain.Transaksi{}, fmt.Errorf("transaksi: kategori %q tidak dikenal", kategori)
	}
	if t.GetJumlah() == 0 {
		return domain.Transaksi{}, fmt.Errorf("transaksi: jumlah wajib diisi")
	}

	out := domain.Transaksi{
		Tanggal:    t.GetTanggal(),
		Keterangan: t.GetKeterangan(),
		Kategori:   kategori,
		Jumlah:     t.GetJumlah(),
	}
	if kategori == domain.KategoriTransaksiBelanja {
		out.Kg = t.Kg
		out.HargaPerKg = t.HargaPerKg
	}
	return out, nil
}
