// Command das runs the Data Access Service gRPC server — the only process
// allowed to talk to the database (see docs/architecture.md). This scaffold
// only wires the health-check RPC; entity RPCs and the repository layer
// land in later tickets.
package main

import (
	"log"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	healthv1 "udangujang/das/internal/pb/udangujang/health/v1"
	"udangujang/das/internal/server"
)

func main() {
	addr := os.Getenv("DAS_GRPC_ADDR")
	if addr == "" {
		addr = ":50051"
	}

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("das: failed to listen on %s: %v", addr, err)
	}

	grpcServer := grpc.NewServer()
	healthv1.RegisterHealthServiceServer(grpcServer, server.NewHealthServer())
	reflection.Register(grpcServer)

	log.Printf("das: gRPC server listening on %s", addr)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("das: server stopped: %v", err)
	}
}
