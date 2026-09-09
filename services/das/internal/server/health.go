// Package server implements the gRPC service handlers exposed by DAS.
//
// Handlers here must depend only on repository interfaces (see
// docs/architecture.md's repository pattern), never on a storage SDK
// directly, so that swapping Firestore for PostgreSQL later does not
// change this package.
package server

import (
	"context"

	healthv1 "udangujang/das/internal/pb/udangujang/health/v1"
)

// HealthServer implements healthv1.HealthServiceServer. It has no
// dependencies today because there is nothing to check yet beyond the
// process being up; once DAS gains a storage backend, Check should also
// report on that backend's reachability.
type HealthServer struct {
	healthv1.UnimplementedHealthServiceServer
}

func NewHealthServer() *HealthServer {
	return &HealthServer{}
}

func (s *HealthServer) Check(ctx context.Context, req *healthv1.HealthCheckRequest) (*healthv1.HealthCheckResponse, error) {
	return &healthv1.HealthCheckResponse{
		Status:  healthv1.HealthCheckResponse_SERVING_STATUS_SERVING,
		Message: "das ok",
	}, nil
}
