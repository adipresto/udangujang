package server

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthv1 "udangujang/das/internal/pb/udangujang/health/v1"
)

func TestCheckServing(t *testing.T) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := grpc.NewServer()
	healthv1.RegisterHealthServiceServer(s, NewHealthServer())
	go s.Serve(lis)
	defer s.Stop()

	conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	c := healthv1.NewHealthServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := c.Check(ctx, &healthv1.HealthCheckRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Status != healthv1.HealthCheckResponse_SERVING_STATUS_SERVING {
		t.Fatalf("unexpected status: %s", resp.Status)
	}
	t.Logf("STATUS=%s MESSAGE=%s", resp.Status, resp.Message)
}
