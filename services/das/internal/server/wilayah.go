package server

import (
	"context"

	"google.golang.org/protobuf/types/known/timestamppb"

	"udangujang/das/internal/domain"
	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
)

// WilayahServer implements kastamerv1.WilayahServiceServer against a
// domain.WilayahRepository — see docs/architecture.md's repository pattern.
type WilayahServer struct {
	kastamerv1.UnimplementedWilayahServiceServer
	repo domain.WilayahRepository
}

func NewWilayahServer(repo domain.WilayahRepository) *WilayahServer {
	return &WilayahServer{repo: repo}
}

func (s *WilayahServer) CreateWilayah(ctx context.Context, req *kastamerv1.CreateWilayahRequest) (*kastamerv1.CreateWilayahResponse, error) {
	w, err := s.repo.Create(ctx, domain.Wilayah{
		Nama:     req.GetNama(),
		Kota:     req.GetKota(),
		Provinsi: req.GetProvinsi(),
	})
	if err != nil {
		return nil, err
	}
	return &kastamerv1.CreateWilayahResponse{Wilayah: wilayahToProto(w)}, nil
}

func (s *WilayahServer) ListWilayah(ctx context.Context, req *kastamerv1.ListWilayahRequest) (*kastamerv1.ListWilayahResponse, error) {
	list, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*kastamerv1.Wilayah, 0, len(list))
	for _, w := range list {
		out = append(out, wilayahToProto(w))
	}
	return &kastamerv1.ListWilayahResponse{Wilayah: out}, nil
}

func wilayahToProto(w domain.Wilayah) *kastamerv1.Wilayah {
	return &kastamerv1.Wilayah{
		Id:        w.ID,
		Nama:      w.Nama,
		Kota:      w.Kota,
		Provinsi:  w.Provinsi,
		CreatedAt: timestamppb.New(w.CreatedAt),
	}
}
