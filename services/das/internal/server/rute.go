package server

import (
	"context"
	"errors"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
	rutev1 "udangujang/das/internal/pb/udangujang/rute/v1"
)

// RuteServer implements rutev1.RuteServiceServer — daily route order plus
// the single depot point. Standalone: does not join Pesanan/Alamat, that
// join happens SSR-side.
type RuteServer struct {
	rutev1.UnimplementedRuteServiceServer
	repo domain.RuteRepository
}

func NewRuteServer(repo domain.RuteRepository) *RuteServer {
	return &RuteServer{repo: repo}
}

func (s *RuteServer) GetRute(ctx context.Context, req *rutev1.GetRuteRequest) (*rutev1.GetRuteResponse, error) {
	if req.GetTanggal() == "" {
		return nil, status.Error(codes.InvalidArgument, "tanggal wajib diisi")
	}
	rute, err := s.repo.Get(ctx, req.GetTanggal())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return &rutev1.GetRuteResponse{}, nil
		}
		return nil, err
	}
	return &rutev1.GetRuteResponse{Rute: ruteToProto(rute)}, nil
}

func (s *RuteServer) SaveRute(ctx context.Context, req *rutev1.SaveRuteRequest) (*rutev1.SaveRuteResponse, error) {
	if req.GetTanggal() == "" {
		return nil, status.Error(codes.InvalidArgument, "tanggal wajib diisi")
	}
	rute, err := s.repo.Save(ctx, req.GetTanggal(), req.GetPesananIds())
	if err != nil {
		return nil, err
	}
	return &rutev1.SaveRuteResponse{Rute: ruteToProto(rute)}, nil
}

func (s *RuteServer) DeleteRute(ctx context.Context, req *rutev1.DeleteRuteRequest) (*rutev1.DeleteRuteResponse, error) {
	if req.GetTanggal() == "" {
		return nil, status.Error(codes.InvalidArgument, "tanggal wajib diisi")
	}
	if err := s.repo.Delete(ctx, req.GetTanggal()); err != nil {
		return nil, err
	}
	return &rutev1.DeleteRuteResponse{}, nil
}

func (s *RuteServer) GetDepot(ctx context.Context, _ *rutev1.GetDepotRequest) (*rutev1.GetDepotResponse, error) {
	depot, err := s.repo.GetDepot(ctx)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return &rutev1.GetDepotResponse{}, nil
		}
		return nil, err
	}
	return &rutev1.GetDepotResponse{Depot: depotToProto(depot)}, nil
}

// UpdateDepot ports saveDepot()'s validation (reference/udang-dashboard/
// index.html ~3204-3216): nama and non-zero lat/lng are required.
func (s *RuteServer) UpdateDepot(ctx context.Context, req *rutev1.UpdateDepotRequest) (*rutev1.UpdateDepotResponse, error) {
	d := req.GetDepot()
	if d.GetNama() == "" {
		return nil, status.Error(codes.InvalidArgument, "nama wajib diisi")
	}
	if d.GetLat() == 0 || d.GetLng() == 0 {
		return nil, status.Error(codes.InvalidArgument, "lat dan lng wajib diisi")
	}
	updated, err := s.repo.UpdateDepot(ctx, domain.Depot{
		Nama:     d.GetNama(),
		Alamat:   d.GetAlamat(),
		Lat:      d.GetLat(),
		Lng:      d.GetLng(),
		MapsLink: d.GetMapsLink(),
	})
	if err != nil {
		return nil, err
	}
	return &rutev1.UpdateDepotResponse{Depot: depotToProto(updated)}, nil
}

func ruteToProto(r domain.RuteHarian) *rutev1.RuteHarian {
	return &rutev1.RuteHarian{
		Tanggal:    r.Tanggal,
		PesananIds: r.PesananIDs,
		CreatedAt:  timeToProtoOrNil(r.CreatedAt),
		UpdatedAt:  timeToProtoOrNil(r.UpdatedAt),
	}
}

func depotToProto(d domain.Depot) *rutev1.Depot {
	return &rutev1.Depot{
		Nama:     d.Nama,
		Alamat:   d.Alamat,
		Lat:      d.Lat,
		Lng:      d.Lng,
		MapsLink: d.MapsLink,
	}
}
