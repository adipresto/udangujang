// Command das runs the Data Access Service gRPC server — the only process
// allowed to talk to the database (see docs/architecture.md). This scaffold
// only wires the health-check RPC; entity RPCs and the repository layer
// land in later tickets.
package main

import (
	"context"
	"log"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	hargav1 "udangujang/das/internal/pb/udangujang/harga/v1"
	healthv1 "udangujang/das/internal/pb/udangujang/health/v1"
	kastamerv1 "udangujang/das/internal/pb/udangujang/kastamer/v1"
	pesananv1 "udangujang/das/internal/pb/udangujang/pesanan/v1"
	rutev1 "udangujang/das/internal/pb/udangujang/rute/v1"
	transaksiv1 "udangujang/das/internal/pb/udangujang/transaksi/v1"
	"udangujang/das/internal/server"
	fsstore "udangujang/das/internal/store/firestore"
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

	fsClient, err := fsstore.NewClient(context.Background())
	if err != nil {
		log.Fatalf("das: failed to init firestore client: %v", err)
	}
	defer fsClient.Close()

	wilayahRepo := fsstore.NewWilayahRepository(fsClient)
	kastamerRepo := fsstore.NewKastamerRepository(fsClient)
	alamatRepo := fsstore.NewAlamatRepository(fsClient)
	pesananRepo := fsstore.NewPesananRepository(fsClient)
	promoRepo := fsstore.NewPromoRepository(fsClient)
	hargaRepo := fsstore.NewHargaRepository(fsClient)
	transaksiRepo := fsstore.NewTransaksiRepository(fsClient)
	ruteRepo := fsstore.NewRuteRepository(fsClient)

	grpcServer := grpc.NewServer()
	healthv1.RegisterHealthServiceServer(grpcServer, server.NewHealthServer())
	kastamerv1.RegisterWilayahServiceServer(grpcServer, server.NewWilayahServer(wilayahRepo))
	kastamerv1.RegisterKastamerServiceServer(grpcServer, server.NewKastamerServer(kastamerRepo))
	kastamerv1.RegisterAlamatServiceServer(grpcServer, server.NewAlamatServer(alamatRepo))
	pesananv1.RegisterPesananServiceServer(grpcServer, server.NewPesananServer(pesananRepo, kastamerRepo, alamatRepo, promoRepo))
	hargav1.RegisterHargaServiceServer(grpcServer, server.NewHargaServer(hargaRepo, promoRepo))
	transaksiv1.RegisterTransaksiServiceServer(grpcServer, server.NewTransaksiServer(transaksiRepo))
	rutev1.RegisterRuteServiceServer(grpcServer, server.NewRuteServer(ruteRepo))
	reflection.Register(grpcServer)

	log.Printf("das: gRPC server listening on %s", addr)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("das: server stopped: %v", err)
	}
}
