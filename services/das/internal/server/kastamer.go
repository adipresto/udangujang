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

// KastamerServer implements kastamerv1.KastamerServiceServer against a
// domain.KastamerRepository — see docs/architecture.md's repository pattern.
type KastamerServer struct {
	kastamerv1.UnimplementedKastamerServiceServer
	repo domain.KastamerRepository
}

func NewKastamerServer(repo domain.KastamerRepository) *KastamerServer {
	return &KastamerServer{repo: repo}
}

func (s *KastamerServer) CreateKastamer(ctx context.Context, req *kastamerv1.CreateKastamerRequest) (*kastamerv1.CreateKastamerResponse, error) {
	k, err := s.repo.Create(ctx, domain.Kastamer{
		Nama:    req.GetNama(),
		NoHp:    req.GetNoHp(),
		Catatan: req.GetCatatan(),
	})
	if err != nil {
		if errors.Is(err, domain.ErrDuplicateNoHp) {
			return nil, status.Error(codes.AlreadyExists, err.Error())
		}
		return nil, err
	}
	return &kastamerv1.CreateKastamerResponse{Kastamer: kastamerToProto(k)}, nil
}

func (s *KastamerServer) GetKastamerByNoHp(ctx context.Context, req *kastamerv1.GetKastamerByNoHpRequest) (*kastamerv1.GetKastamerByNoHpResponse, error) {
	k, err := s.repo.GetByNoHp(ctx, req.GetNoHp())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &kastamerv1.GetKastamerByNoHpResponse{Kastamer: kastamerToProto(k)}, nil
}

func (s *KastamerServer) ListKastamer(ctx context.Context, req *kastamerv1.ListKastamerRequest) (*kastamerv1.ListKastamerResponse, error) {
	list, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*kastamerv1.Kastamer, 0, len(list))
	for _, k := range list {
		out = append(out, kastamerToProto(k))
	}
	return &kastamerv1.ListKastamerResponse{Kastamer: out}, nil
}

func (s *KastamerServer) UpdateKastamer(ctx context.Context, req *kastamerv1.UpdateKastamerRequest) (*kastamerv1.UpdateKastamerResponse, error) {
	k, err := s.repo.Update(ctx, domain.Kastamer{
		ID:      req.GetId(),
		Nama:    req.GetNama(),
		Catatan: req.GetCatatan(),
	})
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &kastamerv1.UpdateKastamerResponse{Kastamer: kastamerToProto(k)}, nil
}

func kastamerToProto(k domain.Kastamer) *kastamerv1.Kastamer {
	return &kastamerv1.Kastamer{
		Id:        k.ID,
		Nama:      k.Nama,
		NoHp:      k.NoHp,
		Catatan:   k.Catatan,
		CreatedAt: timestamppb.New(k.CreatedAt),
		UpdatedAt: timestamppb.New(k.UpdatedAt),
	}
}
