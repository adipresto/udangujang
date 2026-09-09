package server

import (
	"context"
	"errors"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"udangujang/das/internal/domain"
	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
)

// AlamatServer implements kastamerv1.AlamatServiceServer against a
// domain.AlamatRepository — see docs/architecture.md's repository pattern.
type AlamatServer struct {
	kastamerv1.UnimplementedAlamatServiceServer
	repo domain.AlamatRepository
}

func NewAlamatServer(repo domain.AlamatRepository) *AlamatServer {
	return &AlamatServer{repo: repo}
}

// CreateAlamat forces IsDefault to true when this is the Kastamer's first
// Alamat, regardless of what the caller requested — a Kastamer should
// never end up with zero default addresses.
func (s *AlamatServer) CreateAlamat(ctx context.Context, req *kastamerv1.CreateAlamatRequest) (*kastamerv1.CreateAlamatResponse, error) {
	existing, err := s.repo.ListByKastamer(ctx, req.GetKastamerId())
	if err != nil {
		return nil, err
	}

	isDefault := req.GetIsDefault()
	if len(existing) == 0 {
		isDefault = true
	}

	a, err := s.repo.Create(ctx, domain.Alamat{
		KastamerID: req.GetKastamerId(),
		WilayahID:  req.GetWilayahId(),
		Label:      req.GetLabel(),
		Alamat:     req.GetAlamat(),
		Lat:        req.GetLat(),
		Lng:        req.GetLng(),
		MapsLink:   req.GetMapsLink(),
		IsDefault:  isDefault,
	})
	if err != nil {
		return nil, err
	}
	return &kastamerv1.CreateAlamatResponse{Alamat: alamatToProto(a)}, nil
}

func (s *AlamatServer) ListAlamatByKastamer(ctx context.Context, req *kastamerv1.ListAlamatByKastamerRequest) (*kastamerv1.ListAlamatByKastamerResponse, error) {
	list, err := s.repo.ListByKastamer(ctx, req.GetKastamerId())
	if err != nil {
		return nil, err
	}
	out := make([]*kastamerv1.Alamat, 0, len(list))
	for _, a := range list {
		out = append(out, alamatToProto(a))
	}
	return &kastamerv1.ListAlamatByKastamerResponse{Alamat: out}, nil
}

func (s *AlamatServer) UpdateAlamat(ctx context.Context, req *kastamerv1.UpdateAlamatRequest) (*kastamerv1.UpdateAlamatResponse, error) {
	a, err := s.repo.Update(ctx, domain.Alamat{
		ID:        req.GetId(),
		WilayahID: req.GetWilayahId(),
		Label:     req.GetLabel(),
		Alamat:    req.GetAlamat(),
		Lat:       req.GetLat(),
		Lng:       req.GetLng(),
		MapsLink:  req.GetMapsLink(),
		IsDefault: req.GetIsDefault(),
	})
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &kastamerv1.UpdateAlamatResponse{Alamat: alamatToProto(a)}, nil
}

func alamatToProto(a domain.Alamat) *kastamerv1.Alamat {
	return &kastamerv1.Alamat{
		Id:         a.ID,
		KastamerId: a.KastamerID,
		WilayahId:  a.WilayahID,
		Label:      a.Label,
		Alamat:     a.Alamat,
		Lat:        a.Lat,
		Lng:        a.Lng,
		MapsLink:   a.MapsLink,
		IsDefault:  a.IsDefault,
		CreatedAt:  timestamppb.New(a.CreatedAt),
		UpdatedAt:  timestamppb.New(a.UpdatedAt),
	}
}
